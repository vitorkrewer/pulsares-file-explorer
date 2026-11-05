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

func TestStorage_FavoritesAndRecentHistory(t *testing.T) {
	db := openTestDB(t)

	p1 := filepath.Join(t.TempDir(), "Projetos")
	p2 := filepath.Join(t.TempDir(), "Documentos")

	if err := db.AddFavorite(p1, "Meus Projetos"); err != nil {
		t.Fatalf("AddFavorite p1: %v", err)
	}
	if err := db.AddFavorite(p2, "Docs"); err != nil {
		t.Fatalf("AddFavorite p2: %v", err)
	}

	favs, err := db.ListFavorites()
	if err != nil {
		t.Fatalf("ListFavorites: %v", err)
	}
	if len(favs) != 2 {
		t.Fatalf("expected 2 favorites, got %d", len(favs))
	}
	if favs[0].Label != "Meus Projetos" {
		t.Errorf("expected 'Meus Projetos', got %q", favs[0].Label)
	}

	if err := db.RemoveFavorite(p1); err != nil {
		t.Fatalf("RemoveFavorite: %v", err)
	}
	favs, _ = db.ListFavorites()
	if len(favs) != 1 {
		t.Fatalf("expected 1 favorite after removal, got %d", len(favs))
	}

	// Histórico recente
	_ = db.RecordVisit(p1)
	_ = db.RecordVisit(p1)
	_ = db.RecordVisit(p2)

	recents, err := db.ListRecent(10)
	if err != nil {
		t.Fatalf("ListRecent: %v", err)
	}
	if len(recents) != 2 {
		t.Fatalf("expected 2 recent items, got %d", len(recents))
	}
}
