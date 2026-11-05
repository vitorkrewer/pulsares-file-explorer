package storage

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { sqlDB.Close() })

	db := &DB{DB: sqlDB}
	if err := db.migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestStorage_SettingsReadWrite(t *testing.T) {
	db := openTestDB(t)

	val, err := db.GetSetting("language")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "" {
		t.Errorf("expected empty string, got %q", val)
	}

	if err := db.SetSetting("language", "pt-BR"); err != nil {
		t.Fatalf("set setting failed: %v", err)
	}
	val, err = db.GetSetting("language")
	if err != nil {
		t.Fatalf("get setting failed: %v", err)
	}
	if val != "pt-BR" {
		t.Errorf("expected 'pt-BR', got %q", val)
	}

	// Upsert
	if err := db.SetSetting("language", "es"); err != nil {
		t.Fatalf("update setting failed: %v", err)
	}
	val, err = db.GetSetting("language")
	if err != nil {
		t.Fatalf("get setting failed: %v", err)
	}
	if val != "es" {
		t.Errorf("expected 'es', got %q", val)
	}
}

func TestStorage_SessionPersistence(t *testing.T) {
	db := openTestDB(t)

	initial, err := db.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession empty failed: %v", err)
	}
	if initial != "" {
		t.Errorf("expected empty session, got %q", initial)
	}

	payload := `{"activeTabId":"tab-1","tabs":[{"id":"tab-1","path":"C:\\Users"}],"sidebar":{"visible":true,"width":240}}`
	if err := db.SaveSession(payload); err != nil {
		t.Fatalf("SaveSession failed: %v", err)
	}

	loaded, err := db.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession failed: %v", err)
	}
	if loaded != payload {
		t.Errorf("expected %s, got %s", payload, loaded)
	}
}
