package storage

import (
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"strings"
)

const DefaultClipboardMaxUnpinned = 20

type ClipboardHistoryItem struct {
	ID          int64  `json:"id"`
	Kind        string `json:"kind"`        // "text" | "image" | "files"
	Content     string `json:"content"`     // plain text, data:image/png;base64,..., or JSON {"paths":[...],"mode":"copy"|"cut"}
	Preview     string `json:"preview"`     // short summary/first lines or file names
	ContentHash string `json:"contentHash"` // SHA-256 hex for deduplication
	ByteSize    int64  `json:"byteSize"`
	Width       int    `json:"width,omitempty"`
	Height      int    `json:"height,omitempty"`
	Pinned      bool   `json:"pinned"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

func (db *DB) migrateClipboard() error {
	schema := `
	CREATE TABLE IF NOT EXISTS clipboard_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		kind TEXT NOT NULL,
		content TEXT NOT NULL,
		preview TEXT NOT NULL DEFAULT '',
		content_hash TEXT NOT NULL,
		byte_size INTEGER NOT NULL DEFAULT 0,
		width INTEGER NOT NULL DEFAULT 0,
		height INTEGER NOT NULL DEFAULT 0,
		pinned INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_clipboard_content_hash ON clipboard_history(content_hash);
	CREATE INDEX IF NOT EXISTS idx_clipboard_updated ON clipboard_history(pinned DESC, updated_at DESC);
	`
	_, err := db.Exec(schema)
	return err
}

func computeClipboardHash(kind, content string) string {
	sum := sha256.Sum256([]byte(kind + ":" + content))
	return hex.EncodeToString(sum[:])
}

func estimateClipboardByteSize(kind, content string) int64 {
	if kind == "image" {
		if idx := strings.Index(content, ";base64,"); idx != -1 {
			b64 := content[idx+8:]
			if decodedLen := base64.StdEncoding.DecodedLen(len(b64)); decodedLen > 0 {
				return int64(decodedLen)
			}
		}
	}
	return int64(len(content))
}

func summarizeClipboardPreview(kind, content, preview string) string {
	trimmedPreview := strings.TrimSpace(preview)
	if trimmedPreview != "" {
		if len([]rune(trimmedPreview)) > 280 {
			runes := []rune(trimmedPreview)
			return string(runes[:280]) + "…"
		}
		return trimmedPreview
	}
	if kind == "text" {
		clean := strings.TrimSpace(content)
		runes := []rune(clean)
		if len(runes) > 280 {
			return string(runes[:280]) + "…"
		}
		return clean
	}
	if kind == "image" {
		return "Imagem da área de transferência"
	}
	return ""
}

func (db *DB) AddClipboardItem(kind, content, preview string, width, height, maxUnpinned int) (*ClipboardHistoryItem, error) {
	cleanKind := strings.ToLower(strings.TrimSpace(kind))
	if cleanKind == "" {
		cleanKind = "text"
	}
	if maxUnpinned <= 0 {
		maxUnpinned = DefaultClipboardMaxUnpinned
	}

	hash := computeClipboardHash(cleanKind, content)
	byteSize := estimateClipboardByteSize(cleanKind, content)
	summary := summarizeClipboardPreview(cleanKind, content, preview)

	_, err := db.Exec(`
		INSERT INTO clipboard_history (
			kind, content, preview, content_hash, byte_size, width, height, pinned, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT(content_hash) DO UPDATE SET
			preview = CASE WHEN excluded.preview != '' THEN excluded.preview ELSE clipboard_history.preview END,
			byte_size = excluded.byte_size,
			width = CASE WHEN excluded.width > 0 THEN excluded.width ELSE clipboard_history.width END,
			height = CASE WHEN excluded.height > 0 THEN excluded.height ELSE clipboard_history.height END,
			updated_at = CURRENT_TIMESTAMP
	`, cleanKind, content, summary, hash, byteSize, width, height)
	if err != nil {
		return nil, err
	}

	// Prune unpinned items beyond maxUnpinned
	_, _ = db.Exec(`
		DELETE FROM clipboard_history
		WHERE pinned = 0
		  AND id NOT IN (
			SELECT id FROM clipboard_history
			WHERE pinned = 0
			ORDER BY updated_at DESC, id DESC
			LIMIT ?
		  )
	`, maxUnpinned)

	return db.GetClipboardItemByHash(hash)
}

func (db *DB) GetClipboardItemByHash(hash string) (*ClipboardHistoryItem, error) {
	var item ClipboardHistoryItem
	var pinned int
	err := db.QueryRow(`
		SELECT id, kind, content, preview, content_hash, byte_size, width, height, pinned, created_at, updated_at
		FROM clipboard_history
		WHERE content_hash = ?
	`, hash).Scan(
		&item.ID,
		&item.Kind,
		&item.Content,
		&item.Preview,
		&item.ContentHash,
		&item.ByteSize,
		&item.Width,
		&item.Height,
		&pinned,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	item.Pinned = pinned != 0
	return &item, nil
}

func (db *DB) GetClipboardItem(id int64) (*ClipboardHistoryItem, error) {
	var item ClipboardHistoryItem
	var pinned int
	err := db.QueryRow(`
		SELECT id, kind, content, preview, content_hash, byte_size, width, height, pinned, created_at, updated_at
		FROM clipboard_history
		WHERE id = ?
	`, id).Scan(
		&item.ID,
		&item.Kind,
		&item.Content,
		&item.Preview,
		&item.ContentHash,
		&item.ByteSize,
		&item.Width,
		&item.Height,
		&pinned,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	item.Pinned = pinned != 0
	return &item, nil
}

func (db *DB) ListClipboardHistory(maxUnpinned int) ([]ClipboardHistoryItem, error) {
	if maxUnpinned <= 0 {
		maxUnpinned = DefaultClipboardMaxUnpinned
	}
	rows, err := db.Query(`
		SELECT id, kind, content, preview, content_hash, byte_size, width, height, pinned, created_at, updated_at
		FROM clipboard_history
		WHERE pinned = 1
		   OR id IN (
			SELECT id FROM clipboard_history
			WHERE pinned = 0
			ORDER BY updated_at DESC, id DESC
			LIMIT ?
		   )
		ORDER BY pinned DESC, updated_at DESC, id DESC
	`, maxUnpinned)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ClipboardHistoryItem
	for rows.Next() {
		var item ClipboardHistoryItem
		var pinned int
		if err := rows.Scan(
			&item.ID,
			&item.Kind,
			&item.Content,
			&item.Preview,
			&item.ContentHash,
			&item.ByteSize,
			&item.Width,
			&item.Height,
			&pinned,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.Pinned = pinned != 0
		out = append(out, item)
	}
	return out, rows.Err()
}

func (db *DB) TogglePinClipboardItem(id int64, maxUnpinned int) error {
	if maxUnpinned <= 0 {
		maxUnpinned = DefaultClipboardMaxUnpinned
	}
	_, err := db.Exec(`
		UPDATE clipboard_history
		SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, id)
	if err != nil {
		return err
	}

	// Enforce limit on unpinned items if an item was unpinned
	_, _ = db.Exec(`
		DELETE FROM clipboard_history
		WHERE pinned = 0
		  AND id NOT IN (
			SELECT id FROM clipboard_history
			WHERE pinned = 0
			ORDER BY updated_at DESC, id DESC
			LIMIT ?
		  )
	`, maxUnpinned)
	return nil
}

func (db *DB) DeleteClipboardItem(id int64) error {
	_, err := db.Exec("DELETE FROM clipboard_history WHERE id = ?", id)
	return err
}

func (db *DB) ClearUnpinnedClipboardHistory() error {
	_, err := db.Exec("DELETE FROM clipboard_history WHERE pinned = 0")
	return err
}

