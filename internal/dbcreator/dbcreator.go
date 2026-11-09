package dbcreator

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
	"pulsares-file-explorer/internal/platform"
)

type ColumnDef struct {
	Name         string `json:"name"`
	DataType     string `json:"dataType"` // INTEGER, REAL, TEXT, BOOLEAN, DATETIME
	IsPrimaryKey bool   `json:"isPrimaryKey"`
	NotNull      bool   `json:"notNull"`
}

type SourceInspection struct {
	SourcePath      string                 `json:"sourcePath"`
	Format          string                 `json:"format"` // csv, tsv, json, jsonl
	DetectedDelim   string                 `json:"detectedDelim"`
	HasHeader       bool                   `json:"hasHeader"`
	EstimatedRows   int64                  `json:"estimatedRows"`
	FileSize        int64                  `json:"fileSize"`
	SuggestedTable  string                 `json:"suggestedTable"`
	SuggestedDBName string                 `json:"suggestedDBName"`
	Columns         []ColumnDef            `json:"columns"`
	SampleRows      [][]string             `json:"sampleRows"`
	RawSampleJSON   []map[string]interface{} `json:"rawSampleJson,omitempty"`
}

type CreateDBRequest struct {
	SourcePath       string      `json:"sourcePath"`
	DestinationPath  string      `json:"destinationPath"`
	TableName        string      `json:"tableName"`
	Columns          []ColumnDef `json:"columns"`
	AddAutoID        bool        `json:"addAutoId"`
	Delimiter        string      `json:"delimiter"`
	HasHeader        bool        `json:"hasHeader"`
	BatchSize        int         `json:"batchSize"`
	EnableWAL        bool        `json:"enableWal"`
	CustomDDL        string      `json:"customDdl,omitempty"`
}

type ProgressEvent struct {
	Stage          string  `json:"stage"` // "analyzing", "creating_schema", "importing", "finalizing", "completed", "error"
	ProcessedRows  int64   `json:"processedRows"`
	TotalRows      int64   `json:"totalRows"`
	Percentage     float64 `json:"percentage"`
	SpeedRowsSec   int64   `json:"speedRowsSec"`
	ElapsedMs      int64   `json:"elapsedMs"`
	EstimatedRemMs int64   `json:"estimatedRemMs"`
	CurrentLog     string  `json:"currentLog,omitempty"`
}

type CreateDBResult struct {
	DestinationPath string `json:"destinationPath"`
	TableName       string `json:"tableName"`
	TotalRows       int64  `json:"totalRows"`
	TotalDurationMs int64  `json:"totalDurationMs"`
	FinalFileSizeBytes int64 `json:"finalFileSizeBytes"`
	DDLExecuted     string `json:"ddlExecuted"`
}

type ProgressCallback func(event ProgressEvent)

var validColumnNameRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// SanitizeIdentifier sanitiza nomes de tabela e coluna para SQL seguro
func SanitizeIdentifier(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "col"
	}
	// Substituir espaços, hífens e pontos por underscore
	reg := regexp.MustCompile(`[^a-zA-Z0-9_]`)
	cleaned := reg.ReplaceAllString(trimmed, "_")
	// Se começar com dígito, prefixar com 'c_'
	if len(cleaned) > 0 && cleaned[0] >= '0' && cleaned[0] <= '9' {
		cleaned = "c_" + cleaned
	}
	if cleaned == "" {
		cleaned = "col"
	}
	return cleaned
}

// DetectDelimiter analisa as primeiras linhas para identificar vírgula, ponto-e-vírgula, tabulação ou pipe
func DetectDelimiter(lines []string) rune {
	delims := []rune{',', ';', '\t', '|'}
	bestDelim := ','
	highestCount := 0

	for _, d := range delims {
		counts := make([]int, 0, len(lines))
		for _, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			c := strings.Count(line, string(d))
			counts = append(counts, c)
		}
		if len(counts) == 0 {
			continue
		}
		// Verificar se a contagem é consistente (> 0 e igual em quase todas as linhas)
		first := counts[0]
		if first > 0 {
			consistent := true
			total := 0
			for _, cnt := range counts {
				if cnt != first {
					consistent = false
				}
				total += cnt
			}
			if consistent && total > highestCount {
				highestCount = total
				bestDelim = d
			} else if total > highestCount {
				highestCount = total
				bestDelim = d
			}
		}
	}
	return bestDelim
}

