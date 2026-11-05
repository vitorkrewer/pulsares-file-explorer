package search

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"pulsares-file-explorer/internal/storage"
)

// Options define os filtros de uma busca recursiva.
type Options struct {
	RootPath       string   `json:"rootPath"`
	Query          string   `json:"query"`
	UseRegex       bool     `json:"useRegex"`
	Extensions     []string `json:"extensions"`
	Kind           string   `json:"kind"` // "", "file", "dir"
	MinSize        int64    `json:"minSize"`
	MaxSize        int64    `json:"maxSize"`
	ModifiedAfter  string   `json:"modifiedAfter"`
	ModifiedBefore string   `json:"modifiedBefore"`
	ContentQuery   string   `json:"contentQuery"`
	IncludeHidden  bool     `json:"includeHidden"`
	UseIndex       bool     `json:"useIndex"`
}

// ResultItem representa um item encontrado pela busca recursiva.
type ResultItem struct {
	Path       string `json:"path"`
	RelPath    string `json:"relPath"`
	Name       string `json:"name"`
	Kind       string `json:"kind"` // "file" | "dir"
	Size       int64  `json:"size"`
	ModTime    string `json:"modTime"`
	Snippet    string `json:"snippet,omitempty"`
	LineNumber int    `json:"lineNumber,omitempty"`
}

// BatchEvent entrega um lote de resultados de busca ao frontend.
type BatchEvent struct {
	RequestID string       `json:"requestId"`
	Results   []ResultItem `json:"results"`
}

// DoneEvent sinaliza o término ou cancelamento de uma busca.
type DoneEvent struct {
	RequestID string `json:"requestId"`
	Total     int    `json:"total"`
	Canceled  bool   `json:"canceled"`
	Error     string `json:"error,omitempty"`
}

// EventEmitter abstrai o disparo de eventos Wails.
type EventEmitter func(eventName string, data any)

// Service gerencia buscas recursivas em streaming e o índice local opcional.
type Service struct {
	mu      sync.Mutex
	active  map[string]context.CancelFunc
	storage *storage.DB
	emit    EventEmitter
}

// New cria um novo serviço de busca.
func New(db *storage.DB, emit EventEmitter) *Service {
	if emit == nil {
		emit = func(string, any) {}
	}
	return &Service{
		active:  make(map[string]context.CancelFunc),
		storage: db,
		emit:    emit,
	}
}

// Start inicia uma busca em segundo plano cancelando qualquer busca anterior com o mesmo requestID.
func (s *Service) Start(requestID string, opts Options) {
	s.mu.Lock()
	if prevCancel, ok := s.active[requestID]; ok {
		prevCancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.active[requestID] = cancel
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.active, requestID)
			s.mu.Unlock()
		}()
		s.runSearch(ctx, requestID, opts)
	}()
}

// Cancel interrompe uma busca em andamento.
func (s *Service) Cancel(requestID string) {
	s.mu.Lock()
	cancel, ok := s.active[requestID]
	if ok {
		delete(s.active, requestID)
	}
	s.mu.Unlock()
	if ok && cancel != nil {
		cancel()
	}
}

// SearchSync executa a busca de forma síncrona (útil para testes e chamadas diretas).
func (s *Service) SearchSync(ctx context.Context, opts Options) ([]ResultItem, error) {
	var all []ResultItem
	err := s.walkAndFilter(ctx, opts, func(batch []ResultItem) {
		all = append(all, batch...)
	})
	return all, err
}

func (s *Service) runSearch(ctx context.Context, requestID string, opts Options) {
	total := 0
	err := s.walkAndFilter(ctx, opts, func(batch []ResultItem) {
		total += len(batch)
		s.emit("search:batch", BatchEvent{
			RequestID: requestID,
			Results:   batch,
		})
	})

	canceled := ctx.Err() != nil
	errMsg := ""
	if err != nil && !canceled {
		errMsg = err.Error()
	}
	s.emit("search:done", DoneEvent{
		RequestID: requestID,
		Total:     total,
		Canceled:  canceled,
		Error:     errMsg,
	})
}

