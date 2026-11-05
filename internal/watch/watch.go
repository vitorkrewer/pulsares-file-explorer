package watch

import (
	"os"
	"path/filepath"
	"sync"
	"time"
)

type EventEmitter func(eventName string, data interface{})

type ChangeEvent struct {
	Path      string `json:"path"`
	Timestamp int64  `json:"timestamp"`
}

type dirSignature struct {
	count      int
	latestNano int64
	totalSize  int64
}

type Service struct {
	mu           sync.Mutex
	watched      map[string]dirSignature
	lastEmitted  map[string]time.Time
	debounce     time.Duration
	pollInterval time.Duration
	emit         EventEmitter
	stopCh       chan struct{}
	stopped      bool
}

func New(debounce time.Duration, pollInterval time.Duration, emit EventEmitter) *Service {
	if debounce <= 0 {
		debounce = 250 * time.Millisecond
	}
	if pollInterval <= 0 {
		pollInterval = 400 * time.Millisecond
	}
	s := &Service{
		watched:      make(map[string]dirSignature),
		lastEmitted:  make(map[string]time.Time),
		debounce:     debounce,
		pollInterval: pollInterval,
		emit:         emit,
		stopCh:       make(chan struct{}),
	}
	go s.loop()
	return s
}

func (s *Service) SetEmitter(emit EventEmitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emit = emit
}

// SetWatchedPaths substitui o conjunto de pastas monitoradas pelas pastas visíveis/expandidas atuais.
func (s *Service) SetWatchedPaths(paths []string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	next := make(map[string]dirSignature, len(paths))
	for _, raw := range paths {
		if raw == "" {
			continue
		}
		clean := filepath.Clean(raw)
		if prev, ok := s.watched[clean]; ok {
			next[clean] = prev
		} else {
			sig, err := computeSignature(clean)
			if err == nil {
				next[clean] = sig
			}
		}
	}
	s.watched = next
}

// Watch adiciona um único diretório ao monitoramento.
func (s *Service) Watch(path string) {
	if path == "" {
		return
	}
	clean := filepath.Clean(path)
	sig, err := computeSignature(clean)
	if err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.watched[clean] = sig
}

// Unwatch remove um diretório do monitoramento.
func (s *Service) Unwatch(path string) {
	if path == "" {
		return
	}
	clean := filepath.Clean(path)
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.watched, clean)
	delete(s.lastEmitted, clean)
}

// WatchedPaths retorna a lista de diretórios atualmente monitorados.
func (s *Service) WatchedPaths() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, 0, len(s.watched))
	for k := range s.watched {
		out = append(out, k)
	}
	return out
}

func (s *Service) Close() {
	s.mu.Lock()
	if s.stopped {
		s.mu.Unlock()
		return
	}
	s.stopped = true
	close(s.stopCh)
	s.mu.Unlock()
}

func (s *Service) loop() {
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.checkOnce()
		}
	}
}

func (s *Service) checkOnce() {
	s.mu.Lock()
	paths := make([]string, 0, len(s.watched))
	for p := range s.watched {
		paths = append(paths, p)
	}
	s.mu.Unlock()

	now := time.Now()
	for _, p := range paths {
		sig, err := computeSignature(p)
		if err != nil {
			continue
		}

		s.mu.Lock()
		prev, exists := s.watched[p]
		if !exists {
			s.mu.Unlock()
			continue
		}
		if sig != prev {
			last := s.lastEmitted[p]
			if now.Sub(last) >= s.debounce {
				s.watched[p] = sig
				s.lastEmitted[p] = now
				emit := s.emit
				s.mu.Unlock()
				if emit != nil {
					emit("watch:changed", ChangeEvent{
						Path:      p,
						Timestamp: now.UnixMilli(),
					})
				}
				continue
			}
		}
		s.mu.Unlock()
	}
}

func computeSignature(dirPath string) (dirSignature, error) {
	info, err := os.Stat(dirPath)
	if err != nil {
		return dirSignature{}, err
	}
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return dirSignature{}, err
	}

	sig := dirSignature{
		count:      len(entries),
		latestNano: info.ModTime().UnixNano(),
	}

	for _, e := range entries {
		if fi, err := e.Info(); err == nil {
			mod := fi.ModTime().UnixNano()
			if mod > sig.latestNano {
				sig.latestNano = mod
			}
			sig.totalSize += fi.Size()
		}
	}
	return sig, nil
}

