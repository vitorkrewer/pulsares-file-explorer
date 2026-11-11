//go:build windows

package platform

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

const (
	fileAttributeOffline            = 0x00001000
	fileAttributeRecallOnOpen       = 0x00040000
	fileAttributePinned             = 0x00080000
	fileAttributeUnpinned           = 0x00100000
	fileAttributeRecallOnDataAccess = 0x00400000
)

type dropboxInfoJSON struct {
	Personal *struct {
		Path string `json:"path"`
	} `json:"personal"`
	Business *struct {
		Path string `json:"path"`
	} `json:"business"`
}

// ListConnectedClouds detecta provedores de nuvem instalados e sincronizados no Windows (OneDrive, Google Drive, Dropbox, iCloud, Nextcloud, MEGA, Box).
func ListConnectedClouds() []CloudProviderInfo {
	var clouds []CloudProviderInfo
	seenRoots := make(map[string]bool)

	addCloud := func(id, name, provider, accountName, rootPath, webURL string) {
		cleanRoot := filepath.Clean(strings.TrimSpace(rootPath))
		if cleanRoot == "" || cleanRoot == "." {
			return
		}
		info, err := os.Stat(cleanRoot)
		if err != nil || !info.IsDir() {
			return
		}
		key := strings.ToLower(cleanRoot)
		if seenRoots[key] {
			return
		}
		seenRoots[key] = true
		if name == "" {
			name = filepath.Base(cleanRoot)
		}
		clouds = append(clouds, CloudProviderInfo{
			ID:          id,
			Name:        name,
			Provider:    provider,
			AccountName: accountName,
			RootPath:    cleanRoot,
			WebURL:      webURL,
		})
	}

	// 1. OneDrive via Registro (HKCU\Software\Microsoft\OneDrive\Accounts\*)
	if hAccounts, err := regOpenKey(syscall.HKEY_CURRENT_USER, `Software\Microsoft\OneDrive\Accounts`, syscall.KEY_ENUMERATE_SUB_KEYS); err == nil {
		for _, sub := range regReadSubKeyNames(hAccounts) {
			subPath := `Software\Microsoft\OneDrive\Accounts\` + sub
			if hAcc, err := regOpenKey(syscall.HKEY_CURRENT_USER, subPath, syscall.KEY_QUERY_VALUE); err == nil {
				userFolder, _ := regGetStringValue(hAcc, "UserFolder")
				displayName, _ := regGetStringValue(hAcc, "DisplayName")
				webURL, _ := regGetStringValue(hAcc, "ServiceEndpointUri")
				syscall.RegCloseKey(hAcc)

				if userFolder != "" {
					label := "OneDrive"
					if displayName != "" {
						label = "OneDrive - " + displayName
					} else if base := filepath.Base(userFolder); strings.HasPrefix(strings.ToLower(base), "onedrive") {
						label = base
					}
					portal := "https://onedrive.live.com"
					if strings.Contains(strings.ToLower(webURL), "sharepoint.com") {
						if idx := strings.Index(strings.ToLower(webURL), ".sharepoint.com"); idx > 0 {
							portal = webURL[:idx+len(".sharepoint.com")]
						}
					}
					addCloud("onedrive", label, "OneDrive", displayName, userFolder, portal)
				}
			}
		}
		syscall.RegCloseKey(hAccounts)
	}

	// 2. OneDrive via SyncEngines\Providers\OneDrive (inclui bibliotecas do SharePoint sincronizadas)
	if hSync, err := regOpenKey(syscall.HKEY_CURRENT_USER, `Software\SyncEngines\Providers\OneDrive`, syscall.KEY_ENUMERATE_SUB_KEYS); err == nil {
		for _, sub := range regReadSubKeyNames(hSync) {
			if hProv, err := regOpenKey(syscall.HKEY_CURRENT_USER, `Software\SyncEngines\Providers\OneDrive\`+sub, syscall.KEY_QUERY_VALUE); err == nil {
				mountPt, _ := regGetStringValue(hProv, "MountPoint")
				urlNs, _ := regGetStringValue(hProv, "UrlNamespace")
				syscall.RegCloseKey(hProv)
				if mountPt != "" {
					portal := "https://onedrive.live.com"
					if strings.HasPrefix(strings.ToLower(urlNs), "http") {
						portal = urlNs
					}
					addCloud("onedrive", filepath.Base(mountPt), "OneDrive", "", mountPt, portal)
				}
			}
		}
		syscall.RegCloseKey(hSync)
	}

	// 3. OneDrive via Variáveis de Ambiente
	for _, envKey := range []string{"OneDriveCommercial", "OneDriveConsumer", "OneDrive"} {
		if val := strings.TrimSpace(os.Getenv(envKey)); val != "" {
			addCloud("onedrive", filepath.Base(val), "OneDrive", "", val, "https://onedrive.live.com")
		}
	}

	// 4. Dropbox via %APPDATA%\Dropbox\info.json e %LOCALAPPDATA%\Dropbox\info.json
	for _, envBase := range []string{os.Getenv("APPDATA"), os.Getenv("LOCALAPPDATA")} {
		if envBase == "" {
			continue
		}
		infoFile := filepath.Join(envBase, "Dropbox", "info.json")
		if raw, err := os.ReadFile(infoFile); err == nil {
			var info dropboxInfoJSON
			if json.Unmarshal(raw, &info) == nil {
				if info.Personal != nil && info.Personal.Path != "" {
					addCloud("dropbox", "Dropbox (Pessoal)", "Dropbox", "Pessoal", info.Personal.Path, "https://www.dropbox.com/home")
				}
				if info.Business != nil && info.Business.Path != "" {
					addCloud("dropbox", "Dropbox (Business)", "Dropbox", "Business", info.Business.Path, "https://www.dropbox.com/home")
				}
			}
		}
	}

	// 5. Google Drive for Desktop via Registro (HKCU\Software\Google\DriveFS)
	if hGDrive, err := regOpenKey(syscall.HKEY_CURRENT_USER, `Software\Google\DriveFS`, syscall.KEY_QUERY_VALUE); err == nil {
		mountPt, _ := regGetStringValue(hGDrive, "MountPoint")
		syscall.RegCloseKey(hGDrive)
		if len(mountPt) == 1 {
			driveRoot := strings.ToUpper(mountPt) + `:\`
			addCloud("gdrive", fmt.Sprintf("Google Drive (%s:)", strings.ToUpper(mountPt)), "Google Drive", "", driveRoot, "https://drive.google.com/drive/my-drive")
		} else if mountPt != "" {
			addCloud("gdrive", "Google Drive", "Google Drive", "", mountPt, "https://drive.google.com/drive/my-drive")
		}
	}

	// Verifica unidades montadas que contenham "Meu Drive" ou "My Drive" (Google Drive File Stream)
	for _, d := range GetDrives() {
		for _, subName := range []string{"Meu Drive", "My Drive"} {
			candidate := filepath.Join(d.Path, subName)
			if fi, err := os.Stat(candidate); err == nil && fi.IsDir() {
				addCloud("gdrive", fmt.Sprintf("Google Drive (%s)", strings.TrimSuffix(d.Path, `\`)), "Google Drive", "", d.Path, "https://drive.google.com/drive/my-drive")
			}
		}
	}

	// 6. Pastas de nuvem conhecidas no diretório do usuário (OneDrive*, Google Drive*, Dropbox*, iCloudDrive*, Nextcloud*, MEGA*, Box*)
	if home, err := os.UserHomeDir(); err == nil && home != "" {
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
					acct := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(name, "OneDrive"), "-"))
					addCloud("onedrive", name, "OneDrive", acct, full, "https://onedrive.live.com")
				case strings.HasPrefix(low, "google drive") || low == "meu drive" || low == "my drive":
					addCloud("gdrive", name, "Google Drive", "", full, "https://drive.google.com/drive/my-drive")
				case strings.HasPrefix(low, "dropbox"):
					addCloud("dropbox", name, "Dropbox", "", full, "https://www.dropbox.com/home")
				case low == "iclouddrive" || low == "icloud drive":
					addCloud("icloud", "iCloud Drive", "iCloud Drive", "", full, "https://www.icloud.com/iclouddrive")
				case strings.HasPrefix(low, "nextcloud"):
					addCloud("nextcloud", name, "Nextcloud", "", full, "")
				case strings.HasPrefix(low, "mega"):
					addCloud("mega", name, "MEGA", "", full, "https://mega.nz/fm")
				case low == "box" || low == "box sync":
					addCloud("box", name, "Box", "", full, "https://app.box.com")
				}
			}
		}
	}

	return clouds
}

// GetCloudItemStatus verifica se o caminho informado pertence a uma pasta sincronizada em nuvem e retorna o estado de fixação/hidratação.
func GetCloudItemStatus(targetPath string) CloudItemStatus {
	clean := filepath.Clean(strings.TrimSpace(targetPath))
	if clean == "" || clean == "." {
		return CloudItemStatus{IsInCloud: false}
	}

	cleanLower := strings.ToLower(clean)
	clouds := ListConnectedClouds()

	var matched *CloudProviderInfo
	for i := range clouds {
		rootLower := strings.ToLower(clouds[i].RootPath)
		if cleanLower == rootLower || strings.HasPrefix(cleanLower, strings.TrimSuffix(rootLower, `\`)+`\`) {
			// Prefere o prefixo mais específico caso haja aninhamento
			if matched == nil || len(clouds[i].RootPath) > len(matched.RootPath) {
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

	pinState, pinLabel := inspectWindowsCloudAttributes(clean)

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
		CanPin:       true,
	}
}

func inspectWindowsCloudAttributes(targetPath string) (string, string) {
	ptr, err := syscall.UTF16PtrFromString(targetPath)
	if err != nil {
		return "available", "Disponível neste dispositivo"
	}
	attrs, err := syscall.GetFileAttributes(ptr)
	if err != nil {
		return "available", "Disponível neste dispositivo"
	}

	if attrs&fileAttributePinned != 0 {
		return "pinned", "Sempre mantido neste dispositivo"
	}
	if attrs&fileAttributeUnpinned != 0 ||
		attrs&fileAttributeOffline != 0 ||
		attrs&fileAttributeRecallOnDataAccess != 0 ||
		attrs&fileAttributeRecallOnOpen != 0 {
		return "online_only", "Disponível apenas na nuvem (sob demanda)"
	}
	return "available", "Disponível neste dispositivo"
}

// ExecuteCloudAction executa uma ação de nuvem sobre o arquivo ou pasta (pin, unpin, hydrate, view_online, share, version_history).
func ExecuteCloudAction(targetPath string, action string) error {
	clean := filepath.Clean(strings.TrimSpace(targetPath))
	if clean == "" {
		return fmt.Errorf("empty target path")
	}
	status := GetCloudItemStatus(clean)

	switch strings.ToLower(strings.TrimSpace(action)) {
	case "pin":
		// Define FILE_ATTRIBUTE_PINNED (+P) e remove FILE_ATTRIBUTE_UNPINNED (-U) via attrib.exe nativo do Windows Cloud Files
		_ = applyWindowsPinAttributes(clean, true)
		info, err := os.Stat(clean)
		if err == nil && info.IsDir() {
			_ = exec.Command("attrib.exe", "+P", "-U", clean).Run()
			cmd := exec.Command("attrib.exe", "+P", "-U", filepath.Join(clean, "*"), "/S", "/D")
			return cmd.Start()
		}
		return exec.Command("attrib.exe", "+P", "-U", clean).Run()

	case "unpin":
		// Define FILE_ATTRIBUTE_UNPINNED (+U) e remove FILE_ATTRIBUTE_PINNED (-P) para liberar espaço local
		_ = applyWindowsPinAttributes(clean, false)
		info, err := os.Stat(clean)
		if err == nil && info.IsDir() {
			_ = exec.Command("attrib.exe", "+U", "-P", clean).Run()
			cmd := exec.Command("attrib.exe", "+U", "-P", filepath.Join(clean, "*"), "/S", "/D")
			return cmd.Start()
		}
		return exec.Command("attrib.exe", "+U", "-P", clean).Run()

	case "hydrate":
		_ = exec.Command("attrib.exe", "-U", clean).Run()
		if info, err := os.Stat(clean); err == nil && !info.IsDir() {
			// Ler o primeiro byte aciona o minifiltro cldflt.sys para baixar o arquivo imediatamente em background
			go func(p string) {
				if f, err := os.Open(p); err == nil {
					buf := make([]byte, 1)
					_, _ = f.Read(buf)
					_ = f.Close()
				}
			}(clean)
		}
		return nil

	case "view_online":
		webURL := status.WebURL
		if webURL == "" {
			webURL = "https://onedrive.live.com"
		}
		if status.ProviderID == "dropbox" && status.RelativePath != "" {
			webURL = strings.TrimRight(webURL, "/") + "/" + status.RelativePath
		}
		return OpenPath(webURL)

	case "share":
		// Tenta acionar o verbo nativo de compartilhamento do provedor no Shell do Windows; fallback para o portal web
		if err := invokeCloudShellVerb(clean, []string{"share", "compartilhar", "link", "onedrive", "google drive", "dropbox"}); err == nil {
			return nil
		}
		if status.WebURL != "" {
			return OpenPath(status.WebURL)
		}
		return nil

	case "version_history":
		if err := invokeCloudShellVerb(clean, []string{"version", "versõ", "versao", "histórico", "historico", "history"}); err == nil {
			return nil
		}
		if status.WebURL != "" {
			return OpenPath(status.WebURL)
		}
		return nil

	default:
		return fmt.Errorf("unknown cloud action: %s", action)
	}
}

func applyWindowsPinAttributes(targetPath string, pin bool) error {
	ptr, err := syscall.UTF16PtrFromString(targetPath)
	if err != nil {
		return err
	}
	attrs, err := syscall.GetFileAttributes(ptr)
	if err != nil {
		return err
	}
	if pin {
		attrs = (attrs | fileAttributePinned) &^ fileAttributeUnpinned
	} else {
		attrs = (attrs | fileAttributeUnpinned) &^ fileAttributePinned
	}
	return syscall.SetFileAttributes(ptr, attrs)
}

func invokeCloudShellVerb(targetPath string, keywords []string) error {
	dir := filepath.Dir(targetPath)
	base := filepath.Base(targetPath)
	escapedDir := strings.ReplaceAll(dir, "'", "''")
	escapedBase := strings.ReplaceAll(base, "'", "''")

	var kwChecks []string
	for _, kw := range keywords {
		kwChecks = append(kwChecks, fmt.Sprintf("$vName -like '*%s*'", strings.ReplaceAll(kw, "'", "")))
	}
	cond := strings.Join(kwChecks, " -or ")

	script := fmt.Sprintf(`
$shell = New-Object -ComObject Shell.Application
$folder = $shell.Namespace('%s')
if ($null -eq $folder) { exit 1 }
$item = $folder.ParseName('%s')
if ($null -eq $item) { exit 1 }
foreach ($v in $item.Verbs()) {
  $vName = $v.Name.Replace('&', '').ToLowerInvariant()
  if (%s) {
    $v.DoIt()
    exit 0
  }
}
exit 2
`, escapedDir, escapedBase, cond)

	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script)
	return cmd.Run()
}