// InferType avalia amostras de strings para deduzir o tipo SQLite mais apropriado
func InferType(samples []string) string {
	if len(samples) == 0 {
		return "TEXT"
	}

	allInt := true
	allReal := true
	allBool := true

	nonEmptyCount := 0
	for _, raw := range samples {
		val := strings.TrimSpace(raw)
		if val == "" || strings.EqualFold(val, "null") || strings.EqualFold(val, "nil") {
			continue
		}
		nonEmptyCount++

		// Checar bool
		lower := strings.ToLower(val)
		if lower != "true" && lower != "false" && lower != "1" && lower != "0" && lower != "t" && lower != "f" {
			allBool = false
		}

		// Checar int
		if _, err := strconv.ParseInt(val, 10, 64); err != nil {
			allInt = false
		}

		// Checar real/float
		if _, err := strconv.ParseFloat(val, 64); err != nil {
			allReal = false
		}
	}

	if nonEmptyCount == 0 {
		return "TEXT"
	}
	if allInt {
		return "INTEGER"
	}
	if allReal {
		return "REAL"
	}
	if allBool && nonEmptyCount > 1 {
		return "BOOLEAN"
	}
	return "TEXT"
}

// InspectSource analisa o arquivo e extrai metadados, colunas inferidas e amostras
func InspectSource(sourcePath string) (*SourceInspection, error) {
	cleanPath := filepath.Clean(sourcePath)
	fileInfo, err := os.Stat(platform.NormalizeLongPath(cleanPath))
	if err != nil {
		return nil, err
	}

	f, err := os.Open(platform.NormalizeLongPath(cleanPath))
	if err != nil {
		return nil, err
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(cleanPath))
	baseName := strings.TrimSuffix(filepath.Base(cleanPath), filepath.Ext(cleanPath))
	suggestedTable := SanitizeIdentifier(baseName)
	suggestedDBName := baseName + ".db"

	inspection := &SourceInspection{
		SourcePath:      cleanPath,
		FileSize:        fileInfo.Size(),
		SuggestedTable:  suggestedTable,
		SuggestedDBName: suggestedDBName,
		HasHeader:       true,
	}

	switch ext {
	case ".json":
		inspection.Format = "json"
		return inspectJSON(f, inspection)
	case ".jsonl", ".ndjson":
		inspection.Format = "jsonl"
		return inspectJSONL(f, inspection)
	default:
		// Tratar como CSV/TSV por padrão
		if ext == ".tsv" || ext == ".tab" {
			inspection.Format = "tsv"
		} else {
			inspection.Format = "csv"
		}
		return inspectCSV(f, inspection, fileInfo.Size())
	}
}

