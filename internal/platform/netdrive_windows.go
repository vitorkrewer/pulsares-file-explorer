//go:build windows

package platform

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	mprDLL                     = syscall.NewLazyDLL("mpr.dll")
	netapi32DLL                = syscall.NewLazyDLL("netapi32.dll")
	procWNetAddConnection2W    = mprDLL.NewProc("WNetAddConnection2W")
	procWNetCancelConnection2W = mprDLL.NewProc("WNetCancelConnection2W")
	procWNetGetConnectionW     = mprDLL.NewProc("WNetGetConnectionW")
	procNetShareEnum           = netapi32DLL.NewProc("NetShareEnum")
	procNetApiBufferFree       = netapi32DLL.NewProc("NetApiBufferFree")
)

const (
	driveRemote = 4

	resourceTypeAny  = 0x00000000
	resourceTypeDisk = 0x00000001

	connectUpdateProfile = 0x00000001

	errorSessionCredentialConflict = 1219
	maxPreferredLength             = 0xFFFFFFFF
	stypeSpecial                   = 0x80000000
)

type netResourceW struct {
	dwScope       uint32
	dwType        uint32
	dwDisplayType uint32
	dwUsage       uint32
	lpLocalName   *uint16
	lpRemoteName  *uint16
	lpComment     *uint16
	lpProvider    *uint16
}

type shareInfo1 struct {
	netname *uint16
	stype   uint32
	remark  *uint16
}

func utf16PtrToString(p *uint16) string {
	if p == nil {
		return ""
	}
	var u16 []uint16
	for cur := uintptr(unsafe.Pointer(p)); len(u16) < 4096; cur += 2 {
		ch := *(*uint16)(unsafe.Pointer(cur))
		if ch == 0 {
			break
		}
		u16 = append(u16, ch)
	}
	return syscall.UTF16ToString(u16)
}

