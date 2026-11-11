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
	"unsafe"
)

const (
	fileAttributeOffline            = 0x00001000
	fileAttributeRecallOnOpen       = 0x00040000
	fileAttributePinned             = 0x00080000
	fileAttributeUnpinned           = 0x00100000
	fileAttributeRecallOnDataAccess = 0x00400000
)

var procGetVolumeInformationW = kernel32.NewProc("GetVolumeInformationW")

type dropboxInfoJSON struct {
	Personal *struct {
		Path string `json:"path"`
	} `json:"personal"`
	Business *struct {
		Path string `json:"path"`
	} `json:"business"`
}

func getVolumeLabelWindows(driveRoot string) (volName string, fsName string) {
	rootPtr, err := syscall.UTF16PtrFromString(driveRoot)
	if err != nil {
		return "", ""
	}
	volBuf := make([]uint16, 261)
	fsBuf := make([]uint16, 261)
	var serial, maxComp, flags uint32
	r, _, _ := procGetVolumeInformationW.Call(
		uintptr(unsafe.Pointer(rootPtr)),
		uintptr(unsafe.Pointer(&volBuf[0])),
		uintptr(len(volBuf)),
		uintptr(unsafe.Pointer(&serial)),
		uintptr(unsafe.Pointer(&maxComp)),
		uintptr(unsafe.Pointer(&flags)),
		uintptr(unsafe.Pointer(&fsBuf[0])),
		uintptr(len(fsBuf)),
	)
	if r == 0 {
		return "", ""
	}
	return strings.TrimSpace(syscall.UTF16ToString(volBuf)), strings.TrimSpace(syscall.UTF16ToString(fsBuf))
}

