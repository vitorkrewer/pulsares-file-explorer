//go:build !windows

package platform

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type dropboxInfoUnixJSON struct {
	Personal *struct {
		Path string `json:"path"`
	} `json:"personal"`
	Business *struct {
		Path string `json:"path"`
	} `json:"business"`
}

// ListConnectedClouds detecta provedores de nuvem sincronizados ou montados via FileProvider, GVFS, Rclone, FUSE e clientes nativos no macOS e Linux.
func ListConnectedClouds() []CloudProviderInfo {
	var clouds []CloudProviderInfo
	seen := make(map[string]bool)

	addCloud := func(id, name, provider, accountName, rootPath, webURL, remoteSpec string) {
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
		if name == "" {
			name = filepath.Base(clean)
		}
		clouds = append(clouds, CloudProviderInfo{
			ID:          id,
			Name:        name,
			Provider:    provider,
			AccountName: accountName,
			RootPath:    clean,
			WebURL:      webURL,
			RemoteSpec:  remoteSpec,
		})
	}

	home, _ := os.UserHomeDir()

	if home != "" {
		// 1. Dropbox ~/.dropbox/info.json
		infoFile := filepath.Join(home, ".dropbox", "info.json")
		if raw, err := os.ReadFile(infoFile); err == nil {
			var info dropboxInfoUnixJSON
			if json.Unmarshal(raw, &info) == nil {
				if info.Personal != nil && info.Personal.Path != "" {
					addCloud("dropbox", "Dropbox (Pessoal)", "Dropbox", "Pessoal", info.Personal.Path, "https://www.dropbox.com/home", "")
				}
				if info.Business != nil && info.Business.Path != "" {
					addCloud("dropbox", "Dropbox (Business)", "Dropbox", "Business", info.Business.Path, "https://www.dropbox.com/home", "")
				}
			}
		}

		// 2. macOS iCloud Drive (~/Library/Mobile Documents/com~apple~CloudDocs) e ~/Library/CloudStorage/*
		if runtime.GOOS == "darwin" {
			icloudDocs := filepath.Join(home, "Library", "Mobile Documents", "com~apple~CloudDocs")
			addCloud("icloud", "iCloud Drive", "iCloud Drive", "", icloudDocs, "https://www.icloud.com/iclouddrive", "")

			cloudStorageDir := filepath.Join(home, "Library", "CloudStorage")
			if entries, err := os.ReadDir(cloudStorageDir); err == nil {
				for _, entry := range entries {
					if !entry.IsDir() {
						continue
					}
					name := entry.Name()
					full := filepath.Join(cloudStorageDir, name)
					if id, prov, acct, webURL, ok := ClassifyCloudFolderByName(name); ok {
						addCloud(id, name, prov, acct, full, webURL, "")
					} else {
						addCloud("cloudstorage", name, name, "", full, "", "")
					}
				}
			}

			// Volumes montados em /Volumes (pCloud, Google Drive, SeaDrive, Tresorit)
			if vols, err := os.ReadDir("/Volumes"); err == nil {
				for _, v := range vols {
					if !v.IsDir() {
						continue
					}
					if id, prov, acct, webURL, ok := ClassifyCloudFolderByName(v.Name()); ok {
						addCloud(id, v.Name(), prov, acct, filepath.Join("/Volumes", v.Name()), webURL, "")
					}
				}
			}
		}

		// 3. Pastas de nuvem na home do usuário (OneDrive, Google Drive, Dropbox, Nextcloud, ownCloud, pCloudDrive, MEGA, Proton Drive, SynologyDrive, Qsync, Seafile, Tresorit, Yandex.Disk)
		if entries, err := os.ReadDir(home); err == nil {
			for _, entry := range entries {
				if !entry.IsDir() {
					continue
				}
				name := entry.Name()
				if id, prov, acct, webURL, ok := ClassifyCloudFolderByName(name); ok {
					addCloud(id, name, prov, acct, filepath.Join(home, name), webURL, "")
				}
			}
		}
	}

	// 4. Linux: Montagens GVFS (/run/user/<uid>/gvfs/*) e FUSE (/proc/mounts: fuse.rclone, fuse.onedriver)
	if runtime.GOOS == "linux" {
		uid := strconv.Itoa(os.Getuid())
		gvfsDir := filepath.Join("/run/user", uid, "gvfs")
		if entries, err := os.ReadDir(gvfsDir); err == nil {
			for _, entry := range entries {
				if !entry.IsDir() {
					continue
				}
				name := entry.Name()
				low := strings.ToLower(name)
				full := filepath.Join(gvfsDir, name)
				switch {
				case strings.HasPrefix(low, "google-drive:"):
					addCloud("gdrive", "Google Drive (GVFS)", "Google Drive", "", full, "https://drive.google.com/drive/my-drive", name)
				case strings.HasPrefix(low, "onedrive:"):
					addCloud("onedrive", "OneDrive (GVFS)", "OneDrive", "", full, "https://onedrive.live.com", name)
				case strings.HasPrefix(low, "davs:") || strings.HasPrefix(low, "dav:"):
					addCloud("nextcloud", "Nextcloud / WebDAV (GVFS)", "Nextcloud", "", full, "", name)
				}
			}
		}

		if rawMounts, err := os.ReadFile("/proc/mounts"); err == nil {
			lines := strings.Split(string(rawMounts), "\n")
			for _, line := range lines {
				fields := strings.Fields(line)
				if len(fields) < 3 {
					continue
				}
				devSpec := fields[0]
				mountPt := strings.ReplaceAll(fields[1], `\040`, " ")
				fsType := strings.ToLower(fields[2])

				switch {
				case strings.Contains(fsType, "rclone"):
					label := fmt.Sprintf("Rclone (%s)", strings.TrimSuffix(devSpec, ":"))
					addCloud("rclone", label, "Rclone Cloud", "", mountPt, "", devSpec)
				case strings.Contains(fsType, "onedriver"):
					addCloud("onedrive", fmt.Sprintf("OneDrive (%s)", filepath.Base(mountPt)), "OneDrive", "", mountPt, "https://onedrive.live.com", devSpec)
				case strings.Contains(fsType, "pcloud"):
					addCloud("pcloud", "pCloud Drive", "pCloud Drive", "", mountPt, "https://my.pcloud.com", devSpec)
				}
			}
		}
	}

	return clouds
}

