package search

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
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

	cMatcher, err := newContentMatcher(opts.ContentQuery, opts.UseRegex)
	if err != nil {
		return err
	}

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
			emittedFromIndex := 0
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
				if len(batch) >= 25 {
					emittedFromIndex += len(batch)
					onBatch(batch)
					batch = make([]ResultItem, 0, 64)
				}
			}
			if len(batch) > 0 {
				emittedFromIndex += len(batch)
				onBatch(batch)
			}
			if emittedFromIndex > 0 {
				return nil
			}
		}
	}

	// Se houver busca dentro do conteúdo (ContentQuery), utiliza o motor concorrente Produtor-Consumidor
	// multiplataforma com Worker Pool limitado, descarte rápido de pastas virtuais/pesadas e suporte a Office/ODF.
	if cMatcher != nil {
		return s.walkAndSearchContentConcurrent(ctx, root, opts, matchesMeta, cMatcher, onBatch)
	}

	batch := make([]ResultItem, 0, 64)
	totalFlushed := 0
	lastFlush := time.Now()
	flush := func() {
		if len(batch) > 0 {
			totalFlushed += len(batch)
			onBatch(batch)
			batch = make([]ResultItem, 0, 64)
			lastFlush = time.Now()
		}
	}

	err = filepath.WalkDir(root, func(p string, d fs.DirEntry, walkErr error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		// Emite resultados pendentes periodicamente mesmo quando a varredura atravessa milhares de arquivos que não batem
		if len(batch) > 0 && time.Since(lastFlush) >= 50*time.Millisecond {
			flush()
		}
		if walkErr != nil {
			return nil // Ignora pastas sem permissão sem abortar toda a busca
		}
		if p == root {
			return nil
		}

		name := d.Name()
		isDir := d.IsDir()
		if isDir {
			if !opts.IncludeHidden && strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			// Ignora pastas virtuais do sistema e caches pesados (node_modules, .git, $RECYCLE.BIN, /proc, /sys)
			if shouldSkipContentDir(p, name) {
				return filepath.SkipDir
			}
		}
		// Não segue symlinks para diretórios para evitar ciclos infinitos
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		if !matchesMeta(name, isDir, info.Size(), info.ModTime()) {
			return nil
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
			Path:    p,
			RelPath: rel,
			Name:    name,
			Kind:    kindStr,
			Size:    info.Size(),
			ModTime: info.ModTime().Format(time.RFC3339),
		})
		// Despacha imediatamente o primeiro resultado encontrado e depois a cada 20 itens ou 50ms
		if totalFlushed == 0 || len(batch) >= 20 || time.Since(lastFlush) >= 50*time.Millisecond {
			flush()
		}
		return nil
	})

	flush()
	return err
}

type contentCandidate struct {
	path    string
	name    string
	ext     string
	size    int64
	modTime time.Time
}

func (s *Service) walkAndSearchContentConcurrent(
	ctx context.Context,
	root string,
	opts Options,
	matchesMeta func(name string, isDir bool, size int64, modTime time.Time) bool,
	cMatcher *contentMatcher,
	onBatch func([]ResultItem),
) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	workers := runtime.NumCPU()
	if workers > 4 {
		workers = 4
	}
	if workers < 2 {
		workers = 2
	}

	const maxContentResults = 1000
	var matchedCount int32

	jobs := make(chan contentCandidate, 128)
	resultsC := make(chan ResultItem, 64)

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for cand := range jobs {
				if ctx.Err() != nil {
					return
				}
				if atomic.LoadInt32(&matchedCount) >= maxContentResults {
					cancel()
					return
				}
				matched, snippet, lineNum := matchFileContentAdvanced(ctx, cand.path, cand.ext, cand.size, cMatcher)
				if !matched {
					continue
				}
				if atomic.AddInt32(&matchedCount, 1) > maxContentResults {
					cancel()
					return
				}
				rel, err := filepath.Rel(root, cand.path)
				if err != nil {
					rel = cand.name
				}
				select {
				case resultsC <- ResultItem{
					Path:       cand.path,
					RelPath:    rel,
					Name:       cand.name,
					Kind:       "file",
					Size:       cand.size,
					ModTime:    cand.modTime.Format(time.RFC3339),
					Snippet:    snippet,
					LineNumber: lineNum,
				}:
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	collectorDone := make(chan struct{})
	go func() {
		defer close(collectorDone)
		batch := make([]ResultItem, 0, 32)
		totalFlushed := 0
		ticker := time.NewTicker(50 * time.Millisecond)
		defer ticker.Stop()

		flush := func() {
			if len(batch) > 0 {
				totalFlushed += len(batch)
				onBatch(batch)
				batch = make([]ResultItem, 0, 32)
			}
		}

		for {
			select {
			case item, ok := <-resultsC:
				if !ok {
					flush()
					return
				}
				batch = append(batch, item)
				if totalFlushed == 0 || len(batch) >= 15 {
					flush()
				}
			case <-ticker.C:
				flush()
			}
		}
	}()

	walkErr := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil || p == root {
			return nil
		}

		name := d.Name()
		if d.IsDir() {
			if !opts.IncludeHidden && strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			if shouldSkipContentDir(p, name) {
				return filepath.SkipDir
			}
			return nil
		}

		// Em Linux/macOS/Windows, processa apenas arquivos regulares (ignora symlinks, FIFOs, sockets e devices)
		if !d.Type().IsRegular() {
			return nil
		}

		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
		if isSkippedBinaryExt(ext) {
			return nil
		}

		info, infoErr := d.Info()
		if infoErr != nil || info.Size() <= 0 {
			return nil
		}

		if !matchesMeta(name, false, info.Size(), info.ModTime()) {
			return nil
		}

		select {
		case jobs <- contentCandidate{
			path:    p,
			name:    name,
			ext:     ext,
			size:    info.Size(),
			modTime: info.ModTime(),
		}:
		case <-ctx.Done():
			return ctx.Err()
		}
		return nil
	})

	close(jobs)
	wg.Wait()
	close(resultsC)
	<-collectorDone

	if atomic.LoadInt32(&matchedCount) >= maxContentResults {
		return nil
	}
	return walkErr
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