// ListConnectedClouds detecta provedores de nuvem instalados e sincronizados no Windows
// (OneDrive, Google Drive, Dropbox, iCloud Drive, Nextcloud, ownCloud, MEGA, Box, pCloud, Proton Drive, Synology Drive, QNAP Qsync, Seafile, Tresorit, Yandex Disk e Rclone/WinFsp).
func ListConnectedClouds() []CloudProviderInfo {
	var clouds []CloudProviderInfo
	seenRoots := make(map[string]bool)

	addCloud := func(id, name, provider, accountName, rootPath, webURL, remoteSpec string) {
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
			if name == `\` || name == "." || len(cleanRoot) <= 3 {
				name = fmt.Sprintf("%s (%s)", provider, strings.TrimSuffix(cleanRoot, `\`))
			}
		}
		clouds = append(clouds, CloudProviderInfo{
			ID:          id,
			Name:        name,
			Provider:    provider,
			AccountName: accountName,
			RootPath:    cleanRoot,
			WebURL:      webURL,
			RemoteSpec:  remoteSpec,
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
					addCloud("onedrive", label, "OneDrive", displayName, userFolder, portal, "")
				}
			}
		}
		syscall.RegCloseKey(hAccounts)
	}

	// 2. Todos os provedores Cloud Files API registrados em HKCU\Software\SyncEngines\Providers\*
	// (OneDrive, iCloudDrive, Nextcloud, ProtonDrive, SynologyDrive, Dropbox, Box, SeaDrive, etc.)
	if hProviders, err := regOpenKey(syscall.HKEY_CURRENT_USER, `Software\SyncEngines\Providers`, syscall.KEY_ENUMERATE_SUB_KEYS); err == nil {
		for _, provKey := range regReadSubKeyNames(hProviders) {
			provPath := `Software\SyncEngines\Providers\` + provKey
			if hProvGroup, err := regOpenKey(syscall.HKEY_CURRENT_USER, provPath, syscall.KEY_ENUMERATE_SUB_KEYS); err == nil {
				for _, instKey := range regReadSubKeyNames(hProvGroup) {
					if hInst, err := regOpenKey(syscall.HKEY_CURRENT_USER, provPath+`\`+instKey, syscall.KEY_QUERY_VALUE); err == nil {
						mountPt, _ := regGetStringValue(hInst, "MountPoint")
						urlNs, _ := regGetStringValue(hInst, "UrlNamespace")
						syscall.RegCloseKey(hInst)
						if mountPt != "" {
							id, provName, acct, defURL, ok := ClassifyCloudFolderByName(provKey)
							if !ok {
								id, provName, acct, defURL, ok = ClassifyCloudFolderByName(filepath.Base(mountPt))
							}
							if !ok {
								id = strings.ToLower(provKey)
								provName = provKey
							}
							portal := defURL
							if strings.HasPrefix(strings.ToLower(urlNs), "http") {
								portal = urlNs
							}
							addCloud(id, filepath.Base(mountPt), provName, acct, mountPt, portal, "")
						}
					}
				}
				syscall.RegCloseKey(hProvGroup)
			}
		}
		syscall.RegCloseKey(hProviders)
	}

	// 3. OneDrive via Variáveis de Ambiente
	for _, envKey := range []string{"OneDriveCommercial", "OneDriveConsumer", "OneDrive"} {
		if val := strings.TrimSpace(os.Getenv(envKey)); val != "" {
			addCloud("onedrive", filepath.Base(val), "OneDrive", "", val, "https://onedrive.live.com", "")
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
					addCloud("dropbox", "Dropbox (Pessoal)", "Dropbox", "Pessoal", info.Personal.Path, "https://www.dropbox.com/home", "")
				}
				if info.Business != nil && info.Business.Path != "" {
					addCloud("dropbox", "Dropbox (Business)", "Dropbox", "Business", info.Business.Path, "https://www.dropbox.com/home", "")
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
			addCloud("gdrive", fmt.Sprintf("Google Drive (%s:)", strings.ToUpper(mountPt)), "Google Drive", "", driveRoot, "https://drive.google.com/drive/my-drive", "")
		} else if mountPt != "" {
			addCloud("gdrive", "Google Drive", "Google Drive", "", mountPt, "https://drive.google.com/drive/my-drive", "")
		}
	}

	// 6. Inspeção de Unidades Virtuais de Nuvem (Google Drive, pCloud Drive, SeaDrive, Tresorit, Rclone / WinFsp)
	for _, d := range GetDrives() {
		volLabel, fsName := getVolumeLabelWindows(d.Path)
		lowLabel := strings.ToLower(volLabel)
		lowFS := strings.ToLower(fsName)
		driveLetter := strings.TrimSuffix(d.Path, `\`)

		switch {
		case strings.Contains(lowLabel, "google drive"):
			addCloud("gdrive", fmt.Sprintf("Google Drive (%s)", driveLetter), "Google Drive", "", d.Path, "https://drive.google.com/drive/my-drive", "")
		case strings.Contains(lowLabel, "pcloud"):
			addCloud("pcloud", fmt.Sprintf("pCloud Drive (%s)", driveLetter), "pCloud Drive", "", d.Path, "https://my.pcloud.com", "")
		case strings.Contains(lowLabel, "seadrive") || strings.Contains(lowLabel, "seafile"):
			addCloud("seafile", fmt.Sprintf("SeaDrive (%s)", driveLetter), "Seafile", "", d.Path, "", "")
		case strings.Contains(lowLabel, "tresorit"):
			addCloud("tresorit", fmt.Sprintf("Tresorit (%s)", driveLetter), "Tresorit", "", d.Path, "https://web.tresorit.com", "")
		case strings.Contains(lowFS, "winfsp") || strings.Contains(lowFS, "rclone") || strings.Contains(lowLabel, "rclone"):
			label := volLabel
			if label == "" {
				label = "Rclone Cloud"
			}
			addCloud("rclone", fmt.Sprintf("%s (%s)", label, driveLetter), "Rclone Cloud", "", d.Path, "", d.RemoteTarget)
		default:
			for _, subName := range []string{"Meu Drive", "My Drive"} {
				candidate := filepath.Join(d.Path, subName)
				if fi, err := os.Stat(candidate); err == nil && fi.IsDir() {
					addCloud("gdrive", fmt.Sprintf("Google Drive (%s)", driveLetter), "Google Drive", "", d.Path, "https://drive.google.com/drive/my-drive", "")
				}
			}
		}
	}

	// 7. Pastas de nuvem conhecidas no diretório do usuário
	if home, err := os.UserHomeDir(); err == nil && home != "" {
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

	return clouds
}

// GetCloudItemStatus verifica se o caminho informado pertence a uma pasta sincronizada em nuvem e retorna o estado de fixação/hidratação.
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
		RemoteSpec:   matched.RemoteSpec,
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
		_ = applyWindowsPinAttributes(clean, true)
		info, err := os.Stat(clean)
		if err == nil && info.IsDir() {
			_ = exec.Command("attrib.exe", "+P", "-U", clean).Run()
			cmd := exec.Command("attrib.exe", "+P", "-U", filepath.Join(clean, "*"), "/S", "/D")
			return cmd.Start()
		}
		return exec.Command("attrib.exe", "+P", "-U", clean).Run()

	case "unpin":
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
		if err := invokeCloudShellVerb(clean, []string{"share", "compartilhar", "link", "onedrive", "google drive", "dropbox", "nextcloud", "owncloud", "pcloud", "proton", "mega", "tresorit"}); err == nil {
			return nil
		}
		if status.WebURL != "" {
			return OpenPath(status.WebURL)
		}
		return nil

	case "version_history":
		if err := invokeCloudShellVerb(clean, []string{"version", "versõ", "versao", "histórico", "historico", "history", "activity", "atividade"}); err == nil {
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
