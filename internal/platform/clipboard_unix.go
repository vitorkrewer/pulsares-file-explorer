//go:build !windows

package platform

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image/png"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
)

var unixClipSeq uint64

func GetClipboardSequence() uint64 {
	if runtime.GOOS == "darwin" {
		// NSPasteboard.generalPasteboard.changeCount é o contador nativo do macOS (equivalente ao GetClipboardSequenceNumber do Windows)
		out, err := exec.Command(
			"osascript", "-l", "JavaScript", "-e",
			`ObjC.import('AppKit'); $.NSPasteboard.generalPasteboard.changeCount;`,
		).Output()
		if err == nil {
			if v, errParse := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64); errParse == nil && v > 0 {
				return v
			}
		}
	}
	return atomic.AddUint64(&unixClipSeq, 1)
}

func pathToFileURI(p string) string {
	u := url.URL{
		Scheme: "file",
		Path:   filepath.ToSlash(filepath.Clean(p)),
	}
	return u.String()
}

func fileURIToPath(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if !strings.HasPrefix(trimmed, "file://") {
		return ""
	}
	u, err := url.Parse(trimmed)
	if err != nil {
		return ""
	}
	if unescaped, err := url.PathUnescape(u.Path); err == nil && unescaped != "" {
		return filepath.Clean(unescaped)
	}
	return filepath.Clean(u.Path)
}

func SetSystemClipboardFiles(paths []string, cut bool) error {
	var cleanPaths []string
	for _, p := range paths {
		trimmed := strings.TrimSpace(p)
		if trimmed == "" || strings.HasPrefix(trimmed, "sftp://") {
			continue
		}
		cleanPaths = append(cleanPaths, filepath.Clean(trimmed))
	}
	if len(cleanPaths) == 0 {
		return nil
	}

	// macOS (Finder / NSPasteboard via JXA AppKit):
	// Escreve NSURLs reais no NSPasteboard para colar múltiplos arquivos diretamente no Finder.
	if runtime.GOOS == "darwin" {
		pathsJSON, err := json.Marshal(cleanPaths)
		if err != nil {
			return err
		}
		jxa := fmt.Sprintf(`
ObjC.import('AppKit');
ObjC.import('Foundation');
var paths = %s;
var pb = $.NSPasteboard.generalPasteboard;
pb.clearContents;
var urls = $.NSMutableArray.alloc.init;
for (var i = 0; i < paths.length; i++) {
  urls.addObject($.NSURL.fileURLWithPath(paths[i]));
}
pb.writeObjects(urls);
`, string(pathsJSON))
		return exec.Command("osascript", "-l", "JavaScript", "-e", jxa).Run()
	}

	// Linux (GNOME Nautilus / KDE Dolphin / XFCE Thunar / Cinnamon Nemo):
	// Formato freedesktop x-special/gnome-copied-files ("copy\nfile:///..." ou "cut\nfile:///...")
	action := "copy"
	if cut {
		action = "cut"
	}
	var gnomeLines []string
	gnomeLines = append(gnomeLines, action)
	for _, cp := range cleanPaths {
		gnomeLines = append(gnomeLines, pathToFileURI(cp))
	}
	gnomePayload := []byte(strings.Join(gnomeLines, "\n"))

	if os.Getenv("WAYLAND_DISPLAY") != "" {
		if _, err := exec.LookPath("wl-copy"); err == nil {
			cmd := exec.Command("wl-copy", "--type", "x-special/gnome-copied-files")
			cmd.Stdin = bytes.NewReader(gnomePayload)
			if err := cmd.Run(); err == nil {
				return nil
			}
		}
	}

	if _, err := exec.LookPath("xclip"); err == nil {
		cmd := exec.Command("xclip", "-selection", "clipboard", "-t", "x-special/gnome-copied-files")
		cmd.Stdin = bytes.NewReader(gnomePayload)
		if err := cmd.Run(); err == nil {
			return nil
		}
	}

	return nil
}