func inspectCSV(r io.Reader, inspection *SourceInspection, fileSize int64) (*SourceInspection, error) {
	scanner := bufio.NewScanner(r)
	// Aumentar buffer para linhas grandes
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)

	var sampleLines []string
	totalLinesRead := int64(0)
	for scanner.Scan() && len(sampleLines) < 100 {
		txt := scanner.Text()
		if strings.TrimSpace(txt) != "" {
			sampleLines = append(sampleLines, txt)
		}
		totalLinesRead++
	}

	if len(sampleLines) == 0 {
		return nil, errors.New("arquivo vazio ou sem linhas de dados legíveis")
	}

	delim := DetectDelimiter(sampleLines)
	if inspection.Format == "tsv" {
		delim = '\t'
	}
	inspection.DetectedDelim = string(delim)

	// Estimar total de linhas com base no tamanho do arquivo e média de bytes por linha
	totalSampleBytes := 0
	for _, l := range sampleLines {
		totalSampleBytes += len(l) + 1
	}
	if totalSampleBytes > 0 && fileSize > 0 {
		avgLineLen := float64(totalSampleBytes) / float64(len(sampleLines))
		inspection.EstimatedRows = int64(float64(fileSize) / avgLineLen)
		if inspection.EstimatedRows < int64(len(sampleLines)) {
			inspection.EstimatedRows = int64(len(sampleLines))
		}
	} else {
		inspection.EstimatedRows = int64(len(sampleLines))
	}

	// Ler CSV a partir das sampleLines
	combined := strings.Join(sampleLines, "\n")
	csvReader := csv.NewReader(strings.NewReader(combined))
	csvReader.Comma = delim
	csvReader.FieldsPerRecord = -1 // Permitir flexibilidade se houver campos faltantes
	csvReader.LazyQuotes = true

	records, err := csvReader.ReadAll()
	if err != nil && len(records) == 0 {
		return nil, fmt.Errorf("falha ao interpretar estrutura CSV: %w", err)
	}

	if len(records) == 0 {
		return nil, errors.New("nenhum registro CSV detectado")
	}

	headerRow := records[0]
	dataRows := records[1:]

	colCount := len(headerRow)
	colNames := make([]string, colCount)
	usedNames := make(map[string]int)

	for i, h := range headerRow {
		cleaned := SanitizeIdentifier(h)
		if count, exists := usedNames[cleaned]; exists {
			usedNames[cleaned]++
			cleaned = fmt.Sprintf("%s_%d", cleaned, count+1)
		} else {
			usedNames[cleaned] = 1
		}
		colNames[i] = cleaned
	}

	// Extrair amostras por coluna para inferência de tipos
	columns := make([]ColumnDef, colCount)
	for colIdx := 0; colIdx < colCount; colIdx++ {
		var colSamples []string
		for rowIdx := 0; rowIdx < len(dataRows) && rowIdx < 50; rowIdx++ {
			if colIdx < len(dataRows[rowIdx]) {
				colSamples = append(colSamples, dataRows[rowIdx][colIdx])
			}
		}
		inferred := InferType(colSamples)
		columns[colIdx] = ColumnDef{
			Name:     colNames[colIdx],
			DataType: inferred,
		}
	}

	// Preparar preview de linhas
	previewRows := make([][]string, 0, 10)
	for i := 0; i < len(dataRows) && i < 10; i++ {
		row := make([]string, colCount)
		for j := 0; j < colCount; j++ {
			if j < len(dataRows[i]) {
				row[j] = dataRows[i][j]
			}
		}
		previewRows = append(previewRows, row)
	}

	inspection.Columns = columns
	inspection.SampleRows = previewRows
	return inspection, nil
}

func inspectJSON(r io.Reader, inspection *SourceInspection) (*SourceInspection, error) {
	data, err := io.ReadAll(io.LimitReader(r, 10*1024*1024))
	if err != nil {
		return nil, err
	}

	var arrayObjects []map[string]interface{}
	if err := json.Unmarshal(data, &arrayObjects); err != nil {
		// Tentar como objeto único
		var singleObj map[string]interface{}
		if err2 := json.Unmarshal(data, &singleObj); err2 == nil {
			arrayObjects = []map[string]interface{}{singleObj}
		} else {
			return nil, fmt.Errorf("formato JSON não representa lista de registros estruturados: %w", err)
		}
	}

	if len(arrayObjects) == 0 {
		return nil, errors.New("arquivo JSON não contém itens ou registros")
	}

	inspection.EstimatedRows = int64(len(arrayObjects))
	colMap := make(map[string]string)
	colOrder := make([]string, 0)

	for _, obj := range arrayObjects {
		for k, v := range obj {
			sanitized := SanitizeIdentifier(k)
			if _, exists := colMap[sanitized]; !exists {
				colOrder = append(colOrder, sanitized)
				switch v.(type) {
				case int, int64, float64:
					if f, ok := v.(float64); ok && f == float64(int64(f)) {
						colMap[sanitized] = "INTEGER"
					} else {
						colMap[sanitized] = "REAL"
					}
				case bool:
					colMap[sanitized] = "BOOLEAN"
				default:
					colMap[sanitized] = "TEXT"
				}
			}
		}
	}

	columns := make([]ColumnDef, 0, len(colOrder))
	for _, col := range colOrder {
		columns = append(columns, ColumnDef{
			Name:     col,
			DataType: colMap[col],
		})
	}

	previewRows := make([][]string, 0, 10)
	for i := 0; i < len(arrayObjects) && i < 10; i++ {
		row := make([]string, len(columns))
		for j, col := range columns {
			val := arrayObjects[i][col.Name]
			if val == nil {
				row[j] = ""
			} else {
				row[j] = fmt.Sprintf("%v", val)
			}
		}
		previewRows = append(previewRows, row)
	}

	inspection.Columns = columns
	inspection.SampleRows = previewRows
	if len(arrayObjects) > 10 {
		inspection.RawSampleJSON = arrayObjects[:10]
	} else {
		inspection.RawSampleJSON = arrayObjects
	}
	return inspection, nil
}

