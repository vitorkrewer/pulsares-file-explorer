package platform

import (
	"path/filepath"
	"strings"
)

// CloudProviderInfo representa um serviço de armazenamento em nuvem conectado e montado localmente.
type CloudProviderInfo struct {
	ID          string `json:"id"`                   // "onedrive" | "gdrive" | "dropbox" | "icloud" | "nextcloud" | "owncloud" | "mega" | "box" | "pcloud" | "proton" | "synology" | "qsync" | "seafile" | "tresorit" | "yandex" | "rclone" | "gvfs"
	Name        string `json:"name"`                 // Ex: "OneDrive - Grupo Focus", "Google Drive", "Dropbox", "pCloud Drive"
	Provider    string `json:"provider"`             // Nome amigável do provedor
	AccountName string `json:"accountName"`          // Ex: "Grupo Focus", "Pessoal"
	RootPath    string `json:"rootPath"`             // Caminho raiz sincronizado ou montado localmente
	WebURL      string `json:"webUrl"`               // URL base do portal web da nuvem
	RemoteSpec  string `json:"remoteSpec,omitempty"` // Especificação de montagem remota (ex: rclone "gdrive:Projetos" ou URI GVFS)
}

// CloudItemStatus descreve o estado de sincronização/hidratação de um arquivo ou pasta dentro de um provedor de nuvem.
type CloudItemStatus struct {
	IsInCloud    bool   `json:"isInCloud"`
	ProviderID   string `json:"providerId"`
	Provider     string `json:"provider"`
	DisplayName  string `json:"displayName"`
	RootPath     string `json:"rootPath"`
	RelativePath string `json:"relativePath"`
	PinState     string `json:"pinState"` // "pinned" | "online_only" | "available" | "syncing"
	PinLabel     string `json:"pinLabel"`
	WebURL       string `json:"webUrl"`
	CanPin       bool   `json:"canPin"`
	RemoteSpec   string `json:"remoteSpec,omitempty"`
}

// ClassifyCloudFolderByName identifica o provedor de nuvem a partir do nome de uma pasta raiz ou ponto de montagem.
func ClassifyCloudFolderByName(folderName string) (id string, provider string, account string, webURL string, matched bool) {
	trimmed := strings.TrimSpace(folderName)
	if trimmed == "" {
		return "", "", "", "", false
	}
	low := strings.ToLower(trimmed)

	switch {
	case strings.HasPrefix(low, "onedrive"):
		acct := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(trimmed, "OneDrive"), "-"))
		return "onedrive", "OneDrive", acct, "https://onedrive.live.com", true

	case strings.HasPrefix(low, "google drive") || strings.HasPrefix(low, "googledrive") || low == "meu drive" || low == "my drive":
		acct := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(trimmed, "GoogleDrive"), "-"))
		return "gdrive", "Google Drive", acct, "https://drive.google.com/drive/my-drive", true

	case strings.HasPrefix(low, "dropbox"):
		acct := strings.TrimSpace(strings.Trim(strings.TrimPrefix(trimmed, "Dropbox"), " ()-"))
		return "dropbox", "Dropbox", acct, "https://www.dropbox.com/home", true

	case low == "iclouddrive" || low == "icloud drive" || strings.HasPrefix(low, "com~apple~clouddocs"):
		return "icloud", "iCloud Drive", "", "https://www.icloud.com/iclouddrive", true

	case strings.HasPrefix(low, "nextcloud"):
		return "nextcloud", "Nextcloud", "", "", true

	case strings.HasPrefix(low, "owncloud"):
		return "owncloud", "ownCloud", "", "", true

	case strings.HasPrefix(low, "mega") || low == "megasync":
		return "mega", "MEGA", "", "https://mega.nz/fm", true

	case low == "box" || low == "box sync" || strings.HasPrefix(low, "box-"):
		return "box", "Box", "", "https://app.box.com", true

	case strings.HasPrefix(low, "pcloud") || low == "pclouddrive":
		return "pcloud", "pCloud Drive", "", "https://my.pcloud.com", true

	case strings.HasPrefix(low, "proton drive") || strings.HasPrefix(low, "protondrive"):
		return "proton", "Proton Drive", "", "https://drive.proton.me", true

	case strings.HasPrefix(low, "synologydrive") || strings.HasPrefix(low, "synology drive"):
		return "synology", "Synology Drive", "", "", true

	case strings.HasPrefix(low, "qsync") || strings.HasPrefix(low, "qnap"):
		return "qsync", "QNAP Qsync", "", "", true

	case strings.HasPrefix(low, "seafile") || strings.HasPrefix(low, "seadrive"):
		return "seafile", "Seafile", "", "", true

	case strings.HasPrefix(low, "tresorit"):
		return "tresorit", "Tresorit", "", "https://web.tresorit.com", true

	case strings.HasPrefix(low, "yandex.disk") || strings.HasPrefix(low, "yandex disk") || strings.HasPrefix(low, "yandexdisk"):
		return "yandex", "Yandex Disk", "", "https://disk.yandex.com", true
	}

	return "", "", "", "", false
}

func normalizeCloudRootMatch(cleanTarget string, clouds []CloudProviderInfo) *CloudProviderInfo {
	var matched *CloudProviderInfo
	targetNorm := strings.ToLower(filepath.ToSlash(filepath.Clean(cleanTarget)))
	for i := range clouds {
		rootNorm := strings.ToLower(filepath.ToSlash(filepath.Clean(clouds[i].RootPath)))
		rootPrefix := strings.TrimSuffix(rootNorm, "/") + "/"
		if targetNorm == rootNorm || strings.HasPrefix(targetNorm, rootPrefix) {
			if matched == nil || len(clouds[i].RootPath) > len(matched.RootPath) {
				matched = &clouds[i]
			}
		}
	}
	return matched
}
