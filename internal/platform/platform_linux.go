//go:build linux

package platform

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func GetSystemLanguage() string {
	for _, env := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if val := os.Getenv(env); val != "" {
			return val
		}
	}
	return "en"
}

func OpenPath(path string) error {
	return exec.Command("xdg-open", path).Start()
}

func GetDrives() []DriveInfo {
	return []DriveInfo{
		{Path: "/", Label: "/"},
	}
}

// MoveToSystemTrash implementa a especificação FreeDesktop.org Trash.
func MoveToSystemTrash(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	dataHome := os.Getenv("XDG_DATA_HOME")
	if dataHome == "" {
		home := GetHomeDir()
		dataHome = filepath.Join(home, ".local", "share")
	}

	trashDir := filepath.Join(dataHome, "Trash")
	filesDir := filepath.Join(trashDir, "files")
	infoDir := filepath.Join(trashDir, "info")

	if err := os.MkdirAll(filesDir, 0700); err != nil {
		return err
	}
	if err := os.MkdirAll(infoDir, 0700); err != nil {
		return err
	}

	base := filepath.Base(abs)
	targetName := base
	for i := 1; ; i++ {
		cand := filepath.Join(filesDir, targetName)
		if _, err := os.Lstat(cand); os.IsNotExist(err) {
			break
		}
		ext := filepath.Ext(base)
		stem := base[:len(base)-len(ext)]
		targetName = fmt.Sprintf("%s.%d%s", stem, i, ext)
	}

	infoContent := fmt.Sprintf(
		"[Trash Info]\nPath=%s\nDeletionDate=%s\n",
		url.PathEscape(abs),
		time.Now().Format("2006-01-02T15:04:05"),
	)
	infoPath := filepath.Join(infoDir, targetName+".trashinfo")
	if err := os.WriteFile(infoPath, []byte(infoContent), 0600); err != nil {
		return err
	}

	if err := os.Rename(abs, filepath.Join(filesDir, targetName)); err != nil {
		_ = os.Remove(infoPath)
		return err
	}
	return nil
}

func NormalizeLongPath(path string) string {
	return path
}