func inspectJSONL(r io.Reader, inspection *SourceInspection) (*SourceInspection, error) {
	scanner := bufio.NewScanner(r)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)

	var arrayObjects []map[string]interface{}
	lineCount := int64(0)
	for scanner.Scan() {
		lineCount++
		txt := strings.TrimSpace(scanner.Text())
		if txt == "" {
			continue
		}
		if len(arrayObjects) < 50 {
			var obj map[string]interface{}
			if err := json.Unmarshal([]byte(txt), &obj); err == nil {
				arrayObjects = append(arrayObjects, obj)
			}
		}
	}

	if len(arrayObjects) == 0 {
		return nil, errors.New("nenhuma linha JSON válida encontrada")
	}

	inspection.EstimatedRows = lineCount
	colMap := make(map[string]string)
	colOrder := make([]string, 0)

	for _, obj := range arrayObjects {
		for k, v := range obj {
			sanitized := SanitizeIdentifier(k)
			if _, exists := colMap[sanitized]; !exists {
				colOrder = append(colOrder, sanitized)
				switch v.(type) {
				case int, int64, float64:
					if f, ok := v.(float64); ok && f == float64(int64(f)) {
						colMap[sanitized] = "INTEGER"
					} else {
						colMap[sanitized] = "REAL"
					}
				case bool:
					colMap[sanitized] = "BOOLEAN"
				default:
					colMap[sanitized] = "TEXT"
				}
			}
		}
	}

	columns := make([]ColumnDef, 0, len(colOrder))
	for _, col := range colOrder {
		columns = append(columns, ColumnDef{
			Name:     col,
			DataType: colMap[col],
		})
	}

	previewRows := make([][]string, 0, 10)
	for i := 0; i < len(arrayObjects) && i < 10; i++ {
		row := make([]string, len(columns))
		for j, col := range columns {
			val := arrayObjects[i][col.Name]
			if val == nil {
				row[j] = ""
			} else {
				row[j] = fmt.Sprintf("%v", val)
			}
		}
		previewRows = append(previewRows, row)
	}

	inspection.Columns = columns
	inspection.SampleRows = previewRows
	return inspection, nil
}

// BuildCreateTableDDL gera a instrução SQL CREATE TABLE com base nos parâmetros
func BuildCreateTableDDL(tableName string, columns []ColumnDef, addAutoID bool) string {
	sanitizedTable := SanitizeIdentifier(tableName)
	var colDefs []string

	if addAutoID {
		colDefs = append(colDefs, `  "id" INTEGER PRIMARY KEY AUTOINCREMENT`)
	}

	for _, col := range columns {
		def := fmt.Sprintf(`  "%s" %s`, SanitizeIdentifier(col.Name), col.DataType)
		if col.IsPrimaryKey && !addAutoID {
			def += " PRIMARY KEY"
		}
		if col.NotNull {
			def += " NOT NULL"
		}
		colDefs = append(colDefs, def)
	}

	return fmt.Sprintf("CREATE TABLE IF NOT EXISTS \"%s\" (\n%s\n);", sanitizedTable, strings.Join(colDefs, ",\n"))
}