func parseLinuxFileClipboard(raw string) ([]string, bool) {
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	if len(lines) == 0 {
		return nil, false
	}
	isCut := false
	startIdx := 0
	first := strings.TrimSpace(strings.ToLower(lines[0]))
	if first == "copy" || first == "cut" {
		isCut = first == "cut"
		startIdx = 1
	}

	var paths []string
	for _, line := range lines[startIdx:] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if p := fileURIToPath(trimmed); p != "" {
			paths = append(paths, p)
		}
	}
	return paths, isCut
}

func GetSystemClipboardFiles() ([]string, bool, error) {
	// macOS: lê arquivos copiados no Finder via NSPasteboard (NSFilenamesPboardType / public.file-url)
	if runtime.GOOS == "darwin" {
		jxa := `
ObjC.import('AppKit');
var pb = $.NSPasteboard.generalPasteboard;
var list = pb.propertyListForType('NSFilenamesPboardType');
var out = [];
if (list && list.count > 0) {
  for (var i = 0; i < list.count; i++) {
    out.push(ObjC.unwrap(list.objectAtIndex(i)));
  }
}
JSON.stringify(out);
`
		out, err := exec.Command("osascript", "-l", "JavaScript", "-e", jxa).Output()
		if err != nil {
			return nil, false, nil
		}
		var paths []string
		if err := json.Unmarshal(bytes.TrimSpace(out), &paths); err == nil && len(paths) > 0 {
			return paths, false, nil
		}
		return nil, false, nil
	}

	// Linux Wayland (wl-paste)
	if os.Getenv("WAYLAND_DISPLAY") != "" {
		if _, err := exec.LookPath("wl-paste"); err == nil {
			typesOut, err := exec.Command("wl-paste", "--list-types").Output()
			if err == nil {
				mimeList := string(typesOut)
				if strings.Contains(mimeList, "x-special/gnome-copied-files") {
					if out, err := exec.Command("wl-paste", "--no-newline", "--type", "x-special/gnome-copied-files").Output(); err == nil {
						if paths, cut := parseLinuxFileClipboard(string(out)); len(paths) > 0 {
							return paths, cut, nil
						}
					}
				}
				if strings.Contains(mimeList, "text/uri-list") {
					if out, err := exec.Command("wl-paste", "--no-newline", "--type", "text/uri-list").Output(); err == nil {
						paths, cut := parseLinuxFileClipboard(string(out))
						if len(paths) > 0 {
							if strings.Contains(mimeList, "application/x-kde-cutselection") {
								if kdeCut, errK := exec.Command("wl-paste", "--no-newline", "--type", "application/x-kde-cutselection").Output(); errK == nil && strings.TrimSpace(string(kdeCut)) == "1" {
									cut = true
								}
							}
							return paths, cut, nil
						}
					}
				}
			}
		}
	}

	// Linux X11 (xclip)
	if _, err := exec.LookPath("xclip"); err == nil {
		targetsOut, err := exec.Command("xclip", "-selection", "clipboard", "-t", "TARGETS", "-o").Output()
		if err == nil {
			targets := string(targetsOut)
			if strings.Contains(targets, "x-special/gnome-copied-files") {
				if out, err := exec.Command("xclip", "-selection", "clipboard", "-t", "x-special/gnome-copied-files", "-o").Output(); err == nil {
					if paths, cut := parseLinuxFileClipboard(string(out)); len(paths) > 0 {
						return paths, cut, nil
					}
				}
			}
			if strings.Contains(targets, "text/uri-list") {
				if out, err := exec.Command("xclip", "-selection", "clipboard", "-t", "text/uri-list", "-o").Output(); err == nil {
					paths, cut := parseLinuxFileClipboard(string(out))
					if len(paths) > 0 {
						if strings.Contains(targets, "application/x-kde-cutselection") {
							if kdeCut, errK := exec.Command("xclip", "-selection", "clipboard", "-t", "application/x-kde-cutselection", "-o").Output(); errK == nil && strings.TrimSpace(string(kdeCut)) == "1" {
								cut = true
							}
						}
						return paths, cut, nil
					}
				}
			}
		}
	}

	return nil, false, nil
}

