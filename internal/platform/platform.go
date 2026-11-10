package platform

import (
	"os"
)

type DriveInfo struct {
	Path         string `json:"path"`
	Label        string `json:"label"`
	FreeBytes    uint64 `json:"freeBytes"`
	TotalBytes   uint64 `json:"totalBytes"`
	IsRemovable  bool   `json:"isRemovable"`
	IsNetwork    bool   `json:"isNetwork,omitempty"`
	RemoteTarget string `json:"remoteTarget,omitempty"`
}

func GetHomeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/"
	}
	return home
}
