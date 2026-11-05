package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
}

type JournalEntry struct {
	ID        int64  `json:"id"`
	OpType    string `json:"opType"`
	SrcPath   string `json:"srcPath"`
	DstPath   string `json:"dstPath"`
	Undone    bool   `json:"undone"`
	CreatedAt string `json:"createdAt"`
}

func Open() (*DB, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	appDir := filepath.Join(configDir, "PulsaresExplorer")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, fmt.Errorf("create config dir: %w", err)
	}

	dbPath := filepath.Join(appDir, "explorer.db")
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db := &DB{DB: sqlDB}
	if err := db.migrate(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return db, nil
}

func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY
	);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS session (
		id TEXT PRIMARY KEY,
		data TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS closed_tabs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		data TEXT NOT NULL,
		closed_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS op_journal (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		op_type TEXT NOT NULL,
		src_path TEXT NOT NULL,
		dst_path TEXT NOT NULL,
		undone INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := db.Exec(schema)
	return err
}

func (db *DB) GetSetting(key string) (string, error) {
	var val string
	err := db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return val, err
}

func (db *DB) SetSetting(key, val string) error {
	_, err := db.Exec(
		"INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
		key, val,
	)
	return err
}

func (db *DB) SaveSession(data string) error {
	_, err := db.Exec(
		"INSERT INTO session (id, data, updated_at) VALUES ('default', ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP",
		data,
	)
	return err
}

func (db *DB) LoadSession() (string, error) {
	var data string
	err := db.QueryRow("SELECT data FROM session WHERE id = 'default'").Scan(&data)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return data, err
}

func (db *DB) RecordJournal(opType, srcPath, dstPath string) (int64, error) {
	// Ao registrar uma nova ação, limpar entradas marcadas como undone (nova ramificação de histórico)
	_, _ = db.Exec("DELETE FROM op_journal WHERE undone = 1")
	res, err := db.Exec(
		"INSERT INTO op_journal (op_type, src_path, dst_path, undone) VALUES (?, ?, ?, 0)",
		opType, srcPath, dstPath,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) LastUndoableJournal() (*JournalEntry, error) {
	var e JournalEntry
	var undone int
	err := db.QueryRow(
		"SELECT id, op_type, src_path, dst_path, undone, created_at FROM op_journal WHERE undone = 0 ORDER BY id DESC LIMIT 1",
	).Scan(&e.ID, &e.OpType, &e.SrcPath, &e.DstPath, &undone, &e.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.Undone = undone != 0
	return &e, nil
}

func (db *DB) LastRedoableJournal() (*JournalEntry, error) {
	var e JournalEntry
	var undone int
	err := db.QueryRow(
		"SELECT id, op_type, src_path, dst_path, undone, created_at FROM op_journal WHERE undone = 1 ORDER BY id ASC LIMIT 1",
	).Scan(&e.ID, &e.OpType, &e.SrcPath, &e.DstPath, &undone, &e.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.Undone = undone != 0
	return &e, nil
}

func (db *DB) MarkJournalUndone(id int64, undone bool) error {
	flag := 0
	if undone {
		flag = 1
	}
	_, err := db.Exec("UPDATE op_journal SET undone = ? WHERE id = ?", flag, id)
	return err
}

func (db *DB) ListJournal(limit int) ([]JournalEntry, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := db.Query(
		"SELECT id, op_type, src_path, dst_path, undone, created_at FROM op_journal ORDER BY id DESC LIMIT ?",
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []JournalEntry
	for rows.Next() {
		var e JournalEntry
		var undone int
		if err := rows.Scan(&e.ID, &e.OpType, &e.SrcPath, &e.DstPath, &undone, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Undone = undone != 0
		list = append(list, e)
	}
	return list, rows.Err()
}
