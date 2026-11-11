package app

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/storage"
)

type NativeClipboardFiles struct {
	Paths []string `json:"paths"`
	Mode  string   `json:"mode"` // "copy" | "cut"
}

func (a *App) ListClipboardHistory() ([]storage.ClipboardHistoryItem, error) {
	if a.storage == nil {
		return []storage.ClipboardHistoryItem{}, nil
	}
	items, err := a.storage.ListClipboardHistory(storage.DefaultClipboardMaxUnpinned)
	if err != nil {
		return nil, err
	}
	if items == nil {
		return []storage.ClipboardHistoryItem{}, nil
	}
	return items, nil
}

func (a *App) AddClipboardHistoryItem(kind string, content string, preview string, width int, height int) ([]storage.ClipboardHistoryItem, error) {
	if a.storage == nil {
		return []storage.ClipboardHistoryItem{}, nil
	}
	if strings.TrimSpace(content) == "" {
		return a.ListClipboardHistory()
	}
	if _, err := a.storage.AddClipboardItem(kind, content, preview, width, height, storage.DefaultClipboardMaxUnpinned); err != nil {
		return nil, err
	}
	return a.ListClipboardHistory()
}

func (a *App) TogglePinClipboardItem(id int64) ([]storage.ClipboardHistoryItem, error) {
	if a.storage == nil {
		return []storage.ClipboardHistoryItem{}, nil
	}
	if err := a.storage.TogglePinClipboardItem(id, storage.DefaultClipboardMaxUnpinned); err != nil {
		return nil, err
	}
	return a.ListClipboardHistory()
}

func (a *App) DeleteClipboardItem(id int64) ([]storage.ClipboardHistoryItem, error) {
	if a.storage == nil {
		return []storage.ClipboardHistoryItem{}, nil
	}
	if err := a.storage.DeleteClipboardItem(id); err != nil {
		return nil, err
	}
	return a.ListClipboardHistory()
}

func (a *App) ClearUnpinnedClipboardHistory() ([]storage.ClipboardHistoryItem, error) {
	if a.storage == nil {
		return []storage.ClipboardHistoryItem{}, nil
	}
	if err := a.storage.ClearUnpinnedClipboardHistory(); err != nil {
		return nil, err
	}
	return a.ListClipboardHistory()
}

func (a *App) ReadNativeClipboardText() (string, error) {
	if a.ctx == nil {
		return "", nil
	}
	return runtime.ClipboardGetText(a.ctx)
}

func (a *App) WriteNativeClipboardText(text string) error {
	if a.ctx == nil {
		return nil
	}
	return runtime.ClipboardSetText(a.ctx, text)
}

func (a *App) SetNativeClipboardFiles(paths []string, cut bool) error {
	return platform.SetSystemClipboardFiles(paths, cut)
}

func (a *App) GetNativeClipboardFiles() (NativeClipboardFiles, error) {
	paths, isCut, err := platform.GetSystemClipboardFiles()
	if err != nil {
		return NativeClipboardFiles{Paths: []string{}, Mode: "copy"}, err
	}
	mode := "copy"
	if isCut {
		mode = "cut"
	}
	if paths == nil {
		paths = []string{}
	}
	return NativeClipboardFiles{
		Paths: paths,
		Mode:  mode,
	}, nil
}

func (a *App) SetNativeClipboardImage(dataUrl string) error {
	b64 := strings.TrimSpace(dataUrl)
	if idx := strings.Index(b64, ";base64,"); idx != -1 {
		b64 = b64[idx+8:]
	}
	rawBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
	if err != nil {
		return err
	}
	return platform.SetSystemClipboardImagePNG(rawBytes)
}

func (a *App) GetClipboardSequenceNumber() uint64 {
	return platform.GetClipboardSequence()
}

