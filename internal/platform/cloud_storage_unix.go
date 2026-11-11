//go:build !windows

package platform

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type dropboxInfoUnixJSON struct {
	Personal *struct {
		Path string `json:"path"`
	} `json:"personal"`
	Business *struct {
		Path string `json:"path"`
	} `json:"business"`
}

// ListConnectedClouds detecta provedores de nuvem sincronizados localmente em sistemas macOS e Linux.
func ListConnectedClouds() []CloudProviderInfo {
	var clouds []CloudProviderInfo
	seen := make(map[string]bool)

	addCloud := func(id, name, provider, accountName, rootPath, webURL string) {
		clean := filepath.Clean(strings.TrimSpace(rootPath))
		if clean == "" || clean == "." {
			return
		}
		fi, err := os.Stat(clean)
		if err != nil || !fi.IsDir() {
			return
		}
		if seen[clean] {
			return
		}
		seen[clean] = true
		clouds = append(clouds, CloudProviderInfo{
			ID:          id,
			Name:        name,
			Provider:    provider,
			AccountName: accountName,
			RootPath:    clean,
			WebURL:      webURL,
		})
	}

	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return clouds
	}

	// Dropbox ~/.dropbox/info.json
	infoFile := filepath.Join(home, ".dropbox", "info.json")
	if raw, err := os.ReadFile(infoFile); err == nil {
		var info dropboxInfoUnixJSON
		if json.Unmarshal(raw, &info) == nil {
			if info.Personal != nil && info.Personal.Path != "" {
				addCloud("dropbox", "Dropbox (Pessoal)", "Dropbox", "Pessoal", info.Personal.Path, "https://www.dropbox.com/home")
			}
			if info.Business != nil && info.Business.Path != "" {
				addCloud("dropbox", "Dropbox (Business)", "Dropbox", "Business", info.Business.Path, "https://www.dropbox.com/home")
			}
		}
	}

	// macOS ~/Library/CloudStorage/*
	cloudStorageDir := filepath.Join(home, "Library", "CloudStorage")
	if entries, err := os.ReadDir(cloudStorageDir); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			name := entry.Name()
			low := strings.ToLower(name)
			full := filepath.Join(cloudStorageDir, name)
			switch {
			case strings.HasPrefix(low, "onedrive"):
				addCloud("onedrive", name, "OneDrive", "", full, "https://onedrive.live.com")
			case strings.HasPrefix(low, "googledrive"):
				addCloud("gdrive", name, "Google Drive", "", full, "https://drive.google.com/drive/my-drive")
			case strings.HasPrefix(low, "dropbox"):
				addCloud("dropbox", name, "Dropbox", "", full, "https://www.dropbox.com/home")
			}
		}
	}

	if entries, err := os.ReadDir(home); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			name := entry.Name()
			low := strings.ToLower(name)
			full := filepath.Join(home, name)
			switch {
			case strings.HasPrefix(low, "onedrive"):
				addCloud("onedrive", name, "OneDrive", "", full, "https://onedrive.live.com")
			case strings.HasPrefix(low, "google drive") || low == "meu drive" || low == "my drive":
				addCloud("gdrive", name, "Google Drive", "", full, "https://drive.google.com/drive/my-drive")
			case strings.HasPrefix(low, "dropbox"):
				addCloud("dropbox", name, "Dropbox", "", full, "https://www.dropbox.com/home")
			case strings.HasPrefix(low, "nextcloud"):
				addCloud("nextcloud", name, "Nextcloud", "", full, "")
			case strings.HasPrefix(low, "mega"):
				addCloud("mega", name, "MEGA", "", full, "https://mega.nz/fm")
			}
		}
	}

	return clouds
}

func GetCloudItemStatus(targetPath string) CloudItemStatus {
	clean := filepath.Clean(strings.TrimSpace(targetPath))
	if clean == "" || clean == "." {
		return CloudItemStatus{IsInCloud: false}
	}

	clouds := ListConnectedClouds()
	var matched *CloudProviderInfo
	for i := range clouds {
		root := clouds[i].RootPath
		if clean == root || strings.HasPrefix(clean, strings.TrimSuffix(root, "/")+ "/") {
			if matched == nil || len(root) > len(matched.RootPath) {
				matched = &clouds[i]
			}
		}
	}

	if matched == nil {
		return CloudItemStatus{IsInCloud: false}
	}

	rel, err := filepath.Rel(matched.RootPath, clean)
	if err != nil || rel == "." {
		rel = ""
	}

	return CloudItemStatus{
		IsInCloud:    true,
		ProviderID:   matched.ID,
		Provider:     matched.Provider,
		DisplayName:  matched.Name,
		RootPath:     matched.RootPath,
		RelativePath: filepath.ToSlash(rel),
		PinState:     "available",
		PinLabel:     "Disponível neste dispositivo",
		WebURL:       matched.WebURL,
		CanPin:       false,
	}
}

func ExecuteCloudAction(targetPath string, action string) error {
	status := GetCloudItemStatus(targetPath)
	if !status.IsInCloud {
		return fmt.Errorf("path is not inside a connected cloud folder")
	}
	if status.WebURL != "" {
		return OpenPath(status.WebURL)
	}
	return nil
}

