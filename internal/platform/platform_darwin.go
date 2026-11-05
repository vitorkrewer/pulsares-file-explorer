//go:build darwin

package platform

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func GetSystemLanguage() string {
	out, err := exec.Command("defaults", "read", "-g", "AppleLanguages").Output()
	if err == nil {
		str := string(out)
		if strings.Contains(str, "pt") {
			return "pt-BR"
		}
		if strings.Contains(str, "es") {
			return "es"
		}
		if strings.Contains(str, "en") {
			return "en"
		}
	}
	lang := os.Getenv("LANG")
	if lang != "" {
		return lang
	}
	return "en"
}

func OpenPath(path string) error {
	return exec.Command("open", path).Start()
}

func GetDrives() []DriveInfo {
	return []DriveInfo{
		{Path: "/", Label: "/"},
	}
}

func MoveToSystemTrash(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	trashDir := filepath.Join(GetHomeDir(), ".Trash")
	if err := os.MkdirAll(trashDir, 0700); err != nil {
		return err
	}
	base := filepath.Base(abs)
	targetName := base
	for i := 1; ; i++ {
		cand := filepath.Join(trashDir, targetName)
		if _, err := os.Lstat(cand); os.IsNotExist(err) {
			return os.Rename(abs, cand)
		}
		ext := filepath.Ext(base)
		stem := base[:len(base)-len(ext)]
		targetName = fmt.Sprintf("%s %d%s", stem, i, ext)
	}
}

func NormalizeLongPath(path string) string {
	return path
}
