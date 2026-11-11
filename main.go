package main

import (
	"context"
	"embed"
	"net/http"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"pulsares-file-explorer/internal/app"
	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/thumbs"
)

//go:embed all:frontend/dist
var assets embed.FS

var version = "1.1.1"

// localMediaHandler serve arquivos locais de vídeo, áudio e PDF via HTTP Range Requests (206 Partial Content).
func localMediaHandler() http.Handler {
	return http.HandlerFunc(thumbs.ServeLocalMediaHTTP)
}

func main() {
	platform.EnsureInteractiveDesktop()

	explorerApp := app.NewApp()
	title := "Pulsares Explorer"
	appID := "Pulsares.Explorer"
	windowClass := "PulsaresExplorerWindow"
	iconType := "explorer"

	for _, arg := range os.Args[1:] {
		if arg == "--studio" {
			title = "Pulsares Studio Editor"
			appID = "Pulsares.StudioEditor"
			windowClass = "PulsaresStudioEditorWindow"
			iconType = "studio"
			break
		}
		if arg == "--dbstudio" {
			title = "Pulsares DB Studio"
			appID = "Pulsares.DBStudio"
			windowClass = "PulsaresDBStudioWindow"
			iconType = "dbstudio"
			break
		}
	}

	platform.SetWindowsAppID(appID)

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
		OnStartup: func(ctx context.Context) {
			platform.ApplyWindowIcon(windowClass, iconType)
			explorerApp.Startup(ctx)
			wailsRuntime.WindowShow(ctx)
		},
		OnDomReady: func(ctx context.Context) {
			wailsRuntime.WindowUnminimise(ctx)
			wailsRuntime.WindowShow(ctx)
		},
		OnShutdown: explorerApp.Shutdown,
		Windows: &windows.Options{
			WindowClassName: windowClass,
		},
		Bind: []interface{}{
			explorerApp,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