// CreateDatabase executa a injeção dos dados e criação da tabela com streaming de progresso
func CreateDatabase(ctx context.Context, req CreateDBRequest, onProgress ProgressCallback) (*CreateDBResult, error) {
	startTime := time.Now()
	cleanDest := filepath.Clean(req.DestinationPath)
	cleanSrc := filepath.Clean(req.SourcePath)

	if onProgress != nil {
		onProgress(ProgressEvent{
			Stage:      "analyzing",
			CurrentLog: fmt.Sprintf("[INIT] Iniciando criação do banco SQLite em %s", cleanDest),
		})
	}

	// Assegurar diretório pai
	if err := os.MkdirAll(filepath.Dir(cleanDest), 0755); err != nil {
		return nil, fmt.Errorf("falha ao criar pasta de destino: %w", err)
	}

	// Abrir/criar banco de dados SQLite
	db, err := sql.Open("sqlite", platform.NormalizeLongPath(cleanDest))
	if err != nil {
		return nil, fmt.Errorf("falha ao abrir banco de dados SQLite: %w", err)
	}
	defer db.Close()

	// Configurar PRAGMAs para injeção rápida em massa
	pragmas := []string{
		"PRAGMA synchronous = OFF;",
		"PRAGMA journal_mode = MEMORY;",
		"PRAGMA temp_store = MEMORY;",
		"PRAGMA cache_size = 200000;",
	}
	for _, p := range pragmas {
		if _, err := db.ExecContext(ctx, p); err != nil {
			// Se falhar algum pragma, continuar
		}
	}

	if onProgress != nil {
		onProgress(ProgressEvent{
			Stage:      "creating_schema",
			CurrentLog: "[PRAGMA] Configurados synchronous=OFF e journal_mode=MEMORY para alta velocidade.",
		})
	}

	// Gerar DDL e criar tabela
	ddl := req.CustomDDL
	if strings.TrimSpace(ddl) == "" {
		ddl = BuildCreateTableDDL(req.TableName, req.Columns, req.AddAutoID)
	}

	if _, err := db.ExecContext(ctx, ddl); err != nil {
		return nil, fmt.Errorf("falha ao executar DDL da tabela: %w", err)
	}

	if onProgress != nil {
		onProgress(ProgressEvent{
			Stage:      "creating_schema",
			CurrentLog: fmt.Sprintf("[DDL] Tabela criada com sucesso:\n%s", ddl),
		})
	}

	// Preparar statement de inserção
	tableName := SanitizeIdentifier(req.TableName)
	var colNames []string
	var placeholders []string
	for _, col := range req.Columns {
		colNames = append(colNames, fmt.Sprintf(`"%s"`, SanitizeIdentifier(col.Name)))
		placeholders = append(placeholders, "?")
	}

	insertSQL := fmt.Sprintf(`INSERT INTO "%s" (%s) VALUES (%s)`, tableName, strings.Join(colNames, ", "), strings.Join(placeholders, ", "))

	batchSize := req.BatchSize
	if batchSize <= 0 {
		batchSize = 2500
	}

	// Processar injeção de dados
	var totalRows int64
	ext := strings.ToLower(filepath.Ext(cleanSrc))

	if ext == ".json" {
		totalRows, err = injectJSON(ctx, db, cleanSrc, insertSQL, req.Columns, batchSize, onProgress)
	} else if ext == ".jsonl" || ext == ".ndjson" {
		totalRows, err = injectJSONL(ctx, db, cleanSrc, insertSQL, req.Columns, batchSize, onProgress)
	} else {
		delim := ','
		if req.Delimiter != "" {
			delim = []rune(req.Delimiter)[0]
		}
		totalRows, err = injectCSV(ctx, db, cleanSrc, insertSQL, req.Columns, delim, req.HasHeader, batchSize, onProgress)
	}

	if err != nil {
		return nil, err
	}

	// Restaurar PRAGMAs seguras para persistência consistente
	safePragmas := []string{
		"PRAGMA synchronous = NORMAL;",
	}
	if req.EnableWAL {
		safePragmas = append(safePragmas, "PRAGMA journal_mode = WAL;")
	} else {
		safePragmas = append(safePragmas, "PRAGMA journal_mode = DELETE;")
	}
	for _, p := range safePragmas {
		_, _ = db.ExecContext(ctx, p)
	}

	duration := time.Since(startTime)
	fi, _ := os.Stat(platform.NormalizeLongPath(cleanDest))
	finalSize := int64(0)
	if fi != nil {
		finalSize = fi.Size()
	}

	if onProgress != nil {
		onProgress(ProgressEvent{
			Stage:         "completed",
			ProcessedRows: totalRows,
			TotalRows:     totalRows,
			Percentage:    100,
			ElapsedMs:     duration.Milliseconds(),
			CurrentLog: fmt.Sprintf("[SUCESSO] Injetadas %d linhas em %s (~%d linhas/s). Tamanho final: %d bytes.",
				totalRows, duration.Round(time.Millisecond), int64(float64(totalRows)/(duration.Seconds()+0.001)), finalSize),
		})
	}

	return &CreateDBResult{
		DestinationPath:    cleanDest,
		TableName:          tableName,
		TotalRows:          totalRows,
		TotalDurationMs:    duration.Milliseconds(),
		FinalFileSizeBytes: finalSize,
		DDLExecuted:        ddl,
	}, nil
}