func (s *Service) walkAndFilter(ctx context.Context, opts Options, onBatch func([]ResultItem)) error {
	root := filepath.Clean(opts.RootPath)
	if root == "" || root == "." {
		if home, err := os.UserHomeDir(); err == nil {
			root = home
		}
	}

	var rx *regexp.Regexp
	if opts.UseRegex && strings.TrimSpace(opts.Query) != "" {
		compiled, err := regexp.Compile("(?i)" + opts.Query)
		if err != nil {
			return err
		}
		rx = compiled
	}

	extSet := make(map[string]bool)
	for _, ext := range opts.Extensions {
		cleanExt := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(ext), "."))
		if cleanExt != "" {
			extSet[cleanExt] = true
		}
	}

	var modAfter, modBefore time.Time
	if opts.ModifiedAfter != "" {
		modAfter = parseFlexibleTime(opts.ModifiedAfter)
	}
	if opts.ModifiedBefore != "" {
		modBefore = parseFlexibleTime(opts.ModifiedBefore)
		if !modBefore.IsZero() && len(opts.ModifiedBefore) == 10 {
			modBefore = modBefore.Add(24*time.Hour - time.Nanosecond)
		}
	}

	queryLower := strings.ToLower(strings.TrimSpace(opts.Query))
	isGlob := !opts.UseRegex && (strings.ContainsAny(queryLower, "*?["))
	contentLower := strings.ToLower(strings.TrimSpace(opts.ContentQuery))

	matchesMeta := func(name string, isDir bool, size int64, modTime time.Time) bool {
		if !opts.IncludeHidden && strings.HasPrefix(name, ".") {
			return false
		}
		if opts.Kind == "file" && isDir {
			return false
		}
		if opts.Kind == "dir" && !isDir {
			return false
		}

		if len(extSet) > 0 {
			if isDir {
				return false
			}
			ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
			if !extSet[ext] {
				return false
			}
		}

		if !isDir {
			if opts.MinSize > 0 && size < opts.MinSize {
				return false
			}
			if opts.MaxSize > 0 && size > opts.MaxSize {
				return false
			}
		}

		if !modAfter.IsZero() && modTime.Before(modAfter) {
			return false
		}
		if !modBefore.IsZero() && modTime.After(modBefore) {
			return false
		}

		if queryLower != "" {
			nameLower := strings.ToLower(name)
			switch {
			case rx != nil:
				if !rx.MatchString(name) {
					return false
				}
			case isGlob:
				matched, err := filepath.Match(queryLower, nameLower)
				if err != nil || !matched {
					return false
				}
			default:
				if !strings.Contains(nameLower, queryLower) {
					return false
				}
			}
		}
		return true
	}

	// Caminho rápido via índice SQLite quando ativado e sem regex/conteúdo
	if opts.UseIndex && s.storage != nil && !opts.UseRegex && !isGlob && contentLower == "" {
		if indexed, err := s.storage.QueryIndexedEntries(root, opts.Query, 1000); err == nil && len(indexed) > 0 {
			batch := make([]ResultItem, 0, 64)
			for _, ie := range indexed {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				isDir := ie.Kind == "dir"
				modT := parseFlexibleTime(ie.ModTime)
				if !matchesMeta(ie.Name, isDir, ie.Size, modT) {
					continue
				}
				rel, err := filepath.Rel(root, ie.Path)
				if err != nil {
					rel = ie.Name
				}
				batch = append(batch, ResultItem{
					Path:    ie.Path,
					RelPath: rel,
					Name:    ie.Name,
					Kind:    ie.Kind,
					Size:    ie.Size,
					ModTime: ie.ModTime,
				})
				if len(batch) >= 50 {
					onBatch(batch)
					batch = make([]ResultItem, 0, 64)
				}
			}
			if len(batch) > 0 {
				onBatch(batch)
			}
			return nil
		}
	}

	batch := make([]ResultItem, 0, 64)
	flush := func() {
		if len(batch) > 0 {
			onBatch(batch)
			batch = make([]ResultItem, 0, 64)
		}
	}

	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, walkErr error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if walkErr != nil {
			return nil // Ignora pastas sem permissão sem abortar toda a busca
		}
		if p == root {
			return nil
		}

		name := d.Name()
		if !opts.IncludeHidden && strings.HasPrefix(name, ".") && d.IsDir() {
			return filepath.SkipDir
		}
		// Não segue symlinks para diretórios para evitar ciclos infinitos
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		isDir := d.IsDir()
		if !matchesMeta(name, isDir, info.Size(), info.ModTime()) {
			return nil
		}

		snippet := ""
		lineNum := 0
		if contentLower != "" {
			if isDir || info.Size() > 8*1024*1024 {
				return nil
			}
			matched, snip, ln := matchFileContent(ctx, p, contentLower)
			if !matched {
				return nil
			}
			snippet = snip
			lineNum = ln
		}

		rel, err := filepath.Rel(root, p)
		if err != nil {
			rel = name
		}
		kindStr := "file"
		if isDir {
			kindStr = "dir"
		}

		batch = append(batch, ResultItem{
			Path:       p,
			RelPath:    rel,
			Name:       name,
			Kind:       kindStr,
			Size:       info.Size(),
			ModTime:    info.ModTime().Format(time.RFC3339),
			Snippet:    snippet,
			LineNumber: lineNum,
		})
		if len(batch) >= 50 {
			flush()
		}
		return nil
	})

	flush()
	return err
}

