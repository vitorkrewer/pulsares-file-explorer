package platform

import (
	"net/url"
	"strings"
)

type NetworkShareInfo struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Remark string `json:"remark,omitempty"`
}

type NetworkMountRequest struct {
	Protocol    string `json:"protocol,omitempty"` // "", "auto", "smb", "nfs", "afp"
	Address     string `json:"address"`
	Label       string `json:"label"`
	Username    string `json:"username"`
	Domain      string `json:"domain"`
	Password    string `json:"password"`
	DriveLetter string `json:"driveLetter"` // Ex: "Z:" (apenas Windows, opcional)
	Persistent  bool   `json:"persistent"`
}

type NetworkMountResult struct {
	ConnectedPath string             `json:"connectedPath"`
	MappedDrive   string             `json:"mappedDrive,omitempty"`
	RemoteTarget  string             `json:"remoteTarget,omitempty"`
	IsServerRoot  bool               `json:"isServerRoot,omitempty"`
	Shares        []NetworkShareInfo `json:"shares,omitempty"`
}

func normalizeNetworkProtocol(proto string) string {
	switch strings.ToLower(strings.TrimSpace(proto)) {
	case "smb", "cifs":
		return "smb"
	case "nfs", "nfs4":
		return "nfs"
	case "afp", "afpfs":
		return "afp"
	default:
		return ""
	}
}

// ParseNetworkAddress interpreta endereços de rede em múltiplos formatos:
//   - \\192.168.10.195\  ou  \\192.168.10.195\Publico\Docs
//   - //192.168.10.195/Publico
//   - smb://192.168.10.195/Publico, cifs://..., nfs://192.168.10.195/mnt/dados, afp://192.168.10.195/TimeMachine
//   - 192.168.10.195:/mnt/dados (sintaxe clássica de exportação NFS)
//   - 192.168.10.195  ou  192.168.10.195/Publico (quando digitado no modal de conexão)
func ParseNetworkAddress(raw string) (protocol, host, share, subpath string) {
	return ParseNetworkAddressWithProtocol(raw, "")
}

// ParseNetworkAddressWithProtocol interpreta o endereço aplicando forcedProto ("smb", "nfs", "afp")
// quando o usuário não digitou um esquema explícito no endereço.
func ParseNetworkAddressWithProtocol(raw, forcedProto string) (protocol, host, share, subpath string) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", "", ""
	}

	hint := normalizeNetworkProtocol(forcedProto)
	lower := strings.ToLower(trimmed)

	if strings.HasPrefix(lower, "smb://") ||
		strings.HasPrefix(lower, "cifs://") ||
		strings.HasPrefix(lower, "nfs://") ||
		strings.HasPrefix(lower, "afp://") {
		if u, err := url.Parse(trimmed); err == nil && u.Host != "" {
			proto := normalizeNetworkProtocol(u.Scheme)
			segs := splitNonEmptySegments(u.Path)
			if proto == "nfs" {
				// Em NFS, o caminho exportado pode ter múltiplos níveis (ex: /volume1/media)
				if len(segs) >= 1 {
					share = strings.Join(segs, "/")
				}
				return proto, u.Host, share, ""
			}
			if len(segs) >= 1 {
				share = segs[0]
			}
			if len(segs) >= 2 {
				subpath = strings.Join(segs[1:], "/")
			}
			return proto, u.Host, share, subpath
		}
	}

	// Sintaxe clássica NFS: host:/caminho/exportado (garantindo que host tenha >1 caractere para não confundir com C:\)
	if !strings.Contains(trimmed, "://") {
		slashForm := strings.ReplaceAll(trimmed, `\`, `/`)
		if idx := strings.Index(slashForm, ":/"); idx > 1 && !strings.ContainsAny(slashForm[:idx], "/ ") {
			nfsHost := slashForm[:idx]
			segs := splitNonEmptySegments(slashForm[idx+2:])
			if len(segs) >= 1 {
				share = strings.Join(segs, "/")
			}
			return "nfs", nfsHost, share, ""
		}
		if strings.HasSuffix(slashForm, ":") && len(slashForm) > 2 && !strings.ContainsAny(slashForm[:len(slashForm)-1], "/: ") {
			return "nfs", slashForm[:len(slashForm)-1], "", ""
		}
	}

	effectiveProto := hint
	if effectiveProto == "" {
		effectiveProto = "smb"
	}

	// Caminho UNC \\host\share ou //host/share
	normalized := strings.ReplaceAll(trimmed, `\`, `/`)
	if strings.HasPrefix(normalized, "//") {
		rest := strings.Trim(strings.TrimPrefix(normalized, "//"), "/")
		if rest == "" {
			return effectiveProto, "", "", ""
		}
		segs := splitNonEmptySegments(rest)
		if len(segs) == 0 {
			return effectiveProto, "", "", ""
		}
		host = segs[0]
		if effectiveProto == "nfs" {
			if len(segs) >= 2 {
				share = strings.Join(segs[1:], "/")
			}
			return "nfs", host, share, ""
		}
		if len(segs) >= 2 {
			share = segs[1]
		}
		if len(segs) >= 3 {
			subpath = strings.Join(segs[2:], "/")
		}
		return effectiveProto, host, share, subpath
	}

	// Host/IP puro informado no modal (ex: "192.168.10.195" ou "192.168.10.195/Publico")
	segs := splitNonEmptySegments(normalized)
	if len(segs) >= 1 {
		host = segs[0]
	}
	if effectiveProto == "nfs" {
		if len(segs) >= 2 {
			share = strings.Join(segs[1:], "/")
		}
		return "nfs", host, share, ""
	}
	if len(segs) >= 2 {
		share = segs[1]
	}
	if len(segs) >= 3 {
		subpath = strings.Join(segs[2:], "/")
	}
	return effectiveProto, host, share, subpath
}

func splitNonEmptySegments(p string) []string {
	rawSegs := strings.Split(strings.Trim(p, "/"), "/")
	var out []string
	for _, s := range rawSegs {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// ParseShowmountExports converte a saída de `showmount -e <host>` em entradas navegáveis.
func ParseShowmountExports(output, host string, windowsUNC bool) []NetworkShareInfo {
	cleanHost := strings.Trim(strings.TrimSpace(host), `\/`)
	if cleanHost == "" {
		return nil
	}
	var shares []NetworkShareInfo
	for _, rawLine := range strings.Split(output, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || !strings.HasPrefix(line, "/") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		exportPath := fields[0]
		acl := ""
		if len(fields) > 1 {
			acl = strings.Join(fields[1:], " ")
		}
		name := strings.TrimPrefix(exportPath, "/")
		if name == "" {
			name = "/"
		}
		targetPath := "nfs://" + cleanHost + exportPath
		if windowsUNC {
			winRel := strings.ReplaceAll(strings.TrimPrefix(exportPath, "/"), "/", `\`)
			if winRel == "" {
				targetPath = `\\` + cleanHost
			} else {
				targetPath = `\\` + cleanHost + `\` + winRel
			}
		}
		remark := "NFS"
		if acl != "" {
			remark = "NFS (" + acl + ")"
		}
		shares = append(shares, NetworkShareInfo{
			Name:   name,
			Path:   targetPath,
			Remark: remark,
		})
	}
	return shares
}