func injectCSV(ctx context.Context, db *sql.DB, srcPath string, insertSQL string, cols []ColumnDef, delim rune, hasHeader bool, batchSize int, onProgress ProgressCallback) (int64, error) {
	file, err := os.Open(platform.NormalizeLongPath(srcPath))
	if err != nil {
		return 0, err
	}
	defer file.Close()

	fi, _ := file.Stat()
	totalBytes := fi.Size()

	reader := csv.NewReader(bufio.NewReaderSize(file, 2*1024*1024))
	reader.Comma = delim
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true

	if hasHeader {
		// Pular cabeçalho
		_, _ = reader.Read()
	}

	startTime := time.Now()
	var processedRows int64
	var batchRows [][]interface{}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	stmt, err := tx.PrepareContext(ctx, insertSQL)
	if err != nil {
		_ = tx.Rollback()
		return 0, err
	}

	commitBatch := func() error {
		if len(batchRows) == 0 {
			return nil
		}
		for _, row := range batchRows {
			if _, err := stmt.ExecContext(ctx, row...); err != nil {
				_ = stmt.Close()
				_ = tx.Rollback()
				return err
			}
		}
		_ = stmt.Close()
		if err := tx.Commit(); err != nil {
			return err
		}

		processedRows += int64(len(batchRows))
		batchRows = batchRows[:0]

		// Novo lote
		tx, err = db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		stmt, err = tx.PrepareContext(ctx, insertSQL)
		if err != nil {
			_ = tx.Rollback()
			return err
		}

		elapsed := time.Since(startTime).Seconds()
		speed := int64(0)
		if elapsed > 0 {
			speed = int64(float64(processedRows) / elapsed)
		}

		if onProgress != nil {
			pos, _ := file.Seek(0, io.SeekCurrent)
			pct := float64(0)
			if totalBytes > 0 {
				pct = (float64(pos) / float64(totalBytes)) * 100.0
				if pct > 99.5 {
					pct = 99.5
				}
			}
			onProgress(ProgressEvent{
				Stage:         "importing",
				ProcessedRows: processedRows,
				Percentage:    pct,
				SpeedRowsSec:  speed,
				ElapsedMs:     time.Since(startTime).Milliseconds(),
				CurrentLog:    fmt.Sprintf("[BATCH] Lote processado. Total injetado: %d linhas (%d lin/s)", processedRows, speed),
			})
		}
		return nil
	}

	for {
		select {
		case <-ctx.Done():
			_ = stmt.Close()
			_ = tx.Rollback()
			return processedRows, ctx.Err()
		default:
		}

		record, readErr := reader.Read()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			// Ignorar linha malformada em vez de cancelar tudo
			continue
		}

		rowValues := make([]interface{}, len(cols))
		for i, col := range cols {
			if i < len(record) {
				raw := strings.TrimSpace(record[i])
				if raw == "" || strings.EqualFold(raw, "null") {
					rowValues[i] = nil
				} else {
					rowValues[i] = parseValue(raw, col.DataType)
				}
			} else {
				rowValues[i] = nil
			}
		}

		batchRows = append(batchRows, rowValues)
		if len(batchRows) >= batchSize {
			if err := commitBatch(); err != nil {
				return processedRows, err
			}
		}
	}

	if len(batchRows) > 0 {
		if err := commitBatch(); err != nil {
			return processedRows, err
		}
	}

	_ = stmt.Close()
	_ = tx.Commit()
	return processedRows, nil
}

func injectJSON(ctx context.Context, db *sql.DB, srcPath string, insertSQL string, cols []ColumnDef, batchSize int, onProgress ProgressCallback) (int64, error) {
	data, err := os.ReadFile(platform.NormalizeLongPath(srcPath))
	if err != nil {
		return 0, err
	}

	var items []map[string]interface{}
	if err := json.Unmarshal(data, &items); err != nil {
		return 0, err
	}

	total := int64(len(items))
	startTime := time.Now()
	var processedRows int64

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	stmt, err := tx.PrepareContext(ctx, insertSQL)
	if err != nil {
		_ = tx.Rollback()
		return 0, err
	}

	for i, item := range items {
		select {
		case <-ctx.Done():
			_ = stmt.Close()
			_ = tx.Rollback()
			return processedRows, ctx.Err()
		default:
		}

		rowValues := make([]interface{}, len(cols))
		for j, col := range cols {
			val, ok := item[col.Name]
			if !ok || val == nil {
				rowValues[j] = nil
			} else {
				rowValues[j] = val
			}
		}

		if _, err := stmt.ExecContext(ctx, rowValues...); err != nil {
			_ = stmt.Close()
			_ = tx.Rollback()
			return processedRows, err
		}

		processedRows++

		if (i+1)%batchSize == 0 || i+1 == len(items) {
			_ = stmt.Close()
			if err := tx.Commit(); err != nil {
				return processedRows, err
			}

			tx, err = db.BeginTx(ctx, nil)
			if err != nil {
				return processedRows, err
			}
			stmt, err = tx.PrepareContext(ctx, insertSQL)
			if err != nil {
				_ = tx.Rollback()
				return processedRows, err
			}

			elapsed := time.Since(startTime).Seconds()
			speed := int64(0)
			if elapsed > 0 {
				speed = int64(float64(processedRows) / elapsed)
			}

			if onProgress != nil {
				pct := (float64(processedRows) / float64(total)) * 100.0
				onProgress(ProgressEvent{
					Stage:         "importing",
					ProcessedRows: processedRows,
					TotalRows:     total,
					Percentage:    pct,
					SpeedRowsSec:  speed,
					ElapsedMs:     time.Since(startTime).Milliseconds(),
					CurrentLog:    fmt.Sprintf("[JSON] Processados %d de %d registros (%d lin/s)", processedRows, total, speed),
				})
			}
		}
	}

	_ = stmt.Close()
	_ = tx.Commit()
	return processedRows, nil
}