// GetCloudItemStatus verifica se o caminho pertence a uma nuvem conectada no macOS ou Linux e inspeciona seu estado de hidratação/sincronização.
func GetCloudItemStatus(targetPath string) CloudItemStatus {
	clean := filepath.Clean(strings.TrimSpace(targetPath))
	if clean == "" || clean == "." {
		return CloudItemStatus{IsInCloud: false}
	}

	clouds := ListConnectedClouds()
	matched := normalizeCloudRootMatch(clean, clouds)
	if matched == nil {
		return CloudItemStatus{IsInCloud: false}
	}

	rel, err := filepath.Rel(matched.RootPath, clean)
	if err != nil || rel == "." {
		rel = ""
	}

	pinState, pinLabel := inspectUnixCloudAttributes(clean, matched)
	canPin := runtime.GOOS == "darwin" || matched.ID == "rclone" || matched.ID == "dropbox" || matched.ID == "onedrive"

	return CloudItemStatus{
		IsInCloud:    true,
		ProviderID:   matched.ID,
		Provider:     matched.Provider,
		DisplayName:  matched.Name,
		RootPath:     matched.RootPath,
		RelativePath: filepath.ToSlash(rel),
		PinState:     pinState,
		PinLabel:     pinLabel,
		WebURL:       matched.WebURL,
		CanPin:       canPin,
		RemoteSpec:   matched.RemoteSpec,
	}
}

func inspectUnixCloudAttributes(targetPath string, prov *CloudProviderInfo) (string, string) {
	// No Linux, se for Dropbox e a CLI oficial estiver disponível, consulta o status em tempo real
	if runtime.GOOS == "linux" && prov.ID == "dropbox" {
		if dropboxBin, err := exec.LookPath("dropbox"); err == nil && dropboxBin != "" {
			if out, err := exec.Command(dropboxBin, "filestatus", targetPath).Output(); err == nil {
				lowerOut := strings.ToLower(string(out))
				if strings.Contains(lowerOut, "syncing") {
					return "syncing", "Sincronizando com o Dropbox…"
				}
				if strings.Contains(lowerOut, "up to date") {
					return "pinned", "Sincronizado neste dispositivo"
				}
			}
		}
	}

	// Verifica via syscall.Stat_t se o arquivo é dataless/sparse (Blocks == 0 com Size > 0)
	if fi, err := os.Stat(targetPath); err == nil && !fi.IsDir() {
		if st, ok := fi.Sys().(*syscall.Stat_t); ok && st != nil {
			if fi.Size() > 0 && st.Blocks == 0 {
				return "online_only", "Disponível apenas na nuvem (sob demanda)"
			}
		}
	}

	return "available", "Disponível neste dispositivo"
}

