//go:build !windows

package platform

import (
	"bytes"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

func GetAvailableDriveLetters() []string {
	return []string{}
}

func IsNetworkServerRoot(p string) (string, bool) {
	trimmed := strings.TrimSpace(p)
	if trimmed == "" {
		return "", false
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "smb://") ||
		strings.HasPrefix(lower, "cifs://") ||
		strings.HasPrefix(lower, "nfs://") ||
		strings.HasPrefix(lower, "afp://") ||
		strings.HasPrefix(trimmed, `\\`) ||
		strings.HasPrefix(trimmed, "//") {
		_, host, share, _ := ParseNetworkAddress(trimmed)
		if host != "" && share == "" {
			return host, true
		}
	}
	return "", false
}

func resolveLinuxGVFSDir() string {
	if xdg := os.Getenv("XDG_RUNTIME_DIR"); xdg != "" {
		gvfs := filepath.Join(xdg, "gvfs")
		if info, err := os.Stat(gvfs); err == nil && info.IsDir() {
			return gvfs
		}
	}
	gvfs := fmt.Sprintf("/run/user/%d/gvfs", os.Getuid())
	if info, err := os.Stat(gvfs); err == nil && info.IsDir() {
		return gvfs
	}
	return ""
}

func unescapeProcMountField(s string) string {
	r := strings.NewReplacer(`\040`, " ", `\011`, "\t", `\012`, "\n", `\134`, `\`)
	return r.Replace(s)
}

func findMountedLinuxShare(proto, host, share string) string {
	hostLower := strings.ToLower(strings.TrimSpace(host))
	shareClean := strings.Trim(strings.TrimSpace(share), "/")
	shareLower := strings.ToLower(shareClean)
	if hostLower == "" {
		return ""
	}

	// 1) Verifica montagens de kernel em /proc/mounts (NFS, CIFS/SMB3, AFPFS)
	if rawMounts, err := os.ReadFile("/proc/mounts"); err == nil {
		for _, line := range strings.Split(string(rawMounts), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 3 {
				continue
			}
			src := unescapeProcMountField(fields[0])
			mnt := unescapeProcMountField(fields[1])
			fstype := fields[2]
			if fstype != "cifs" && fstype != "smb3" && fstype != "nfs" && fstype != "nfs4" && fstype != "afpfs" {
				continue
			}
			if proto == "nfs" && fstype != "nfs" && fstype != "nfs4" {
				continue
			}
			if proto == "smb" && fstype != "cifs" && fstype != "smb3" {
				continue
			}
			if proto == "afp" && fstype != "afpfs" {
				continue
			}

			srcLower := strings.ToLower(strings.TrimRight(strings.ReplaceAll(src, `\`, `/`), "/"))
			// Ex: //host/share ou host:/export/path
			if strings.HasPrefix(srcLower, "//"+hostLower+"/") || strings.HasPrefix(srcLower, hostLower+":/") {
				if shareLower == "" ||
					strings.HasSuffix(srcLower, "/"+shareLower) ||
					srcLower == hostLower+":/"+shareLower {
					return mnt
				}
			}
		}
	}

	// 2) Verifica montagens GVFS (/run/user/<uid>/gvfs)
	// Formatos comuns do GVFS:
	//   - smb-share:server=<host>,share=<share>
	//   - afp-volume:host=<host>,user=...,volume=<share>
	//   - nfs:host=<host>,prefix=%2F...
	gvfs := resolveLinuxGVFSDir()
	if gvfs == "" {
		return ""
	}
	entries, err := os.ReadDir(gvfs)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		nameLower := strings.ToLower(e.Name())
		if proto == "smb" && !strings.HasPrefix(nameLower, "smb-share:") {
			continue
		}
		if proto == "afp" && !strings.HasPrefix(nameLower, "afp-volume:") {
			continue
		}
		if proto == "nfs" && !strings.HasPrefix(nameLower, "nfs:") {
			continue
		}
		if !strings.Contains(nameLower, "server="+hostLower) && !strings.Contains(nameLower, "host="+hostLower) {
			continue
		}
		if shareLower == "" {
			return filepath.Join(gvfs, e.Name())
		}
		decodedName, decErr := url.QueryUnescape(nameLower)
		if decErr != nil {
			decodedName = nameLower
		}
		if strings.Contains(nameLower, "share="+shareLower) ||
			strings.Contains(nameLower, "volume="+shareLower) ||
			strings.Contains(decodedName, "/"+shareLower) ||
			strings.HasSuffix(decodedName, "="+shareLower) {
			return filepath.Join(gvfs, e.Name())
		}
	}
	return ""
}

func resolveDarwinMountedVolume(host, share string) string {
	baseName := filepath.Base(strings.Trim(share, "/"))
	fallback := filepath.Join("/Volumes", baseName)

	mountOut, err := exec.Command("mount").Output()
	if err != nil {
		return fallback
	}
	hostLower := strings.ToLower(host)
	shareLower := strings.ToLower(strings.Trim(share, "/"))
	for _, ml := range strings.Split(string(mountOut), "\n") {
		idx := strings.Index(ml, " on /Volumes/")
		if idx <= 0 {
			continue
		}
		srcLower := strings.ToLower(strings.TrimSpace(ml[:idx]))
		if !strings.Contains(srcLower, hostLower) {
			continue
		}
		if shareLower == "" || strings.HasSuffix(strings.TrimRight(srcLower, "/"), "/"+shareLower) || strings.HasSuffix(srcLower, ":/"+shareLower) {
			rest := ml[idx+4:] // começa em "/Volumes/..."
			if parenIdx := strings.LastIndex(rest, " ("); parenIdx > 0 {
				return strings.TrimSpace(rest[:parenIdx])
			}
		}
	}
	return fallback
}

func listUnixNFSExports(cleanHost string) ([]NetworkShareInfo, error) {
	if showmountBin, err := exec.LookPath("showmount"); err == nil {
		if out, cmdErr := exec.Command(showmountBin, "-e", cleanHost).Output(); cmdErr == nil {
			shares := ParseShowmountExports(string(out), cleanHost, false)
			if len(shares) > 0 {
				return shares, nil
			}
		}
	}
	return nil, fmt.Errorf("informe o caminho exportado pelo servidor NFS (ex.: nfs://%s/mnt/dados ou %s:/mnt/dados)", cleanHost, cleanHost)
}

func ListServerSharesForPath(rawPath string, includeHidden bool) ([]NetworkShareInfo, error) {
	proto, host, _, _ := ParseNetworkAddress(rawPath)
	if host == "" {
		host = rawPath
	}
	cleanHost := strings.Trim(strings.TrimSpace(host), `\/`)
	if cleanHost == "" {
		return nil, errors.New("endereço do servidor vazio")
	}

	if proto == "nfs" {
		return listUnixNFSExports(cleanHost)
	}

	if proto == "afp" {
		if runtime.GOOS == "darwin" {
			mountOut, _ := exec.Command("mount").Output()
			var shares []NetworkShareInfo
			for _, ml := range strings.Split(string(mountOut), "\n") {
				if strings.Contains(ml, "afpfs") && strings.Contains(strings.ToLower(ml), strings.ToLower(cleanHost)) {
					if idx := strings.Index(ml, " on /Volumes/"); idx > 0 {
						rest := ml[idx+4:]
						if parenIdx := strings.LastIndex(rest, " ("); parenIdx > 0 {
							volPath := strings.TrimSpace(rest[:parenIdx])
							shares = append(shares, NetworkShareInfo{
								Name:   filepath.Base(volPath),
								Path:   volPath,
								Remark: "AFP",
							})
						}
					}
				}
			}
			if len(shares) > 0 {
				return shares, nil
			}
		} else if gvfs := resolveLinuxGVFSDir(); gvfs != "" {
			if entries, err := os.ReadDir(gvfs); err == nil {
				var shares []NetworkShareInfo
				for _, e := range entries {
					nl := strings.ToLower(e.Name())
					if strings.HasPrefix(nl, "afp-volume:") && strings.Contains(nl, "host="+strings.ToLower(cleanHost)) {
						shares = append(shares, NetworkShareInfo{
							Name:   e.Name(),
							Path:   filepath.Join(gvfs, e.Name()),
							Remark: "AFP",
						})
					}
				}
				if len(shares) > 0 {
					return shares, nil
				}
			}
		}
		return nil, fmt.Errorf("informe o nome do volume AFP após o endereço (ex.: afp://%s/TimeMachine)", cleanHost)
	}

	return ListServerShares(cleanHost, includeHidden)
}

func ListServerShares(host string, includeHidden bool) ([]NetworkShareInfo, error) {
	cleanHost := strings.Trim(strings.TrimSpace(host), `\/`)
	if cleanHost == "" {
		return nil, errors.New("endereço do servidor vazio")
	}

	if runtime.GOOS == "darwin" {
		if _, err := exec.LookPath("smbutil"); err == nil {
			out, err := exec.Command("smbutil", "view", "-g", "//"+cleanHost).Output()
			if err == nil {
				var shares []NetworkShareInfo
				for _, line := range strings.Split(string(out), "\n") {
					fields := strings.Fields(line)
					if len(fields) >= 2 && strings.EqualFold(fields[1], "Disk") {
						name := fields[0]
						if !includeHidden && strings.HasSuffix(name, "$") {
							continue
						}
						shares = append(shares, NetworkShareInfo{
							Name: name,
							Path: fmt.Sprintf("smb://%s/%s", cleanHost, name),
						})
					}
				}
				return shares, nil
			}
		}
		return nil, fmt.Errorf("informe também a pasta compartilhada (ex.: smb://%s/Publico)", cleanHost)
	}

	// Linux: tenta smbclient -g -L //host -N
	if _, err := exec.LookPath("smbclient"); err == nil {
		out, err := exec.Command("smbclient", "-g", "-L", "//"+cleanHost, "-N").Output()
		if err == nil {
			var shares []NetworkShareInfo
			for _, line := range strings.Split(string(out), "\n") {
				// Formato -g: Disk|ShareName|Comment
				parts := strings.SplitN(strings.TrimSpace(line), "|", 3)
				if len(parts) >= 2 && strings.EqualFold(parts[0], "Disk") {
					name := parts[1]
					if !includeHidden && strings.HasSuffix(name, "$") {
						continue
					}
					remark := ""
					if len(parts) == 3 {
						remark = parts[2]
					}
					shares = append(shares, NetworkShareInfo{
						Name:   name,
						Path:   fmt.Sprintf("smb://%s/%s", cleanHost, name),
						Remark: remark,
					})
				}
			}
			return shares, nil
		}
	}

	// Fallback: verifica compartilhamentos já montados no GVFS para este host
	if gvfs := resolveLinuxGVFSDir(); gvfs != "" {
		if entries, err := os.ReadDir(gvfs); err == nil {
			var shares []NetworkShareInfo
			hostLower := strings.ToLower(cleanHost)
			for _, e := range entries {
				nl := strings.ToLower(e.Name())
				if strings.Contains(nl, "server="+hostLower) || strings.Contains(nl, "host="+hostLower) {
					shares = append(shares, NetworkShareInfo{
						Name: e.Name(),
						Path: filepath.Join(gvfs, e.Name()),
					})
				}
			}
			if len(shares) > 0 {
				return shares, nil
			}
		}
	}

	return nil, fmt.Errorf("informe o nome da pasta compartilhada (ex.: smb://%s/Publico)", cleanHost)
}

func ConnectNetworkDrive(req NetworkMountRequest) (*NetworkMountResult, error) {
	proto, host, share, subpath := ParseNetworkAddressWithProtocol(req.Address, req.Protocol)
	if host == "" {
		return nil, errors.New("informe um endereço ou IP válido (ex.: smb://192.168.10.195/Publico, nfs://192.168.10.195/mnt/dados ou afp://192.168.10.195/Volume)")
	}
	if proto == "" {
		proto = "smb"
	}

	if share == "" {
		rootURI := fmt.Sprintf("%s://%s", proto, host)
		shares, err := ListServerSharesForPath(rootURI, false)
		if err == nil && len(shares) > 0 {
			return &NetworkMountResult{
				ConnectedPath: rootURI,
				RemoteTarget:  rootURI,
				IsServerRoot:  true,
				Shares:        shares,
			}, nil
		}
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("informe o nome da pasta compartilhada após o IP (ex.: %s://%s/Publico)", proto, host)
	}

	// macOS: monta em /Volumes/<share> via AppleScript mount volume (suporta smb://, afp:// e nfs://)
	if runtime.GOOS == "darwin" {
		u := url.URL{
			Scheme: proto,
			Host:   host,
			Path:   "/" + strings.TrimPrefix(share, "/"),
		}
		if proto != "nfs" && strings.TrimSpace(req.Username) != "" {
			user := strings.TrimSpace(req.Username)
			if proto == "smb" {
				if dom := strings.TrimSpace(req.Domain); dom != "" && !strings.Contains(user, ";") {
					user = dom + ";" + user
				}
			}
			if req.Password != "" {
				u.User = url.UserPassword(user, req.Password)
			} else {
				u.User = url.User(user)
			}
		}
		script := fmt.Sprintf(`mount volume "%s"`, strings.ReplaceAll(u.String(), `"`, `\"`))
		if err := exec.Command("osascript", "-e", script).Run(); err != nil {
			return nil, fmt.Errorf("falha ao montar %s://%s/%s no macOS: %w", proto, host, share, err)
		}

		volPath := resolveDarwinMountedVolume(host, share)
		if subpath != "" {
			volPath = filepath.Join(volPath, subpath)
		}
		return &NetworkMountResult{
			ConnectedPath: volPath,
			RemoteTarget:  fmt.Sprintf("%s://%s/%s", proto, host, share),
		}, nil
	}

	// Linux: 1) verifica se já está montado em /proc/mounts ou no GVFS
	if existing := findMountedLinuxShare(proto, host, share); existing != "" {
		nav := existing
		if subpath != "" {
			nav = filepath.Join(nav, subpath)
		}
		return &NetworkMountResult{
			ConnectedPath: nav,
			RemoteTarget:  fmt.Sprintf("%s://%s/%s", proto, host, share),
		}, nil
	}

	// Linux: 2) monta via GVFS (gio mount smb://..., afp://... ou nfs://...)
	uri := fmt.Sprintf("%s://%s/%s", proto, host, strings.TrimPrefix(share, "/"))
	if _, err := exec.LookPath("gio"); err == nil {
		var stdinBuf bytes.Buffer
		switch proto {
		case "smb":
			if strings.TrimSpace(req.Username) != "" {
				stdinBuf.WriteString(strings.TrimSpace(req.Username) + "\n")
				if strings.TrimSpace(req.Domain) != "" {
					stdinBuf.WriteString(strings.TrimSpace(req.Domain) + "\n")
				} else {
					stdinBuf.WriteString("WORKGROUP\n")
				}
				stdinBuf.WriteString(req.Password + "\n")
			} else {
				stdinBuf.WriteString("\n")
			}
		case "afp":
			if strings.TrimSpace(req.Username) != "" {
				stdinBuf.WriteString(strings.TrimSpace(req.Username) + "\n")
				stdinBuf.WriteString(req.Password + "\n")
			} else {
				stdinBuf.WriteString("\n")
			}
		default: // nfs
			stdinBuf.WriteString("\n")
		}

		cmd := exec.Command("gio", "mount", uri)
		cmd.Stdin = &stdinBuf
		_ = cmd.Run()

		// Aguarda ponto de montagem aparecer no GVFS ou /proc/mounts
		for i := 0; i < 15; i++ {
			if mounted := findMountedLinuxShare(proto, host, share); mounted != "" {
				nav := mounted
				if subpath != "" {
					nav = filepath.Join(nav, subpath)
				}
				return &NetworkMountResult{
					ConnectedPath: nav,
					RemoteTarget:  uri,
				}, nil
			}
			time.Sleep(120 * time.Millisecond)
		}
	}

	if proto == "nfs" {
		return nil, fmt.Errorf("não foi possível montar %s automaticamente (instale gvfs-backends com suporte NFS ou monte via sistema com: sudo mount -t nfs %s:/%s /mnt/...)", uri, host, strings.TrimPrefix(share, "/"))
	}
	return nil, fmt.Errorf("não foi possível montar %s (verifique se gvfs / gio está instalado e se as credenciais estão corretas)", uri)
}

func DisconnectNetworkDrive(target string) error {
	clean := strings.TrimSpace(target)
	if clean == "" {
		return nil
	}
	if runtime.GOOS == "darwin" {
		if err := exec.Command("diskutil", "unmount", clean).Run(); err == nil {
			return nil
		}
		return exec.Command("umount", clean).Run()
	}
	if _, err := exec.LookPath("gio"); err == nil {
		if err := exec.Command("gio", "mount", "-u", clean).Run(); err == nil {
			return nil
		}
	}
	return exec.Command("umount", clean).Run()
}

func listUnixMountedNetworkDrives() []DriveInfo {
	var out []DriveInfo

	if runtime.GOOS == "darwin" {
		entries, err := os.ReadDir("/Volumes")
		if err != nil {
			return out
		}
		mountOut, _ := exec.Command("mount").Output()
		mountLines := strings.Split(string(mountOut), "\n")

		for _, e := range entries {
			volPath := filepath.Join("/Volumes", e.Name())
			isNet := false
			remote := ""
			for _, ml := range mountLines {
				if strings.Contains(ml, " on "+volPath+" ") &&
					(strings.Contains(ml, "smbfs") || strings.Contains(ml, "nfs") || strings.Contains(ml, "afpfs") || strings.Contains(ml, "webdav")) {
					isNet = true
					if idx := strings.Index(ml, " on "); idx > 0 {
						remote = strings.TrimSpace(ml[:idx])
					}
					break
				}
			}
			if !isNet {
				continue
			}
			var freeBytes, totalBytes uint64
			var st syscall.Statfs_t
			if err := syscall.Statfs(volPath, &st); err == nil {
				freeBytes = st.Bavail * uint64(st.Bsize)
				totalBytes = st.Blocks * uint64(st.Bsize)
			}
			out = append(out, DriveInfo{
				Path:         volPath,
				Label:        e.Name(),
				FreeBytes:    freeBytes,
				TotalBytes:   totalBytes,
				IsNetwork:    true,
				RemoteTarget: remote,
			})
		}
		return out
	}

	// Linux: 1) /proc/mounts (cifs, smb3, nfs, nfs4, sshfs)
	if rawMounts, err := os.ReadFile("/proc/mounts"); err == nil {
		for _, line := range strings.Split(string(rawMounts), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 3 {
				continue
			}
			src := unescapeProcMountField(fields[0])
			mnt := unescapeProcMountField(fields[1])
			fstype := fields[2]
			if fstype == "cifs" || fstype == "smb3" || fstype == "nfs" || fstype == "nfs4" || fstype == "afpfs" || fstype == "fuse.sshfs" {
				var freeBytes, totalBytes uint64
				var st syscall.Statfs_t
				if err := syscall.Statfs(mnt, &st); err == nil {
					freeBytes = st.Bavail * uint64(st.Bsize)
					totalBytes = st.Blocks * uint64(st.Bsize)
				}
				out = append(out, DriveInfo{
					Path:         mnt,
					Label:        fmt.Sprintf("%s (%s)", filepath.Base(mnt), src),
					FreeBytes:    freeBytes,
					TotalBytes:   totalBytes,
					IsNetwork:    true,
					RemoteTarget: src,
				})
			}
		}
	}

	// Linux: 2) Montagens GVFS (/run/user/<uid>/gvfs)
	if gvfs := resolveLinuxGVFSDir(); gvfs != "" {
		if entries, err := os.ReadDir(gvfs); err == nil {
			for _, e := range entries {
				mnt := filepath.Join(gvfs, e.Name())
				var freeBytes, totalBytes uint64
				var st syscall.Statfs_t
				if err := syscall.Statfs(mnt, &st); err == nil {
					freeBytes = st.Bavail * uint64(st.Bsize)
					totalBytes = st.Blocks * uint64(st.Bsize)
				}
				out = append(out, DriveInfo{
					Path:         mnt,
					Label:        e.Name(),
					FreeBytes:    freeBytes,
					TotalBytes:   totalBytes,
					IsNetwork:    true,
					RemoteTarget: e.Name(),
				})
			}
		}
	}

	return out
}

