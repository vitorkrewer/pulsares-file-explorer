package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

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

type FavoriteItem struct {
	Path     string `json:"path"`
	Label    string `json:"label"`
	Position int    `json:"position"`
}

type RecentItem struct {
	Path        string `json:"path"`
	VisitCount  int    `json:"visitCount"`
	LastVisited string `json:"lastVisited"`
}

type IndexedRoot struct {
	RootPath  string `json:"rootPath"`
	ItemCount int    `json:"itemCount"`
	UpdatedAt string `json:"updatedAt"`
}

type IndexedEntry struct {
	Path    string `json:"path"`
	Root    string `json:"root"`
	Name    string `json:"name"`
	Ext     string `json:"ext"`
	Kind    string `json:"kind"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
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
	return OpenPath(dbPath)
}

func OpenPath(dbPath string) (*DB, error) {
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

	CREATE TABLE IF NOT EXISTS favorites (
		path TEXT PRIMARY KEY,
		label TEXT NOT NULL,
		position INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS history (
		path TEXT PRIMARY KEY,
		visit_count INTEGER NOT NULL DEFAULT 1,
		last_visited DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS index_roots (
		root_path TEXT PRIMARY KEY,
		item_count INTEGER NOT NULL DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS index_entries (
		path TEXT PRIMARY KEY,
		root_path TEXT NOT NULL,
		name TEXT NOT NULL,
		name_lower TEXT NOT NULL,
		ext TEXT NOT NULL,
		kind TEXT NOT NULL,
		size INTEGER NOT NULL DEFAULT 0,
		mod_time TEXT NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_entries_name_lower ON index_entries(name_lower);
	CREATE INDEX IF NOT EXISTS idx_entries_root ON index_entries(root_path);
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

func (db *DB) ListFavorites() ([]FavoriteItem, error) {
	rows, err := db.Query("SELECT path, label, position FROM favorites ORDER BY position ASC, created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []FavoriteItem
	for rows.Next() {
		var f FavoriteItem
		if err := rows.Scan(&f.Path, &f.Label, &f.Position); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (db *DB) AddFavorite(path, label string) error {
	clean := filepath.Clean(path)
	if label == "" {
		label = filepath.Base(clean)
	}
	var maxPos sql.NullInt64
	_ = db.QueryRow("SELECT MAX(position) FROM favorites").Scan(&maxPos)
	nextPos := int(maxPos.Int64) + 1

	_, err := db.Exec(
		"INSERT INTO favorites (path, label, position) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET label = excluded.label",
		clean, label, nextPos,
	)
	return err
}

func (db *DB) RemoveFavorite(path string) error {
	clean := filepath.Clean(path)
	_, err := db.Exec("DELETE FROM favorites WHERE path = ? OR path = ?", clean, path)
	return err
}

func (db *DB) RecordVisit(path string) error {
	if path == "" {
		return nil
	}
	clean := filepath.Clean(path)
	_, err := db.Exec(
		`INSERT INTO history (path, visit_count, last_visited)
		 VALUES (?, 1, CURRENT_TIMESTAMP)
		 ON CONFLICT(path) DO UPDATE SET
		   visit_count = history.visit_count + 1,
		   last_visited = CURRENT_TIMESTAMP`,
		clean,
	)
	return err
}

func (db *DB) ListRecent(limit int) ([]RecentItem, error) {
	if limit <= 0 {
		limit = 12
	}
	rows, err := db.Query(
		"SELECT path, visit_count, last_visited FROM history ORDER BY last_visited DESC, visit_count DESC LIMIT ?",
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []RecentItem
	for rows.Next() {
		var r RecentItem
		if err := rows.Scan(&r.Path, &r.VisitCount, &r.LastVisited); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (db *DB) ReplaceIndexedEntries(rootPath string, entries []IndexedEntry) error {
	cleanRoot := filepath.Clean(rootPath)
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec("DELETE FROM index_entries WHERE root_path = ?", cleanRoot); err != nil {
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO index_entries (path, root_path, name, name_lower, ext, kind, size, mod_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, e := range entries {
		if _, err := stmt.Exec(
			e.Path,
			cleanRoot,
			e.Name,
			strings.ToLower(e.Name),
			strings.ToLower(e.Ext),
			e.Kind,
			e.Size,
			e.ModTime,
		); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(`
		INSERT INTO index_roots (root_path, item_count, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(root_path) DO UPDATE SET
			item_count = excluded.item_count,
			updated_at = CURRENT_TIMESTAMP
	`, cleanRoot, len(entries)); err != nil {
		return err
	}

	return tx.Commit()
}

func (db *DB) ListIndexRoots() ([]IndexedRoot, error) {
	rows, err := db.Query("SELECT root_path, item_count, updated_at FROM index_roots ORDER BY root_path ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []IndexedRoot
	for rows.Next() {
		var r IndexedRoot
		if err := rows.Scan(&r.RootPath, &r.ItemCount, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (db *DB) RemoveIndexRoot(rootPath string) error {
	cleanRoot := filepath.Clean(rootPath)
	_, _ = db.Exec("DELETE FROM index_entries WHERE root_path = ?", cleanRoot)
	_, err := db.Exec("DELETE FROM index_roots WHERE root_path = ?", cleanRoot)
	return err
}

func (db *DB) QueryIndexedEntries(rootPrefix string, nameQuery string, limit int) ([]IndexedEntry, error) {
	if limit <= 0 {
		limit = 500
	}
	q := "%" + strings.ToLower(strings.TrimSpace(nameQuery)) + "%"
	cleanPrefix := filepath.Clean(rootPrefix)

	rows, err := db.Query(`
		SELECT path, root_path, name, ext, kind, size, mod_time
		FROM index_entries
		WHERE (root_path = ? OR path LIKE ?)
		  AND name_lower LIKE ?
		ORDER BY kind ASC, name ASC
		LIMIT ?
	`, cleanPrefix, cleanPrefix+"%", q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []IndexedEntry
	for rows.Next() {
		var e IndexedEntry
		if err := rows.Scan(&e.Path, &e.Root, &e.Name, &e.Ext, &e.Kind, &e.Size, &e.ModTime); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
