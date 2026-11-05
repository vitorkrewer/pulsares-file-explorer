//go:build linux

package platform

import (
	"os"
	"os/exec"
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

