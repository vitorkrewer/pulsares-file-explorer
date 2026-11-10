package platform

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

var winEnvPattern = regexp.MustCompile(`%([A-Za-z_][A-Za-z0-9_]*)%`)

// ExpandPath expande ~ (pasta pessoal), variáveis %VAR% (Windows), $VAR / ${VAR} (POSIX)
// e preserva endereços de rede (\\servidor\, smb://servidor/pasta).
func ExpandPath(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}

	// 1. Expandir ~ no início
	if trimmed == "~" {
		return GetHomeDir()
	}
	if strings.HasPrefix(trimmed, "~/") || strings.HasPrefix(trimmed, `~\`) {
		home := GetHomeDir()
		trimmed = filepath.Join(home, trimmed[2:])
	}

	// 2. Expandir %VAR% (estilo Windows, funciona em qualquer SO se a env existir)
	expanded := winEnvPattern.ReplaceAllStringFunc(trimmed, func(match string) string {
		key := match[1 : len(match)-1]
		if val, ok := lookupEnvCaseInsensitive(key); ok && val != "" {
			return val
		}
		return match
	})

	// 3. Expandir $VAR e ${VAR}
	expanded = os.Expand(expanded, func(key string) string {
		if val, ok := lookupEnvCaseInsensitive(key); ok {
			return val
		}
		return ""
	})

	// 4. Tratamento de endereços de rede (UNC / SMB / NFS)
	lower := strings.ToLower(expanded)
	if runtime.GOOS == "windows" {
		if strings.HasPrefix(lower, "smb://") || strings.HasPrefix(lower, "cifs://") {
			_, host, share, subpath := ParseNetworkAddress(expanded)
			if host != "" {
				if share == "" {
					return `\\` + host
				}
				unc := `\\` + host + `\` + share
				if subpath != "" {
					unc += `\` + strings.ReplaceAll(subpath, "/", `\`)
				}
				return filepath.Clean(unc)
			}
		}
		if host, ok := IsNetworkServerRoot(expanded); ok {
			// filepath.Clean(`\\host\`) no Windows remove uma barra por não haver share segment; preservamos `\\host`.
			return `\\` + host
		}
	} else {
		if host, ok := IsNetworkServerRoot(expanded); ok {
			return "smb://" + host
		}
		if strings.HasPrefix(lower, "smb://") || strings.HasPrefix(lower, "cifs://") || strings.HasPrefix(lower, "nfs://") || strings.HasPrefix(expanded, `\\`) {
			if res, err := ConnectNetworkDrive(NetworkMountRequest{Address: expanded}); err == nil && res.ConnectedPath != "" {
				return res.ConnectedPath
			}
			return expanded
		}
	}

	return filepath.Clean(expanded)
}

func lookupEnvCaseInsensitive(key string) (string, bool) {
	if val, ok := os.LookupEnv(key); ok {
		return val, true
	}
	upper := strings.ToUpper(key)
	for _, pair := range os.Environ() {
		if idx := strings.IndexByte(pair, '='); idx > 0 {
			if strings.ToUpper(pair[:idx]) == upper {
				return pair[idx+1:], true
			}
		}
	}
	return "", false
}

// AutocompleteDirs retorna até maxResults caminhos de subdiretórios que casam com o prefixo digitado.
func AutocompleteDirs(partial string, showHidden bool, maxResults int) []string {
	if maxResults <= 0 {
		maxResults = 12
	}
	trimmed := strings.TrimSpace(partial)
	if trimmed == "" {
		return nil
	}

	expanded := ExpandPath(trimmed)
	endsWithSep := strings.HasSuffix(trimmed, "/") || strings.HasSuffix(trimmed, `\`)

	// Autocomplete para raiz de servidor de rede (ex: \\192.168.10.195\ ou \\192.168.10.195\Pub)
	if host, ok := IsNetworkServerRoot(expanded); ok && endsWithSep {
		shares, err := ListServerShares(host, showHidden)
		if err != nil {
			return nil
		}
		var out []string
		for _, sh := range shares {
			out = append(out, sh.Path)
			if len(out) >= maxResults {
				break
			}
		}
		return out
	}
	if !endsWithSep && (strings.HasPrefix(expanded, `\\`) || strings.HasPrefix(strings.ToLower(expanded), "smb://")) {
		_, host, share, subpath := ParseNetworkAddress(expanded)
		if host != "" && share != "" && subpath == "" {
			shares, err := ListServerShares(host, showHidden)
			if err == nil {
				prefix := strings.ToLower(share)
				var out []string
				for _, sh := range shares {
					if strings.HasPrefix(strings.ToLower(sh.Name), prefix) {
						out = append(out, sh.Path)
						if len(out) >= maxResults {
							break
						}
					}
				}
				return out
			}
		}
	}

	var dirToScan, prefix string
	if endsWithSep {
		dirToScan = expanded
		prefix = ""
	} else {
		dirToScan = filepath.Dir(expanded)
		prefix = strings.ToLower(filepath.Base(expanded))
	}

	entries, err := os.ReadDir(dirToScan)
	if err != nil {
		return nil
	}

	var suggestions []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !showHidden && strings.HasPrefix(name, ".") {
			continue
		}
		if prefix == "" || strings.HasPrefix(strings.ToLower(name), prefix) {
			suggestions = append(suggestions, filepath.Join(dirToScan, name))
			if len(suggestions) >= maxResults {
				break
			}
		}
	}

	return suggestions
}
