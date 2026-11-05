package platform

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type ItemProperties struct {
	Name          string `json:"name"`
	Path          string `json:"path"`
	ParentDir     string `json:"parentDir"`
	Kind          string `json:"kind"` // "file" | "folder" | "symlink"
	Extension     string `json:"extension"`
	Size          int64  `json:"size"`
	FileCount     int    `json:"fileCount"`
	FolderCount   int    `json:"folderCount"`
	ModifiedAt    int64  `json:"modifiedAt"`
	Permissions   string `json:"permissions"`
	IsReadOnly    bool   `json:"isReadOnly"`
	IsHidden      bool   `json:"isHidden"`
	SymlinkTarget string `json:"symlinkTarget,omitempty"`
	SHA256        string `json:"sha256,omitempty"`
}

// GetItemProperties retorna metadados detalhados de um arquivo ou pasta (incluindo cálculo recursivo de tamanho de pastas e SHA-256 de arquivos até 64 MB).
func GetItemProperties(targetPath string) (ItemProperties, error) {
	clean := filepath.Clean(targetPath)
	lstat, err := os.Lstat(clean)
	if err != nil {
		return ItemProperties{}, err
	}

	name := lstat.Name()
	if name == "." || name == `\` || name == "/" {
		name = clean
	}

	kind := "file"
	symlinkTarget := ""
	if lstat.Mode()&os.ModeSymlink != 0 {
		kind = "symlink"
		if target, err := os.Readlink(clean); err == nil {
			symlinkTarget = target
		}
	} else if lstat.IsDir() {
		kind = "folder"
	}

	ext := ""
	if kind == "file" {
		ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
	}

	props := ItemProperties{
		Name:          name,
		Path:          clean,
		ParentDir:     filepath.Dir(clean),
		Kind:          kind,
		Extension:     ext,
		Size:          lstat.Size(),
		ModifiedAt:    lstat.ModTime().UnixMilli(),
		Permissions:   lstat.Mode().Perm().String(),
		IsReadOnly:    lstat.Mode().Perm()&0o200 == 0,
		IsHidden:      strings.HasPrefix(name, "."),
		SymlinkTarget: symlinkTarget,
	}

	if kind == "folder" {
		var totalSize int64
		var files, folders int
		maxItems := 25000
		seen := 0
		_ = filepath.WalkDir(clean, func(p string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			if p == clean {
				return nil
			}
			seen++
			if seen > maxItems {
				return fs.SkipAll
			}
			if d.IsDir() {
				folders++
			} else {
				files++
				if fi, err := d.Info(); err == nil {
					totalSize += fi.Size()
				}
			}
			return nil
		})
		props.Size = totalSize
		props.FileCount = files
		props.FolderCount = folders
	} else if kind == "file" && lstat.Size() >= 0 && lstat.Size() <= 64*1024*1024 {
		if sum, err := computeSHA256(clean); err == nil {
			props.SHA256 = sum
		}
	}

	return props, nil
}

func computeSHA256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// OpenWithDialog abre o seletor nativo "Abrir com..." do sistema operacional.
func OpenWithDialog(targetPath string) error {
	clean := filepath.Clean(targetPath)
	switch runtime.GOOS {
	case "windows":
		cmd := exec.Command("rundll32.exe", "shell32.dll,OpenAs_RunDLL", clean)
		return cmd.Start()
	case "darwin":
		cmd := exec.Command("open", "-a", "Finder", clean)
		return cmd.Start()
	default:
		cmd := exec.Command("xdg-open", clean)
		return cmd.Start()
	}
}

// OpenExternalTerminal abre o terminal nativo externo do sistema operacional na pasta informada.
func OpenExternalTerminal(dirPath string) error {
	clean := filepath.Clean(dirPath)
	info, err := os.Stat(clean)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		clean = filepath.Dir(clean)
	}

	switch runtime.GOOS {
	case "windows":
		if wtPath, err := exec.LookPath("wt.exe"); err == nil && wtPath != "" {
			cmd := exec.Command(wtPath, "-d", clean)
			return cmd.Start()
		}
		cmd := exec.Command("cmd.exe", "/c", "start", "cmd.exe", "/K", fmt.Sprintf("cd /d %q", clean))
		return cmd.Start()
	case "darwin":
		cmd := exec.Command("open", "-a", "Terminal", clean)
		return cmd.Start()
	default:
		for _, bin := range []string{"x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"} {
			if p, err := exec.LookPath(bin); err == nil && p != "" {
				cmd := exec.Command(p)
				cmd.Dir = clean
				return cmd.Start()
			}
		}
		return fmt.Errorf("no external terminal found")
	}
}

// RevealInSystemExplorer abre o gerenciador de arquivos nativo do SO selecionando o item informado.
func RevealInSystemExplorer(targetPath string) error {
	clean := filepath.Clean(targetPath)
	switch runtime.GOOS {
	case "windows":
		cmd := exec.Command("explorer.exe", "/select,"+clean)
		return cmd.Start()
	case "darwin":
		cmd := exec.Command("open", "-R", clean)
		return cmd.Start()
	default:
		parent := filepath.Dir(clean)
		cmd := exec.Command("xdg-open", parent)
		return cmd.Start()
	}
}

// EjectDrive solicita a ejeção segura de uma unidade removível no sistema operacional.
func EjectDrive(drivePath string) error {
	clean := strings.TrimSpace(drivePath)
	if clean == "" {
		return fmt.Errorf("empty drive path")
	}

	switch runtime.GOOS {
	case "windows":
		vol := strings.TrimSuffix(clean, `\`)
		vol = strings.TrimSuffix(vol, "/")
		if len(vol) == 1 {
			vol += ":"
		}
		script := fmt.Sprintf("(New-Object -ComObject Shell.Application).Namespace(17).ParseName('%s').InvokeVerb('Eject')", vol)
		cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
		return cmd.Run()
	case "darwin":
		cmd := exec.Command("diskutil", "eject", clean)
		return cmd.Run()
	default:
		cmd := exec.Command("eject", clean)
		return cmd.Run()
	}
}