func (a *App) ReadSystemClipboardSnapshot() (*platform.SystemClipboardSnapshot, error) {
	snap, err := platform.ReadSystemClipboardSnapshot()
	if err != nil {
		return nil, err
	}
	if snap.Busy {
		return snap, nil
	}
	// No Windows, CF_UNICODETEXT já é lido diretamente sem precisar despachar na UI thread do WebView2.
	if goruntime.GOOS != "windows" && snap.Kind == "" && a.ctx != nil {
		if txt, errTxt := runtime.ClipboardGetText(a.ctx); errTxt == nil && strings.TrimSpace(txt) != "" {
			snap.Kind = "text"
			snap.Text = txt
		}
	}
	return snap, nil
}

func sanitizeClipboardFileName(name string) string {
	clean := strings.TrimSpace(name)
	replacer := strings.NewReplacer(
		"/", "-",
		"\\", "-",
		":", "-",
		"*", "",
		"?", "",
		"\"", "",
		"<", "",
		">", "",
		"|", "",
	)
	clean = replacer.Replace(clean)
	return strings.TrimSpace(clean)
}

func uniqueClipboardTargetPath(dir, baseName, ext string) string {
	candidate := filepath.Join(dir, baseName+ext)
	if _, err := os.Stat(candidate); os.IsNotExist(err) {
		return candidate
	}
	for i := 1; i < 1000; i++ {
		next := filepath.Join(dir, fmt.Sprintf("%s-%d%s", baseName, i, ext))
		if _, err := os.Stat(next); os.IsNotExist(err) {
			return next
		}
	}
	return filepath.Join(dir, fmt.Sprintf("%s-%d%s", baseName, time.Now().UnixNano(), ext))
}

func writeFileAtomic(dstPath string, data []byte) error {
	dir := filepath.Dir(dstPath)
	tmpFile, err := os.CreateTemp(dir, ".pulsares-clip-*")
	if err != nil {
		return err
	}
	tmpPath := tmpFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, dstPath); err != nil {
		return err
	}
	cleanup = false
	return nil
}

func (a *App) SaveClipboardItemToFolder(id int64, targetDir string, customName string) (string, error) {
	if a.storage == nil {
		return "", errors.New("storage indisponível")
	}
	item, err := a.storage.GetClipboardItem(id)
	if err != nil {
		return "", err
	}
	if item == nil {
		return "", errors.New("item do histórico não encontrado")
	}

	resolvedDir := platform.ExpandPath(strings.TrimSpace(targetDir))
	if resolvedDir == "" {
		resolvedDir = platform.GetHomeDir()
	}
	info, err := os.Stat(resolvedDir)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("diretório de destino inválido: %s", resolvedDir)
	}

	ts := time.Now().Format("20060102-150405")
	cleanCustom := sanitizeClipboardFileName(customName)

	switch item.Kind {
	case "image":
		b64 := item.Content
		if idx := strings.Index(b64, ";base64,"); idx != -1 {
			b64 = b64[idx+8:]
		}
		rawBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
		if err != nil {
			return "", fmt.Errorf("falha ao decodificar imagem: %w", err)
		}
		baseName := "clipboard-" + ts
		ext := ".png"
		if cleanCustom != "" {
			if filepath.Ext(cleanCustom) != "" {
				ext = filepath.Ext(cleanCustom)
				baseName = strings.TrimSuffix(cleanCustom, ext)
			} else {
				baseName = cleanCustom
			}
		}
		dstPath := uniqueClipboardTargetPath(resolvedDir, baseName, ext)
		if err := writeFileAtomic(dstPath, rawBytes); err != nil {
			return "", err
		}
		return dstPath, nil

	case "text":
		baseName := "snippet-" + ts
		ext := ".txt"
		if cleanCustom != "" {
			if filepath.Ext(cleanCustom) != "" {
				ext = filepath.Ext(cleanCustom)
				baseName = strings.TrimSuffix(cleanCustom, ext)
			} else {
				baseName = cleanCustom
			}
		}
		dstPath := uniqueClipboardTargetPath(resolvedDir, baseName, ext)
		if err := writeFileAtomic(dstPath, []byte(item.Content)); err != nil {
			return "", err
		}
		return dstPath, nil

	default:
		return "", fmt.Errorf("tipo de item não suporta salvamento direto como arquivo: %s", item.Kind)
	}
}