func injectJSONL(ctx context.Context, db *sql.DB, srcPath string, insertSQL string, cols []ColumnDef, batchSize int, onProgress ProgressCallback) (int64, error) {
	file, err := os.Open(platform.NormalizeLongPath(srcPath))
	if err != nil {
		return 0, err
	}
	defer file.Close()

	fi, _ := file.Stat()
	totalBytes := fi.Size()

	scanner := bufio.NewScanner(bufio.NewReaderSize(file, 2*1024*1024))
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)

	startTime := time.Now()
	var processedRows int64

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	stmt, err := tx.PrepareContext(ctx, insertSQL)
	if err != nil {
		_ = tx.Rollback()
		return 0, err
	}

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			_ = stmt.Close()
			_ = tx.Rollback()
			return processedRows, ctx.Err()
		default:
		}

		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var item map[string]interface{}
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			continue
		}

		rowValues := make([]interface{}, len(cols))
		for j, col := range cols {
			val, ok := item[col.Name]
			if !ok || val == nil {
				rowValues[j] = nil
			} else {
				rowValues[j] = val
			}
		}

		if _, err := stmt.ExecContext(ctx, rowValues...); err != nil {
			_ = stmt.Close()
			_ = tx.Rollback()
			return processedRows, err
		}

		processedRows++

		if processedRows%int64(batchSize) == 0 {
			_ = stmt.Close()
			if err := tx.Commit(); err != nil {
				return processedRows, err
			}

			tx, err = db.BeginTx(ctx, nil)
			if err != nil {
				return processedRows, err
			}
			stmt, err = tx.PrepareContext(ctx, insertSQL)
			if err != nil {
				_ = tx.Rollback()
				return processedRows, err
			}

			elapsed := time.Since(startTime).Seconds()
			speed := int64(0)
			if elapsed > 0 {
				speed = int64(float64(processedRows) / elapsed)
			}

			if onProgress != nil {
				pos, _ := file.Seek(0, io.SeekCurrent)
				pct := float64(0)
				if totalBytes > 0 {
					pct = (float64(pos) / float64(totalBytes)) * 100.0
				}
				onProgress(ProgressEvent{
					Stage:         "importing",
					ProcessedRows: processedRows,
					Percentage:    pct,
					SpeedRowsSec:  speed,
					ElapsedMs:     time.Since(startTime).Milliseconds(),
					CurrentLog:    fmt.Sprintf("[JSONL] Injetadas %d linhas (%d lin/s)", processedRows, speed),
				})
			}
		}
	}

	_ = stmt.Close()
	_ = tx.Commit()
	return processedRows, nil
}

func parseValue(val string, dataType string) interface{} {
	switch strings.ToUpper(dataType) {
	case "INTEGER":
		if n, err := strconv.ParseInt(val, 10, 64); err == nil {
			return n
		}
	case "REAL":
		if f, err := strconv.ParseFloat(val, 64); err == nil {
			return f
		}
	case "BOOLEAN":
		lower := strings.ToLower(val)
		if lower == "true" || lower == "1" || lower == "t" {
			return 1
		}
		if lower == "false" || lower == "0" || lower == "f" {
			return 0
		}
	}
	return val
}