// ExecuteCloudAction executa ações nativas de nuvem no macOS (brctl / fileproviderctl) e Linux (rclone / dropbox CLI / Nextcloud socket).
func ExecuteCloudAction(targetPath string, action string) error {
	clean := filepath.Clean(strings.TrimSpace(targetPath))
	if clean == "" {
		return fmt.Errorf("empty target path")
	}
	status := GetCloudItemStatus(clean)
	if !status.IsInCloud {
		return fmt.Errorf("path is not inside a connected cloud folder")
	}

	act := strings.ToLower(strings.TrimSpace(action))

	switch act {
	case "pin", "hydrate":
		if runtime.GOOS == "darwin" {
			if status.ProviderID == "icloud" {
				if bin, err := exec.LookPath("brctl"); err == nil && bin != "" {
					return exec.Command(bin, "download", clean).Start()
				}
			}
			if bin, err := exec.LookPath("fileproviderctl"); err == nil && bin != "" {
				return exec.Command(bin, "materialize", clean).Start()
			}
		}
		// Fallback universal: ler o primeiro byte aciona a hidratação pelo FileProvider / FUSE
		if fi, err := os.Stat(clean); err == nil && !fi.IsDir() {
			go func(p string) {
				if f, err := os.Open(p); err == nil {
					buf := make([]byte, 1)
					_, _ = f.Read(buf)
					_ = f.Close()
				}
			}(clean)
		}
		return nil

	case "unpin":
		if runtime.GOOS == "darwin" {
			if status.ProviderID == "icloud" {
				if bin, err := exec.LookPath("brctl"); err == nil && bin != "" {
					return exec.Command(bin, "evict", clean).Start()
				}
			}
			if bin, err := exec.LookPath("fileproviderctl"); err == nil && bin != "" {
				return exec.Command(bin, "evict", clean).Start()
			}
		}
		if runtime.GOOS == "linux" {
			if status.ProviderID == "rclone" && status.RelativePath != "" {
				if bin, err := exec.LookPath("rclone"); err == nil && bin != "" {
					return exec.Command(bin, "rc", "vfs/forget", "file="+status.RelativePath).Start()
				}
			}
			if status.ProviderID == "dropbox" {
				if bin, err := exec.LookPath("dropbox"); err == nil && bin != "" {
					return exec.Command(bin, "exclude", "add", clean).Start()
				}
			}
		}
		return nil

	case "share":
		// 1. Rclone: gera link público via `rclone link <remoteSpec>/<relPath>` e copia para a área de transferência
		if status.ProviderID == "rclone" && status.RemoteSpec != "" {
			if bin, err := exec.LookPath("rclone"); err == nil && bin != "" {
				remoteTarget := strings.TrimSuffix(status.RemoteSpec, "/")
				if status.RelativePath != "" {
					remoteTarget += "/" + status.RelativePath
				}
				if out, err := exec.Command(bin, "link", remoteTarget).Output(); err == nil {
					link := strings.TrimSpace(string(out))
					if strings.HasPrefix(link, "http") {
						_ = WriteNativeClipboardText(link)
						return OpenPath(link)
					}
				}
			}
		}

		// 2. Dropbox CLI no Linux: `dropbox sharelink <path>`
		if status.ProviderID == "dropbox" {
			if bin, err := exec.LookPath("dropbox"); err == nil && bin != "" {
				if out, err := exec.Command(bin, "sharelink", clean).Output(); err == nil {
					link := strings.TrimSpace(string(out))
					if strings.HasPrefix(link, "http") {
						_ = WriteNativeClipboardText(link)
						return OpenPath(link)
					}
				}
			}
		}

		// 3. Nextcloud / ownCloud Desktop Socket API
		if status.ProviderID == "nextcloud" || status.ProviderID == "owncloud" {
			if sendNextcloudSocketCommand("SHARE:" + clean) {
				return nil
			}
		}

		if status.WebURL != "" {
			return OpenPath(status.WebURL)
		}
		return nil

	case "version_history":
		if status.ProviderID == "nextcloud" || status.ProviderID == "owncloud" {
			if sendNextcloudSocketCommand("ACTIVITY:" + clean) {
				return nil
			}
		}
		if status.WebURL != "" {
			return OpenPath(status.WebURL)
		}
		return nil

	case "view_online":
		if status.WebURL != "" {
			webURL := status.WebURL
			if status.ProviderID == "dropbox" && status.RelativePath != "" {
				webURL = strings.TrimRight(webURL, "/") + "/" + status.RelativePath
			}
			return OpenPath(webURL)
		}
		return nil
	}

	return nil
}

func sendNextcloudSocketCommand(cmdLine string) bool {
	runtimeDir := os.Getenv("XDG_RUNTIME_DIR")
	if runtimeDir == "" {
		runtimeDir = fmt.Sprintf("/run/user/%d", os.Getuid())
	}
	candidates := []string{
		filepath.Join(runtimeDir, "Nextcloud", "socket"),
		filepath.Join(runtimeDir, "ownCloud", "socket"),
	}
	for _, sockPath := range candidates {
		conn, err := net.DialTimeout("unix", sockPath, 600*time.Millisecond)
		if err != nil {
			continue
		}
		_, _ = conn.Write([]byte(cmdLine + "\n"))
		_ = conn.Close()
		return true
	}
	return false
}
