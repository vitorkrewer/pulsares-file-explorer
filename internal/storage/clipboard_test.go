package storage

import (
	"fmt"
	"path/filepath"
	"testing"
)

func TestClipboardHistoryLimitAndPinning(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := OpenPath(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("OpenPath failed: %v", err)
	}
	defer db.Close()

	// Insert 25 unpinned items; only the 20 most recent should remain
	for i := 1; i <= 25; i++ {
		_, err := db.AddClipboardItem("text", fmt.Sprintf("snippet-%02d", i), "", 0, 0, 20)
		if err != nil {
			t.Fatalf("AddClipboardItem %d failed: %v", i, err)
		}
	}

	items, err := db.ListClipboardHistory(20)
	if err != nil {
		t.Fatalf("ListClipboardHistory failed: %v", err)
	}
	if len(items) != 20 {
		t.Fatalf("expected 20 unpinned items, got %d", len(items))
	}
	if items[0].Content != "snippet-25" {
		t.Fatalf("expected most recent item snippet-25 first, got %s", items[0].Content)
	}

	// Pin the oldest remaining item (snippet-06)
	oldestID := items[len(items)-1].ID
	if err := db.TogglePinClipboardItem(oldestID, 20); err != nil {
		t.Fatalf("TogglePinClipboardItem failed: %v", err)
	}

	// Add 5 more items; pinned item must survive + 20 unpinned = 21 total
	for i := 26; i <= 30; i++ {
		if _, err := db.AddClipboardItem("text", fmt.Sprintf("snippet-%02d", i), "", 0, 0, 20); err != nil {
			t.Fatalf("AddClipboardItem %d failed: %v", i, err)
		}
	}

	items, err = db.ListClipboardHistory(20)
	if err != nil {
		t.Fatalf("ListClipboardHistory after pin failed: %v", err)
	}
	if len(items) != 21 {
		t.Fatalf("expected 21 items (1 pinned + 20 unpinned), got %d", len(items))
	}
	if !items[0].Pinned || items[0].ID != oldestID {
		t.Fatalf("expected pinned item first, got %+v", items[0])
	}

	// Deduplication check: re-adding snippet-28 should not increase count
	if _, err := db.AddClipboardItem("text", "snippet-28", "", 0, 0, 20); err != nil {
		t.Fatalf("AddClipboardItem duplicate failed: %v", err)
	}
	items, _ = db.ListClipboardHistory(20)
	if len(items) != 21 {
		t.Fatalf("expected 21 items after duplicate insert, got %d", len(items))
	}

	// Clear unpinned should keep the pinned item
	if err := db.ClearUnpinnedClipboardHistory(); err != nil {
		t.Fatalf("ClearUnpinnedClipboardHistory failed: %v", err)
	}
	items, _ = db.ListClipboardHistory(20)
	if len(items) != 1 || !items[0].Pinned {
		t.Fatalf("expected only 1 pinned item remaining, got %+v", items)
	}
}