func getUNCForMappedDrive(localDrive string) string {
	clean := strings.TrimRight(strings.TrimSpace(localDrive), `\`)
	if len(clean) != 2 || clean[1] != ':' {
		return ""
	}
	localPtr, err := syscall.UTF16PtrFromString(clean)
	if err != nil {
		return ""
	}
	bufLen := uint32(1024)
	buf := make([]uint16, bufLen)
	ret, _, _ := procWNetGetConnectionW.Call(
		uintptr(unsafe.Pointer(localPtr)),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&bufLen)),
	)
	if ret == 0 {
		return syscall.UTF16ToString(buf)
	}
	return ""
}

// GetAvailableDriveLetters retorna as letras de unidade livres no Windows (Z: até D:).
func GetAvailableDriveLetters() []string {
	getLogicalDrives := kernel32.NewProc("GetLogicalDrives")
	r, _, _ := getLogicalDrives.Call()
	bitmask := uint32(r)

	var free []string
	for i := 25; i >= 3; i-- { // Z até D
		if bitmask&(1<<i) == 0 {
			free = append(free, string(rune('A'+i))+":")
		}
	}
	return free
}

// IsNetworkServerRoot identifica se o caminho aponta para a raiz de um servidor (ex: \\192.168.10.195 ou nfs://192.168.10.195) sem compartilhamento.
func IsNetworkServerRoot(p string) (string, bool) {
	trimmed := strings.TrimSpace(p)
	if trimmed == "" {
		return "", false
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "smb://") ||
		strings.HasPrefix(lower, "cifs://") ||
		strings.HasPrefix(lower, "nfs://") ||
		strings.HasPrefix(lower, "afp://") {
		_, host, share, _ := ParseNetworkAddress(trimmed)
		if host != "" && share == "" {
			return host, true
		}
		return "", false
	}
	normalized := strings.ReplaceAll(trimmed, "/", `\`)
	if !strings.HasPrefix(normalized, `\\`) || strings.HasPrefix(normalized, `\\?\`) {
		return "", false
	}
	rest := strings.Trim(strings.TrimPrefix(normalized, `\\`), `\`)
	if rest == "" || strings.Contains(rest, `\`) {
		return "", false
	}
	return rest, true
}

func listWindowsNFSExports(host string) ([]NetworkShareInfo, error) {
	cleanHost := strings.Trim(strings.TrimSpace(host), `\/`)
	if cleanHost == "" {
		return nil, errors.New("endereço do servidor NFS vazio")
	}
	if showmountBin, err := exec.LookPath("showmount"); err == nil {
		out, cmdErr := exec.Command(showmountBin, "-e", cleanHost).Output()
		if cmdErr == nil {
			shares := ParseShowmountExports(string(out), cleanHost, true)
			if len(shares) > 0 {
				return shares, nil
			}
		}
	}
	return nil, fmt.Errorf("informe o caminho exportado pelo servidor NFS (ex.: nfs://%s/mnt/dados ou %s:/mnt/dados) ou ative o 'Cliente para NFS' nos Recursos do Windows", cleanHost, cleanHost)
}

// ListServerSharesForPath enumera compartilhamentos respeitando o protocolo da URL (SMB, NFS ou AFP).
func ListServerSharesForPath(rawPath string, includeHidden bool) ([]NetworkShareInfo, error) {
	proto, host, _, _ := ParseNetworkAddress(rawPath)
	if host == "" {
		host = rawPath
	}
	switch proto {
	case "afp":
		return nil, errors.New("o protocolo AFP (Apple Filing Protocol) é exclusivo do macOS e Linux (GVFS); no Windows, utilize SMB ou NFS")
	case "nfs":
		return listWindowsNFSExports(host)
	default:
		return ListServerShares(host, includeHidden)
	}
}

// ListServerShares enumera as pastas compartilhadas (SMB/CIFS) de um servidor via NetShareEnum.
func ListServerShares(host string, includeHidden bool) ([]NetworkShareInfo, error) {
	cleanHost := strings.Trim(strings.TrimSpace(host), `\/`)
	if cleanHost == "" {
		return nil, errors.New("endereço do servidor vazio")
	}
	serverName := `\\` + cleanHost
	serverPtr, err := syscall.UTF16PtrFromString(serverName)
	if err != nil {
		return nil, err
	}

	var bufPtr uintptr
	var entriesRead uint32
	var totalEntries uint32
	var resumeHandle uint32

	ret, _, _ := procNetShareEnum.Call(
		uintptr(unsafe.Pointer(serverPtr)),
		1, // level 1 (SHARE_INFO_1)
		uintptr(unsafe.Pointer(&bufPtr)),
		uintptr(maxPreferredLength),
		uintptr(unsafe.Pointer(&entriesRead)),
		uintptr(unsafe.Pointer(&totalEntries)),
		uintptr(unsafe.Pointer(&resumeHandle)),
	)
	if bufPtr != 0 {
		defer procNetApiBufferFree.Call(bufPtr)
	}
	if ret != 0 {
		return nil, fmt.Errorf("não foi possível listar os compartilhamentos de %s (código Win32 %d): verifique se o servidor está acessível ou informe usuário/senha", serverName, ret)
	}

	elemSize := unsafe.Sizeof(shareInfo1{})
	shares := make([]NetworkShareInfo, 0, int(entriesRead))
	for i := uintptr(0); i < uintptr(entriesRead); i++ {
		item := (*shareInfo1)(unsafe.Pointer(bufPtr + i*elemSize))
		name := utf16PtrToString(item.netname)
		if name == "" {
			continue
		}
		// Apenas compartilhamentos de disco (STYPE_DISKTREE == 0)
		if (item.stype & 0xFF) != 0 {
			continue
		}
		if !includeHidden && ((item.stype&stypeSpecial) != 0 || strings.HasSuffix(name, "$")) {
			continue
		}
		shares = append(shares, NetworkShareInfo{
			Name:   name,
			Path:   serverName + `\` + name,
			Remark: utf16PtrToString(item.remark),
		})
	}
	return shares, nil
}

func wnetConnect(remoteUNC, localDrive, fullUser, password string, resType uint32, persistent bool) uint32 {
	remotePtr, err := syscall.UTF16PtrFromString(remoteUNC)
	if err != nil {
		return 87 // ERROR_INVALID_PARAMETER
	}
	var localPtr *uint16
	if localDrive != "" {
		cleanDrive := strings.ToUpper(strings.TrimRight(strings.TrimSpace(localDrive), `\`))
		localPtr, _ = syscall.UTF16PtrFromString(cleanDrive)
	}
	var userPtr *uint16
	if strings.TrimSpace(fullUser) != "" {
		userPtr, _ = syscall.UTF16PtrFromString(strings.TrimSpace(fullUser))
	}
	var passPtr *uint16
	if password != "" || userPtr != nil {
		passPtr, _ = syscall.UTF16PtrFromString(password)
	}

	nr := netResourceW{
		dwType:       resType,
		lpLocalName:  localPtr,
		lpRemoteName: remotePtr,
	}
	flags := uint32(0)
	if persistent && localPtr != nil {
		flags = connectUpdateProfile
	}

	ret, _, _ := procWNetAddConnection2W.Call(
		uintptr(unsafe.Pointer(&nr)),
		uintptr(unsafe.Pointer(passPtr)),
		uintptr(unsafe.Pointer(userPtr)),
		uintptr(flags),
	)
	return uint32(ret)
}

// ConnectNetworkDrive autentica e/ou mapeia uma unidade de rede SMB/UNC ou NFS no Windows.
func ConnectNetworkDrive(req NetworkMountRequest) (*NetworkMountResult, error) {
	proto, host, share, subpath := ParseNetworkAddressWithProtocol(req.Address, req.Protocol)
	if host == "" {
		return nil, errors.New("informe um endereço ou IP válido (ex.: \\\\192.168.10.195\\ ou nfs://192.168.10.195/mnt/dados)")
	}
	if proto == "" {
		proto = "smb"
	}

	if proto == "afp" {
		return nil, errors.New("o protocolo AFP (Apple Filing Protocol) é suportado nativamente no macOS e Linux (GVFS); no Windows, conecte-se ao servidor usando SMB ou NFS")
	}

	fullUser := strings.TrimSpace(req.Username)
	if dom := strings.TrimSpace(req.Domain); dom != "" && fullUser != "" && !strings.Contains(fullUser, `\`) && !strings.Contains(fullUser, "@") {
		fullUser = dom + `\` + fullUser
	}

	cleanLetter := strings.ToUpper(strings.TrimRight(strings.TrimSpace(req.DriveLetter), `\`))
	if cleanLetter != "" && len(cleanLetter) == 1 {
		cleanLetter += ":"
	}

	// Fluxo dedicado para NFS (Windows Client for NFS)
	if proto == "nfs" {
		if share == "" {
			if cleanLetter != "" {
				return nil, fmt.Errorf("para mapear a letra %s via NFS, informe também o caminho exportado (ex.: nfs://%s/mnt/dados ou %s:/mnt/dados)", cleanLetter, host, host)
			}
			shares, err := listWindowsNFSExports(host)
			if err != nil {
				return nil, err
			}
			return &NetworkMountResult{
				ConnectedPath: "nfs://" + host,
				RemoteTarget:  "nfs://" + host,
				IsServerRoot:  true,
				Shares:        shares,
			}, nil
		}

		remoteUNC := `\\` + host + `\` + strings.ReplaceAll(share, "/", `\`)
		remoteTarget := fmt.Sprintf("nfs://%s/%s", host, share)

		if cleanLetter != "" {
			ret := wnetConnect(remoteUNC, cleanLetter, fullUser, req.Password, resourceTypeDisk, req.Persistent)
			if ret != 0 {
				mountedViaCLI := false
				if mountBin, lookErr := exec.LookPath("mount"); lookErr == nil {
					if exec.Command(mountBin, remoteUNC, cleanLetter).Run() == nil ||
						exec.Command(mountBin, "-o", "anon", remoteUNC, cleanLetter).Run() == nil {
						mountedViaCLI = true
					}
				}
				if !mountedViaCLI {
					return nil, fmt.Errorf("não foi possível montar a exportação NFS %s em %s (código Win32 %d): verifique se o 'Cliente para NFS' está ativado nos Recursos do Windows", remoteTarget, cleanLetter, ret)
				}
			}
		}

		navPath := remoteUNC
		if cleanLetter != "" {
			navPath = cleanLetter + `\`
		}
		if _, err := os.Stat(navPath); err != nil {
			return nil, fmt.Errorf("exportação NFS %s inacessível em %s (verifique se o 'Cliente para NFS' está ativado no Windows e se o servidor permite este IP): %w", remoteTarget, navPath, err)
		}

		return &NetworkMountResult{
			ConnectedPath: navPath,
			MappedDrive:   cleanLetter,
			RemoteTarget:  remoteTarget,
			IsServerRoot:  false,
		}, nil
	}

	// Caso 1 (SMB): Raiz do servidor (ex: \\192.168.10.195\) sem pasta específica informada
	if share == "" {
		if cleanLetter != "" {
			return nil, fmt.Errorf("para mapear a letra %s, informe também o nome da pasta compartilhada (ex.: \\\\%s\\Publico) ou deixe sem letra para navegar nos compartilhamentos do servidor", cleanLetter, host)
		}

		// Se credenciais foram informadas, autentica na sessão IPC$ do servidor
		if fullUser != "" || req.Password != "" {
			ipcTarget := `\\` + host + `\IPC$`
			ret := wnetConnect(ipcTarget, "", fullUser, req.Password, resourceTypeAny, false)
			if ret == errorSessionCredentialConflict {
				_ = DisconnectNetworkDrive(ipcTarget)
				_ = DisconnectNetworkDrive(`\\` + host)
				ret = wnetConnect(ipcTarget, "", fullUser, req.Password, resourceTypeAny, false)
			}
			if ret != 0 {
				return nil, fmt.Errorf("falha na autenticação em \\\\%s (código Win32 %d)", host, ret)
			}
		}

		shares, err := ListServerShares(host, false)
		if err != nil {
			return nil, err
		}
		return &NetworkMountResult{
			ConnectedPath: `\\` + host,
			RemoteTarget:  `\\` + host,
			IsServerRoot:  true,
			Shares:        shares,
		}, nil
	}

	// Caso 2: Compartilhamento específico (ex: \\192.168.10.195\Publico)
	remoteUNC := `\\` + host + `\` + share
	if cleanLetter != "" || fullUser != "" || req.Password != "" {
		ret := wnetConnect(remoteUNC, cleanLetter, fullUser, req.Password, resourceTypeDisk, req.Persistent)
		if ret == errorSessionCredentialConflict {
			_ = DisconnectNetworkDrive(remoteUNC)
			_ = DisconnectNetworkDrive(`\\` + host + `\IPC$`)
			ret = wnetConnect(remoteUNC, cleanLetter, fullUser, req.Password, resourceTypeDisk, req.Persistent)
		}
		if ret != 0 {
			return nil, fmt.Errorf("não foi possível conectar a %s (código Win32 %d)", remoteUNC, ret)
		}
	}

	navPath := remoteUNC
	if cleanLetter != "" {
		navPath = cleanLetter + `\`
	}
	if subpath != "" {
		navPath = filepath.Join(navPath, filepath.FromSlash(subpath))
	}

	// Verifica se o caminho conectado responde
	if _, err := os.Stat(navPath); err != nil {
		return nil, fmt.Errorf("caminho %s inacessível: %w", navPath, err)
	}

	return &NetworkMountResult{
		ConnectedPath: navPath,
		MappedDrive:   cleanLetter,
		RemoteTarget:  remoteUNC,
		IsServerRoot:  false,
	}, nil
}

// DisconnectNetworkDrive desconecta uma letra mapeada (ex: Z:) ou sessão UNC (\\servidor\pasta).
func DisconnectNetworkDrive(target string) error {
	clean := strings.TrimSpace(target)
	if clean == "" {
		return nil
	}
	// Se for "Z:\", WNetCancelConnection2W exige "Z:"
	if len(clean) == 3 && clean[1] == ':' && (clean[2] == '\\' || clean[2] == '/') {
		clean = clean[:2]
	}
	ptr, err := syscall.UTF16PtrFromString(clean)
	if err != nil {
		return err
	}
	ret, _, _ := procWNetCancelConnection2W.Call(
		uintptr(unsafe.Pointer(ptr)),
		uintptr(connectUpdateProfile),
		1, // fForce = TRUE
	)
	if ret != 0 {
		if len(clean) == 2 && clean[1] == ':' {
			if umountBin, lookErr := exec.LookPath("umount"); lookErr == nil {
				if exec.Command(umountBin, "-f", clean).Run() == nil {
					return nil
				}
			}
		}
		return fmt.Errorf("falha ao desconectar %s (código Win32 %d)", clean, ret)
	}
	return nil
}

