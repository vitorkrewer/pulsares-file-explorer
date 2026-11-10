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
	if strings.HasPrefix(lower, "smb://") || strings.HasPrefix(lower, "cifs://") || strings.HasPrefix(trimmed, `\\`) || strings.HasPrefix(trimmed, "//") {
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

func findMountedLinuxGVFSShare(host, share string) string {
	gvfs := resolveLinuxGVFSDir()
	if gvfs == "" {
		return ""
	}
	entries, err := os.ReadDir(gvfs)
	if err != nil {
		return ""
	}
	hostLower := strings.ToLower(host)
	shareLower := strings.ToLower(share)
	for _, e := range entries {
		nameLower := strings.ToLower(e.Name())
		if strings.Contains(nameLower, "server="+hostLower) {
			if shareLower == "" || strings.Contains(nameLower, "share="+shareLower) {
				return filepath.Join(gvfs, e.Name())
			}
		}
	}
	return ""
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
			for _, e := range entries {
				if strings.Contains(strings.ToLower(e.Name()), "server="+strings.ToLower(cleanHost)) {
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
	proto, host, share, subpath := ParseNetworkAddress(req.Address)
	if host == "" {
		return nil, errors.New("informe um endereço ou IP válido (ex.: smb://192.168.10.195/Publico)")
	}
	if proto == "" {
		proto = "smb"
	}

	if share == "" {
		shares, err := ListServerShares(host, false)
		if err == nil && len(shares) > 0 {
			return &NetworkMountResult{
				ConnectedPath: fmt.Sprintf("smb://%s", host),
				RemoteTarget:  fmt.Sprintf("smb://%s", host),
				IsServerRoot:  true,
				Shares:        shares,
			}, nil
		}
		return nil, fmt.Errorf("informe o nome da pasta compartilhada após o IP (ex.: smb://%s/Publico)", host)
	}

	// macOS: monta em /Volumes/<share> via AppleScript mount volume
	if runtime.GOOS == "darwin" {
		u := url.URL{
			Scheme: proto,
			Host:   host,
			Path:   "/" + share,
		}
		if strings.TrimSpace(req.Username) != "" {
			user := strings.TrimSpace(req.Username)
			if dom := strings.TrimSpace(req.Domain); dom != "" && !strings.Contains(user, ";") {
				user = dom + ";" + user
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

		volPath := filepath.Join("/Volumes", share)
		if subpath != "" {
			volPath = filepath.Join(volPath, subpath)
		}
		return &NetworkMountResult{
			ConnectedPath: volPath,
			RemoteTarget:  fmt.Sprintf("%s://%s/%s", proto, host, share),
		}, nil
	}

	// Linux: monta via GVFS (gio mount smb://host/share) em /run/user/<uid>/gvfs/...
	if existing := findMountedLinuxGVFSShare(host, share); existing != "" {
		nav := existing
		if subpath != "" {
			nav = filepath.Join(nav, subpath)
		}
		return &NetworkMountResult{
			ConnectedPath: nav,
			RemoteTarget:  fmt.Sprintf("%s://%s/%s", proto, host, share),
		}, nil
	}

	uri := fmt.Sprintf("%s://%s/%s", proto, host, share)
	if _, err := exec.LookPath("gio"); err == nil {
		var stdinBuf bytes.Buffer
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

		cmd := exec.Command("gio", "mount", uri)
		cmd.Stdin = &stdinBuf
		_ = cmd.Run()

		// Aguarda ponto de montagem aparecer no GVFS
		for i := 0; i < 15; i++ {
			if mounted := findMountedLinuxGVFSShare(host, share); mounted != "" {
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
			src, mnt, fstype := fields[0], fields[1], fields[2]
			if fstype == "cifs" || fstype == "smb3" || fstype == "nfs" || fstype == "nfs4" || fstype == "fuse.sshfs" {
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

