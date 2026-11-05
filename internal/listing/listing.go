package listing

import (
	"context"
	"sync"

	"pulsares-file-explorer/internal/vfs"
)

type BatchEvent struct {
	RequestID string      `json:"requestId"`
	Entries   []vfs.Entry `json:"entries"`
}

type DoneEvent struct {
	RequestID string `json:"requestId"`
	Total     int    `json:"total"`
	Error     string `json:"error,omitempty"`
}

type EventEmitter func(eventName string, data interface{})

type Manager struct {
	fs     vfs.FileSystem
	emit   EventEmitter
	mu     sync.Mutex
	active map[string]context.CancelFunc // tabId -> cancelFunc
}

func NewManager(fs vfs.FileSystem, emit EventEmitter) *Manager {
	return &Manager{
		fs:     fs,
		emit:   emit,
		active: make(map[string]context.CancelFunc),
	}
}

func (m *Manager) Start(tabID string, requestID string, loc vfs.Location, batchSize int) {
	m.mu.Lock()
	if cancel, exists := m.active[tabID]; exists {
		cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.active[tabID] = cancel
	m.mu.Unlock()

	go func() {
		defer func() {
			m.mu.Lock()
			if currCancel, exists := m.active[tabID]; exists {
				// Remover se ainda for este contexto
				_ = currCancel
				delete(m.active, tabID)
			}
			m.mu.Unlock()
		}()

		entriesChan, errChan := m.fs.ReadDir(ctx, loc, batchSize)
		total := 0

		for {
			select {
			case <-ctx.Done():
				return
			case batch, ok := <-entriesChan:
				if ok && len(batch) > 0 {
					total += len(batch)
					m.emit("listing:batch", BatchEvent{
						RequestID: requestID,
						Entries:   batch,
					})
				}
			case err, ok := <-errChan:
				done := DoneEvent{
					RequestID: requestID,
					Total:     total,
				}
				if ok && err != nil && err != context.Canceled {
					done.Error = err.Error()
				}
				m.emit("listing:done", done)
				return
			}
		}
	}()
}

func (m *Manager) Cancel(tabID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cancel, exists := m.active[tabID]; exists {
		cancel()
		delete(m.active, tabID)
	}
}