func SetSystemClipboardImagePNG(pngBytes []byte) error {
	if len(pngBytes) == 0 {
		return nil
	}
	if runtime.GOOS == "darwin" {
		tmp, err := os.CreateTemp("", "pulsares-clip-*.png")
		if err != nil {
			return err
		}
		tmpName := tmp.Name()
		defer os.Remove(tmpName)
		_, _ = tmp.Write(pngBytes)
		_ = tmp.Close()
		script := fmt.Sprintf(`set the clipboard to (read (POSIX file "%s") as «class PNGf»)`, tmpName)
		return exec.Command("osascript", "-e", script).Run()
	}

	if os.Getenv("WAYLAND_DISPLAY") != "" {
		if _, err := exec.LookPath("wl-copy"); err == nil {
			cmd := exec.Command("wl-copy", "--type", "image/png")
			cmd.Stdin = bytes.NewReader(pngBytes)
			if err := cmd.Run(); err == nil {
				return nil
			}
		}
	}

	if _, err := exec.LookPath("xclip"); err == nil {
		cmd := exec.Command("xclip", "-selection", "clipboard", "-t", "image/png")
		cmd.Stdin = bytes.NewReader(pngBytes)
		if err := cmd.Run(); err == nil {
			return nil
		}
	}
	return nil
}

func readMacClipboardPNG() []byte {
	jxa := `
ObjC.import('AppKit');
ObjC.import('Foundation');
var pb = $.NSPasteboard.generalPasteboard;
var data = pb.dataForType($.NSPasteboardTypePNG);
if (!data) {
  var tiff = pb.dataForType($.NSPasteboardTypeTIFF);
  if (tiff) {
    var rep = $.NSBitmapImageRep.imageRepWithData(tiff);
    if (rep) {
      data = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
    }
  }
}
data ? ObjC.unwrap(data.base64EncodedStringWithOptions(0)) : '';
`
	out, err := exec.Command("osascript", "-l", "JavaScript", "-e", jxa).Output()
	if err != nil {
		return nil
	}
	b64 := strings.TrimSpace(string(out))
	if b64 == "" {
		return nil
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil
	}
	return raw
}

func ReadSystemClipboardSnapshot() (*SystemClipboardSnapshot, error) {
	snap := &SystemClipboardSnapshot{Sequence: GetClipboardSequence()}

	// 1. Verificar arquivos no clipboard (macOS Finder / Linux Wayland & X11)
	if paths, isCut, err := GetSystemClipboardFiles(); err == nil && len(paths) > 0 {
		snap.Kind = "files"
		snap.Paths = paths
		snap.Cut = isCut
		return snap, nil
	}

	// 2. Verificar imagem PNG no clipboard (macOS NSPasteboard / Linux Wayland & X11)
	var rawPNG []byte
	if runtime.GOOS == "darwin" {
		rawPNG = readMacClipboardPNG()
	} else if os.Getenv("WAYLAND_DISPLAY") != "" {
		if _, err := exec.LookPath("wl-paste"); err == nil {
			if typesOut, err := exec.Command("wl-paste", "--list-types").Output(); err == nil && strings.Contains(string(typesOut), "image/png") {
				rawPNG, _ = exec.Command("wl-paste", "--type", "image/png").Output()
			}
		}
	} else if _, err := exec.LookPath("xclip"); err == nil {
		if targetsOut, err := exec.Command("xclip", "-selection", "clipboard", "-t", "TARGETS", "-o").Output(); err == nil && strings.Contains(string(targetsOut), "image/png") {
			rawPNG, _ = exec.Command("xclip", "-selection", "clipboard", "-t", "image/png", "-o").Output()
		}
	}

	if len(rawPNG) > 0 {
		if cfg, err := png.DecodeConfig(bytes.NewReader(rawPNG)); err == nil {
			snap.Kind = "image"
			snap.ImageB64 = "data:image/png;base64," + base64.StdEncoding.EncodeToString(rawPNG)
			snap.Width = cfg.Width
			snap.Height = cfg.Height
			return snap, nil
		}
	}

	return snap, nil
}
