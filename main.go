package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"pulsares-file-explorer/internal/app"
)

//go:embed all:frontend/dist
var assets embed.FS

var version = "0.6.0"

func main() {
	explorerApp := app.NewApp()

	err := wails.Run(&options.App{
		Title:     "Pulsares Explorer",
		Width:     1280,
		Height:    800,
		MinWidth:  900,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
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
