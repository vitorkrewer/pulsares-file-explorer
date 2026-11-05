//go:build darwin

package platform

import (
	"os"
	"os/exec"
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

