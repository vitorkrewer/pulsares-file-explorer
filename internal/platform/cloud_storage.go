package platform

// CloudProviderInfo representa um serviço de armazenamento em nuvem conectado e montado localmente.
type CloudProviderInfo struct {
	ID          string `json:"id"`          // "onedrive" | "gdrive" | "dropbox" | "icloud" | "nextcloud" | "mega" | "box"
	Name        string `json:"name"`        // Ex: "OneDrive - Grupo Focus", "Google Drive", "Dropbox"
	Provider    string `json:"provider"`    // "OneDrive" | "Google Drive" | "Dropbox" | "iCloud Drive" | "Nextcloud" | "MEGA" | "Box"
	AccountName string `json:"accountName"` // Ex: "Grupo Focus", "Pessoal"
	RootPath    string `json:"rootPath"`    // Caminho raiz sincronizado localmente
	WebURL      string `json:"webUrl"`      // URL base do portal web da nuvem
}

// CloudItemStatus descreve o estado de sincronização/hidratação de um arquivo ou pasta dentro de um provedor de nuvem.
type CloudItemStatus struct {
	IsInCloud   bool   `json:"isInCloud"`
	ProviderID  string `json:"providerId"`  // "onedrive" | "gdrive" | "dropbox" | ...
	Provider    string `json:"provider"`    // "OneDrive", "Google Drive", "Dropbox", etc.
	DisplayName string `json:"displayName"` // Ex: "OneDrive - Grupo Focus"
	RootPath    string `json:"rootPath"`
	RelativePath string `json:"relativePath"`
	PinState    string `json:"pinState"`    // "pinned" ("Sempre neste dispositivo") | "online_only" ("Apenas online") | "available" ("Disponível localmente")
	PinLabel    string `json:"pinLabel"`
	WebURL      string `json:"webUrl"`
	CanPin      bool   `json:"canPin"`
}

