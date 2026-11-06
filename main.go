package main

import (
	"embed"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"pulsares-file-explorer/internal/app"
)

//go:embed all:frontend/dist
var assets embed.FS

var version = "1.0.0"

// localMediaHandler serve arquivos locais de vídeo, áudio e PDF via HTTP Range Requests (206 Partial Content)
// sem carregar o arquivo inteiro em memória.
func localMediaHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/__localmedia") {
			http.NotFound(w, r)
			return
		}
		targetPath := strings.TrimSpace(r.URL.Query().Get("path"))
		if targetPath == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}
		cleanPath := filepath.Clean(targetPath)
		info, err := os.Stat(cleanPath)
		if err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		f, err := os.Open(cleanPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()

		w.Header().Set("Accept-Ranges", "bytes")
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, info.Name(), info.ModTime(), f)
	})
}

func main() {
	explorerApp := app.NewApp()
	title := "Pulsares Explorer"
	for _, arg := range os.Args[1:] {
		if arg == "--studio" {
			title = "Pulsares Studio Editor"
			break
		}
		if arg == "--dbstudio" {
			title = "Pulsares DB Studio"
			break
		}
	}

	err := wails.Run(&options.App{
		Title:     title,
		Frameless: true,
		Width:     1280,
		Height:    800,
		MinWidth:  900,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: localMediaHandler(),
		},
		BackgroundColour: &options.RGBA{R: 24, G: 24, B: 27, A: 1},
		OnStartup:        explorerApp.Startup,
		OnShutdown:       explorerApp.Shutdown,
		Bind: []interface{}{
			explorerApp,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
