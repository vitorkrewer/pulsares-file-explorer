package listing

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"pulsares-file-explorer/internal/vfs"
	"pulsares-file-explorer/internal/vfs/local"
)

func TestManager_StartAndDone(t *testing.T) {
	tempDir := t.TempDir()
	for i := 0; i < 15; i++ {
		name := filepath.Join(tempDir, fmt.Sprintf("file_%02d.txt", i))
		if err := os.WriteFile(name, []byte("data"), 0644); err != nil {
			t.Fatalf("write file: %v", err)
		}
	}

	var mu sync.Mutex
	var batches []BatchEvent
	var doneEvt *DoneEvent
	doneCh := make(chan struct{})

	mgr := NewManager(local.New(), func(eventName string, data interface{}) {
		mu.Lock()
		defer mu.Unlock()
		switch eventName {
		case "listing:batch":
			b := data.(BatchEvent)
			batches = append(batches, b)
		case "listing:done":
			d := data.(DoneEvent)
			doneEvt = &d
			close(doneCh)
		}
	})

	mgr.Start("tab-1", "req-1", vfs.Location{Provider: "local", Path: tempDir}, 5)

	select {
	case <-doneCh:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for listing:done")
	}

	mu.Lock()
	defer mu.Unlock()
	if doneEvt == nil {
		t.Fatal("expected doneEvt")
	}
	if doneEvt.Error != "" {
		t.Fatalf("unexpected error: %s", doneEvt.Error)
	}
	if doneEvt.Total != 15 {
		t.Errorf("expected total 15, got %d", doneEvt.Total)
	}
	if len(batches) != 3 {
		t.Errorf("expected 3 batches of 5, got %d", len(batches))
	}
}

func TestManager_NotFoundErrorCode(t *testing.T) {
	doneCh := make(chan DoneEvent, 1)
	mgr := NewManager(local.New(), func(eventName string, data interface{}) {
		if eventName == "listing:done" {
			doneCh <- data.(DoneEvent)
		}
	})

	nonExistent := filepath.Join(t.TempDir(), "does-not-exist")
	mgr.Start("tab-1", "req-err", vfs.Location{Provider: "local", Path: nonExistent}, 10)

	select {
	case evt := <-doneCh:
		if evt.Error != "notFound" {
			t.Errorf("expected error code 'notFound', got '%s'", evt.Error)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for listing:done")
	}
}

func BenchmarkManager_List1000Files(b *testing.B) {
	tempDir := b.TempDir()
	for i := 0; i < 1000; i++ {
		name := filepath.Join(tempDir, fmt.Sprintf("item_%04d.txt", i))
		if err := os.WriteFile(name, []byte("x"), 0644); err != nil {
			b.Fatalf("write file: %v", err)
		}
	}

	fs := local.New()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		doneCh := make(chan struct{})
		mgr := NewManager(fs, func(eventName string, data interface{}) {
			if eventName == "listing:done" {
				close(doneCh)
			}
		})
		mgr.Start("bench-tab", fmt.Sprintf("req-%d", i), vfs.Location{Provider: "local", Path: tempDir}, 500)
		<-doneCh
	}
}

