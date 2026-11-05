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

func TestStorage_MigrationUpgradeAndTagsRemoteSavedSearches(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "upgrade.db")

	// Simula banco da versão 0.1.0 e executa upgrade idempotente até 1.0.0
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	_, err = sqlDB.Exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`)
	if err != nil {
		t.Fatalf("seed 0.1.0 schema: %v", err)
	}
	_, _ = sqlDB.Exec(`INSERT INTO settings (key, value) VALUES ('theme', 'dark')`)
	_ = sqlDB.Close()

	db, err := OpenPath(dbPath)
	if err != nil {
		t.Fatalf("OpenPath upgrade: %v", err)
	}
	defer db.Close()

	theme, err := db.GetSetting("theme")
	if err != nil || theme != "dark" {
		t.Fatalf("expected preserved setting 'dark', got %q (err=%v)", theme, err)
	}

	// Testar tags (0.9.0)
	if err := db.SetItemTag("/tmp/a.txt", "Urgente", "#ef4444"); err != nil {
		t.Fatalf("SetItemTag: %v", err)
	}
	tags, err := db.ListItemTags()
	if err != nil || len(tags) != 1 {
		t.Fatalf("expected 1 tag, got %d (err=%v)", len(tags), err)
	}

	// Testar buscas salvas (0.9.0)
	searchID, err := db.SaveSearch("Arquivos Go", `{"query":"*.go"}`)
	if err != nil || searchID <= 0 {
		t.Fatalf("SaveSearch: %v", err)
	}
	searches, err := db.ListSavedSearches()
	if err != nil || len(searches) != 1 {
		t.Fatalf("expected 1 saved search, got %d", len(searches))
	}
	_ = db.DeleteSavedSearch(searchID)

	// Testar perfis remotos (0.10.0)
	profID, err := db.SaveRemoteProfile(RemoteProfile{
		Name:       "Servidor Produção",
		Protocol:   "sftp",
		Host:       "10.0.0.10",
		Port:       22,
		Username:   "deploy",
		RemotePath: "/var/www",
	})
	if err != nil || profID <= 0 {
		t.Fatalf("SaveRemoteProfile: %v", err)
	}
	profiles, err := db.ListRemoteProfiles()
	if err != nil || len(profiles) != 1 {
		t.Fatalf("expected 1 remote profile, got %d", len(profiles))
	}
	_ = db.DeleteRemoteProfile(profID)
}
