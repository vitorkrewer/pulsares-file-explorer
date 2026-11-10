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

// ParseNetworkAddress interpreta endereços de rede em múltiplos formatos:
//   - \\192.168.10.195\  ou  \\192.168.10.195\Publico\Docs
//   - //192.168.10.195/Publico
//   - smb://192.168.10.195/Publico  ou  cifs://...  ou  nfs://...
//   - 192.168.10.195  ou  192.168.10.195/Publico (quando digitado no modal de conexão)
func ParseNetworkAddress(raw string) (protocol, host, share, subpath string) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", "", ""
	}

	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "smb://") || strings.HasPrefix(lower, "cifs://") || strings.HasPrefix(lower, "nfs://") {
		if u, err := url.Parse(trimmed); err == nil && u.Host != "" {
			proto := strings.ToLower(u.Scheme)
			if proto == "cifs" {
				proto = "smb"
			}
			segs := strings.Split(strings.Trim(u.Path, "/"), "/")
			var cleanSegs []string
			for _, s := range segs {
				if s != "" {
					cleanSegs = append(cleanSegs, s)
				}
			}
			if len(cleanSegs) >= 1 {
				share = cleanSegs[0]
			}
			if len(cleanSegs) >= 2 {
				subpath = strings.Join(cleanSegs[1:], "/")
			}
			return proto, u.Host, share, subpath
		}
	}

	// Caminho UNC \\host\share ou //host/share
	normalized := strings.ReplaceAll(trimmed, `\`, `/`)
	if strings.HasPrefix(normalized, "//") {
		rest := strings.TrimPrefix(normalized, "//")
		rest = strings.TrimSuffix(rest, "/")
		if rest == "" {
			return "smb", "", "", ""
		}
		segs := strings.Split(rest, "/")
		var cleanSegs []string
		for _, s := range segs {
			if s != "" {
				cleanSegs = append(cleanSegs, s)
			}
		}
		if len(cleanSegs) == 0 {
			return "smb", "", "", ""
		}
		host = cleanSegs[0]
		if len(cleanSegs) >= 2 {
			share = cleanSegs[1]
		}
		if len(cleanSegs) >= 3 {
			subpath = strings.Join(cleanSegs[2:], "/")
		}
		return "smb", host, share, subpath
	}

	// Host/IP puro informado no modal (ex: "192.168.10.195" ou "192.168.10.195/Publico")
	rest := strings.Trim(normalized, "/")
	segs := strings.Split(rest, "/")
	var cleanSegs []string
	for _, s := range segs {
		if s != "" {
			cleanSegs = append(cleanSegs, s)
		}
	}
	if len(cleanSegs) >= 1 {
		host = cleanSegs[0]
	}
	if len(cleanSegs) >= 2 {
		share = cleanSegs[1]
	}
	if len(cleanSegs) >= 3 {
		subpath = strings.Join(cleanSegs[2:], "/")
	}
	return "smb", host, share, subpath
}