// IndexDirectory varre uma pasta escolhida pelo usuário e armazena suas entradas no índice SQLite.
func (s *Service) IndexDirectory(ctx context.Context, rootPath string) (int, error) {
	if s.storage == nil {
		return 0, nil
	}
	cleanRoot := filepath.Clean(rootPath)
	var entries []storage.IndexedEntry

	err := filepath.WalkDir(cleanRoot, func(p string, d fs.DirEntry, walkErr error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if walkErr != nil || p == cleanRoot {
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		kind := "file"
		if d.IsDir() {
			kind = "dir"
		}
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(d.Name()), "."))
		entries = append(entries, storage.IndexedEntry{
			Path:    p,
			Root:    cleanRoot,
			Name:    d.Name(),
			Ext:     ext,
			Kind:    kind,
			Size:    info.Size(),
			ModTime: info.ModTime().Format(time.RFC3339),
		})
		return nil
	})
	if err != nil {
		return 0, err
	}

	if err := s.storage.ReplaceIndexedEntries(cleanRoot, entries); err != nil {
		return 0, err
	}
	return len(entries), nil
}

func matchFileContent(ctx context.Context, path string, needleLower string) (bool, string, int) {
	f, err := os.Open(path)
	if err != nil {
		return false, "", 0
	}
	defer f.Close()

	// Verifica primeiros 512 bytes para ignorar arquivos binários
	head := make([]byte, 512)
	n, _ := f.Read(head)
	if n > 0 && bytes.IndexByte(head[:n], 0) >= 0 {
		return false, "", 0
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return false, "", 0
	}

	scanner := bufio.NewScanner(f)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 256*1024)

	lineNum := 0
	for scanner.Scan() {
		if ctx.Err() != nil {
			return false, "", 0
		}
		lineNum++
		line := scanner.Text()
		if strings.Contains(strings.ToLower(line), needleLower) {
			trimmed := strings.TrimSpace(line)
			if len(trimmed) > 140 {
				trimmed = trimmed[:140] + "…"
			}
			return true, trimmed, lineNum
		}
	}
	return false, "", 0
}

func parseFlexibleTime(val string) time.Time {
	val = strings.TrimSpace(val)
	if val == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339, val); err == nil {
		return t
	}
	if t, err := time.Parse("2006-01-02", val); err == nil {
		return t
	}
	return time.Time{}
}

