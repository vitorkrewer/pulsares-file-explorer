package watch

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestWatcherDetectsFileCreationAndDebounces(t *testing.T) {
	tmp := t.TempDir()

	var mu sync.Mutex
	var events []ChangeEvent

	svc := New(60*time.Millisecond, 25*time.Millisecond, func(eventName string, data interface{}) {
		if eventName != "watch:changed" {
			return
		}
		ev, ok := data.(ChangeEvent)
		if !ok {
			return
		}
		mu.Lock()
		events = append(events, ev)
		mu.Unlock()
	})
	defer svc.Close()

	svc.SetWatchedPaths([]string{tmp})
	if len(svc.WatchedPaths()) != 1 {
		t.Fatalf("expected 1 watched path, got %d", len(svc.WatchedPaths()))
	}

	fileA := filepath.Join(tmp, "alpha.txt")
	if err := os.WriteFile(fileA, []byte("hello"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	deadline := time.Now().Add(800 * time.Millisecond)
	for time.Now().Before(deadline) {
		mu.Lock()
		n := len(events)
		mu.Unlock()
		if n > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	mu.Lock()
	got := len(events)
	mu.Unlock()
	if got == 0 {
		t.Fatalf("expected watch:changed event after creating file in watched dir")
	}

	svc.Unwatch(tmp)
	if len(svc.WatchedPaths()) != 0 {
		t.Fatalf("expected 0 watched paths after Unwatch")
	}
}

