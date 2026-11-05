package listing

import (
	"context"
	"errors"
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

type activeRequest struct {
	requestID string
	cancel    context.CancelFunc
}

type Manager struct {
	fs     vfs.FileSystem
	emit   EventEmitter
	mu     sync.Mutex
	active map[string]activeRequest // tabId -> activeRequest
}

func NewManager(fs vfs.FileSystem, emit EventEmitter) *Manager {
	return &Manager{
		fs:     fs,
		emit:   emit,
		active: make(map[string]activeRequest),
	}
}

func (m *Manager) Start(tabID string, requestID string, loc vfs.Location, batchSize int) {
	m.mu.Lock()
	if prev, exists := m.active[tabID]; exists {
		prev.cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.active[tabID] = activeRequest{
		requestID: requestID,
		cancel:    cancel,
	}
	m.mu.Unlock()

	go func() {
		defer func() {
			m.mu.Lock()
			if curr, exists := m.active[tabID]; exists && curr.requestID == requestID {
				delete(m.active, tabID)
			}
			m.mu.Unlock()
		}()

		entriesChan, errChan := m.fs.ReadDir(ctx, loc, batchSize)
		total := 0

		for entriesChan != nil || errChan != nil {
			select {
			case <-ctx.Done():
				return
			case batch, ok := <-entriesChan:
				if !ok {
					entriesChan = nil
					continue
				}
				if len(batch) > 0 {
					total += len(batch)
					m.emit("listing:batch", BatchEvent{
						RequestID: requestID,
						Entries:   batch,
					})
				}
			case err, ok := <-errChan:
				if !ok {
					errChan = nil
					continue
				}
				if err != nil {
					if errors.Is(err, context.Canceled) {
						return
					}
					m.emit("listing:done", DoneEvent{
						RequestID: requestID,
						Total:     total,
						Error:     vfs.ErrorCode(err),
					})
					return
				}
			}
		}

		if ctx.Err() == nil {
			m.emit("listing:done", DoneEvent{
				RequestID: requestID,
				Total:     total,
			})
		}
	}()
}

func (m *Manager) Cancel(tabID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if prev, exists := m.active[tabID]; exists {
		prev.cancel()
		delete(m.active, tabID)
	}
}
