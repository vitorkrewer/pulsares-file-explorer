package dbcreator

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func TestInspectAndCreateDatabase_CSV(t *testing.T) {
	tempDir := t.TempDir()
	csvFile := filepath.Join(tempDir, "clientes.csv")
	csvContent := `nome,idade,saldo,ativo
Ana Silva,28,1540.50,true
Carlos Souza,42,3200.00,false
Mariana Lima,35,780.25,true
`
	if err := os.WriteFile(csvFile, []byte(csvContent), 0644); err != nil {
		t.Fatalf("write csv: %v", err)
	}

	// 1. Inspecionar
	inspection, err := InspectSource(csvFile)
	if err != nil {
		t.Fatalf("inspect csv: %v", err)
	}

	if inspection.Format != "csv" {
		t.Errorf("expected format csv, got %s", inspection.Format)
	}
	if inspection.DetectedDelim != "," {
		t.Errorf("expected delim ',', got %s", inspection.DetectedDelim)
	}
	if len(inspection.Columns) != 4 {
		t.Fatalf("expected 4 columns, got %d", len(inspection.Columns))
	}

	colMap := make(map[string]string)
	for _, c := range inspection.Columns {
		colMap[c.Name] = c.DataType
	}
	if colMap["nome"] != "TEXT" {
		t.Errorf("expected TEXT for nome, got %s", colMap["nome"])
	}
	if colMap["idade"] != "INTEGER" {
		t.Errorf("expected INTEGER for idade, got %s", colMap["idade"])
	}
	if colMap["saldo"] != "REAL" {
		t.Errorf("expected REAL for saldo, got %s", colMap["saldo"])
	}
	if colMap["ativo"] != "BOOLEAN" {
		t.Errorf("expected BOOLEAN for ativo, got %s", colMap["ativo"])
	}

	// 2. Criar banco SQLite
	destDB := filepath.Join(tempDir, "clientes.db")
	req := CreateDBRequest{
		SourcePath:      csvFile,
		DestinationPath: destDB,
		TableName:       "clientes",
		Columns:         inspection.Columns,
		AddAutoID:       true,
		Delimiter:       ",",
		HasHeader:       true,
		BatchSize:       10,
		EnableWAL:       true,
	}

	var events []ProgressEvent
	result, err := CreateDatabase(context.Background(), req, func(e ProgressEvent) {
		events = append(events, e)
	})
	if err != nil {
		t.Fatalf("create database failed: %v", err)
	}

	if result.TotalRows != 3 {
		t.Errorf("expected 3 rows, got %d", result.TotalRows)
	}

	// 3. Validar se o banco foi gerado e os dados estão corretos
	db, err := sql.Open("sqlite", destDB)
	if err != nil {
		t.Fatalf("open generated db: %v", err)
	}
	defer db.Close()

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM clientes").Scan(&count); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if count != 3 {
		t.Errorf("expected 3 rows in sqlite table, got %d", count)
	}

	var nome string
	var idade int
	var saldo float64
	var ativo int
	err = db.QueryRow("SELECT nome, idade, saldo, ativo FROM clientes WHERE idade = 28").Scan(&nome, &idade, &saldo, &ativo)
	if err != nil {
		t.Fatalf("query row: %v", err)
	}
	if nome != "Ana Silva" || idade != 28 || saldo != 1540.50 || ativo != 1 {
		t.Errorf("unexpected row data: %s, %d, %f, %d", nome, idade, saldo, ativo)
	}
}

func TestInspectAndCreateDatabase_JSON(t *testing.T) {
	tempDir := t.TempDir()
	jsonFile := filepath.Join(tempDir, "produtos.json")
	jsonContent := `[
  {"id_prod": 101, "titulo": "Monitor 4K", "preco": 1899.99, "estoque": 15},
  {"id_prod": 102, "titulo": "Teclado Mecanico", "preco": 350.00, "estoque": 40},
  {"id_prod": 103, "titulo": "Mouse Gamer", "preco": 120.50, "estoque": 80}
]`
	if err := os.WriteFile(jsonFile, []byte(jsonContent), 0644); err != nil {
		t.Fatalf("write json: %v", err)
	}

	inspection, err := InspectSource(jsonFile)
	if err != nil {
		t.Fatalf("inspect json: %v", err)
	}

	if inspection.Format != "json" {
		t.Errorf("expected format json, got %s", inspection.Format)
	}
	if len(inspection.Columns) != 4 {
		t.Fatalf("expected 4 columns, got %d", len(inspection.Columns))
	}

	destDB := filepath.Join(tempDir, "produtos.db")
	req := CreateDBRequest{
		SourcePath:      jsonFile,
		DestinationPath: destDB,
		TableName:       "produtos",
		Columns:         inspection.Columns,
		AddAutoID:       false,
		BatchSize:       10,
		EnableWAL:       true,
	}

	result, err := CreateDatabase(context.Background(), req, nil)
	if err != nil {
		t.Fatalf("create db json: %v", err)
	}
	if result.TotalRows != 3 {
		t.Errorf("expected 3 rows, got %d", result.TotalRows)
	}

	db, err := sql.Open("sqlite", destDB)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	var titulo string
	var preco float64
	err = db.QueryRow("SELECT titulo, preco FROM produtos WHERE id_prod = 101").Scan(&titulo, &preco)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if titulo != "Monitor 4K" || preco != 1899.99 {
		t.Errorf("unexpected: %s, %f", titulo, preco)
	}
}

func TestInspectSource_SemicolonDelimited(t *testing.T) {
	tempDir := t.TempDir()
	csvFile := filepath.Join(tempDir, "dados_pt.csv")
	csvContent := "codigo;descricao;quantidade;valor\n1;Parafuso;100;0,25\n2;Porca;200;0,15\n"
	if err := os.WriteFile(csvFile, []byte(csvContent), 0644); err != nil {
		t.Fatalf("write csv: %v", err)
	}

	inspection, err := InspectSource(csvFile)
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}

	if inspection.DetectedDelim != ";" {
		t.Errorf("expected delimiter ';', got %q", inspection.DetectedDelim)
	}
	if len(inspection.Columns) != 4 {
		t.Fatalf("expected 4 columns, got %d", len(inspection.Columns))
	}
}

func TestSanitizeIdentifier(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Nome do Cliente", "Nome_do_Cliente"},
		{"123_data", "c_123_data"},
		{"preço-unitário ($)", "pre_o_unit_rio____"},
		{"", "col"},
		{"   ", "col"},
	}
	for _, tt := range tests {
		got := SanitizeIdentifier(tt.input)
		if strings.TrimSpace(got) == "" {
			t.Errorf("SanitizeIdentifier(%q) returned empty", tt.input)
		}
	}
}

