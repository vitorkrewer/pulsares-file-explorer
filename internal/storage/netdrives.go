package storage

import (
	"database/sql"
	"errors"
	"strings"
)

// SavedNetworkDrive armazena um atalho para unidade/compartilhamento de rede sem persistir senhas em texto puro.
type SavedNetworkDrive struct {
	ID          int64  `json:"id"`
	Label       string `json:"label"`
	Address     string `json:"address"`
	Protocol    string `json:"protocol"`
	Username    string `json:"username"`
	Domain      string `json:"domain"`
	DriveLetter string `json:"driveLetter"`
	CreatedAt   string `json:"createdAt"`
}

func (db *DB) migrateNetworkDrives() error {
	schema := `
	CREATE TABLE IF NOT EXISTS saved_network_drives (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		label TEXT NOT NULL DEFAULT '',
		address TEXT NOT NULL,
		protocol TEXT NOT NULL DEFAULT 'smb',
		username TEXT NOT NULL DEFAULT '',
		domain TEXT NOT NULL DEFAULT '',
		drive_letter TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_saved_netdrives_address ON saved_network_drives(address);
	`
	_, err := db.Exec(schema)
	return err
}

func (db *DB) SaveNetworkDrive(d SavedNetworkDrive) (int64, error) {
	addr := strings.TrimSpace(d.Address)
	if addr == "" {
		return 0, errors.New("network address cannot be empty")
	}
	label := strings.TrimSpace(d.Label)
	if label == "" {
		label = addr
	}
	proto := strings.TrimSpace(d.Protocol)
	if proto == "" {
		proto = "smb"
	}
	username := strings.TrimSpace(d.Username)
	domain := strings.TrimSpace(d.Domain)
	driveLetter := strings.ToUpper(strings.TrimRight(strings.TrimSpace(d.DriveLetter), `\`))

	if d.ID > 0 {
		_, err := db.Exec(
			`UPDATE saved_network_drives
			 SET label = ?, address = ?, protocol = ?, username = ?, domain = ?, drive_letter = ?
			 WHERE id = ?`,
			label, addr, proto, username, domain, driveLetter, d.ID,
		)
		return d.ID, err
	}

	var existingID int64
	err := db.QueryRow(
		`SELECT id FROM saved_network_drives WHERE LOWER(address) = LOWER(?) LIMIT 1`,
		addr,
	).Scan(&existingID)
	if err == nil && existingID > 0 {
		_, updErr := db.Exec(
			`UPDATE saved_network_drives
			 SET label = ?, address = ?, protocol = ?, username = ?, domain = ?, drive_letter = ?
			 WHERE id = ?`,
			label, addr, proto, username, domain, driveLetter, existingID,
		)
		return existingID, updErr
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}

	res, err := db.Exec(
		`INSERT INTO saved_network_drives (label, address, protocol, username, domain, drive_letter)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		label, addr, proto, username, domain, driveLetter,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) ListSavedNetworkDrives() ([]SavedNetworkDrive, error) {
	rows, err := db.Query(
		`SELECT id, label, address, protocol, username, domain, drive_letter, created_at
		 FROM saved_network_drives
		 ORDER BY label COLLATE NOCASE ASC, id ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]SavedNetworkDrive, 0)
	for rows.Next() {
		var d SavedNetworkDrive
		if err := rows.Scan(
			&d.ID,
			&d.Label,
			&d.Address,
			&d.Protocol,
			&d.Username,
			&d.Domain,
			&d.DriveLetter,
			&d.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (db *DB) DeleteSavedNetworkDrive(id int64) error {
	_, err := db.Exec(`DELETE FROM saved_network_drives WHERE id = ?`, id)
	return err
}

