//go:build !windows

package platform

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// ListOpenWithApps descobre os aplicativos instalados em sistemas Unix/macOS capazes de abrir o arquivo informado.
func ListOpenWithApps(targetPath string) ([]OpenWithApp, error) {
	clean := strings.TrimSpace(targetPath)
	if clean == "" {
		return nil, fmt.Errorf("empty target path")
	}

	var results []OpenWithApp
	seen := make(map[string]bool)

	addBin := func(bin string, label string, isDefault bool) {
		p, err := exec.LookPath(bin)
		if err != nil || p == "" {
			return
		}
		if seen[p] {
			return
		}
		seen[p] = true
		results = append(results, OpenWithApp{
			ID:        bin,
			Name:      label,
			ExePath:   p,
			Command:   p,
			IsDefault: isDefault,
		})
	}

	if runtime.GOOS == "darwin" {
		for _, app := range []struct {
			bundle string
			name   string
		}{
			{"/System/Applications/TextEdit.app", "TextEdit"},
			{"/System/Applications/Preview.app", "Preview"},
			{"/Applications/Safari.app", "Safari"},
			{"/Applications/Google Chrome.app", "Google Chrome"},
			{"/Applications/Firefox.app", "Mozilla Firefox"},
			{"/Applications/VLC.app", "VLC Media Player"},
		} {
			if _, err := os.Stat(app.bundle); err == nil {
				results = append(results, OpenWithApp{
					ID:      filepath.Base(app.bundle),
					Name:    app.name,
					ExePath: app.bundle,
					Command: app.bundle,
				})
			}
		}
	} else {
		addBin("xdg-open", "Aplicativo Padrão do Sistema (xdg-open)", true)
		addBin("gedit", "GNOME Text Editor (gedit)", false)
		addBin("kate", "KDE Kate", false)
		addBin("mousepad", "Mousepad", false)
		addBin("firefox", "Mozilla Firefox", false)
		addBin("google-chrome", "Google Chrome", false)
		addBin("vlc", "VLC Media Player", false)
		addBin("gimp", "GIMP", false)
		addBin("libreoffice", "LibreOffice", false)
	}

	return results, nil
}

// OpenFileWithApp abre o arquivo informado utilizando o aplicativo escolhido em sistemas Unix/macOS.
func OpenFileWithApp(targetPath string, appExeOrCommand string) error {
	cleanTarget := filepath.Clean(strings.TrimSpace(targetPath))
	if cleanTarget == "" {
		return fmt.Errorf("empty target path")
	}
	spec := strings.TrimSpace(appExeOrCommand)
	if spec == "" {
		return fmt.Errorf("empty application command or path")
	}

	if runtime.GOOS == "darwin" && strings.HasSuffix(strings.ToLower(spec), ".app") {
		cmd := exec.Command("open", "-a", spec, cleanTarget)
		return cmd.Start()
	}

	cmd := exec.Command(spec, cleanTarget)
	return cmd.Start()
}

