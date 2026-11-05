package app

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"pulsares-file-explorer/internal/listing"
	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/storage"
	"pulsares-file-explorer/internal/tree"
	"pulsares-file-explorer/internal/vfs"
	"pulsares-file-explorer/internal/vfs/local"
)

type App struct {
	ctx     context.Context
	fs      vfs.FileSystem
	listing *listing.Manager
	tree    *tree.Service
	storage *storage.DB
}

type InitialState struct {
	SystemLanguage string               `json:"systemLanguage"`
	HomeDir        string               `json:"homeDir"`
	Drives         []platform.DriveInfo `json:"drives"`
	Language       string               `json:"language"`
	Theme          string               `json:"theme"`
	SessionData    string               `json:"sessionData,omitempty"`
}

func NewApp() *App {
	localFS := local.New()
	return &App{
		fs:   localFS,
		tree: tree.NewService(localFS),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	db, err := storage.Open()
	if err == nil {
		a.storage = db
	}

	a.listing = listing.NewManager(a.fs, func(eventName string, data interface{}) {
		runtime.EventsEmit(a.ctx, eventName, data)
	})
}

func (a *App) Shutdown(ctx context.Context) {
	if a.storage != nil {
		a.storage.Close()
	}
}

func (a *App) GetInitialState() InitialState {
	home := platform.GetHomeDir()
	drives := platform.GetDrives()
	sysLang := platform.GetSystemLanguage()

	lang := "auto"
	theme := "system"
	sessionData := ""
	if a.storage != nil {
		if l, _ := a.storage.GetSetting("language"); l != "" {
			lang = l
		}
		if t, _ := a.storage.GetSetting("theme"); t != "" {
			theme = t
		}
		if s, _ := a.storage.LoadSession(); s != "" {
			sessionData = s
		}
	}

	return InitialState{
		SystemLanguage: sysLang,
		HomeDir:        home,
		Drives:         drives,
		Language:       lang,
		Theme:          theme,
		SessionData:    sessionData,
	}
}

func (a *App) ListDirectory(tabID string, requestID string, path string) {
	resolved := platform.ExpandPath(path)
	loc := vfs.Location{
		Provider: "local",
		Path:     resolved,
	}
	a.listing.Start(tabID, requestID, loc, 500)
}

func (a *App) ExpandPath(path string) string {
	return platform.ExpandPath(path)
}

func (a *App) AutocompletePath(partial string, showHidden bool) []string {
	return platform.AutocompleteDirs(partial, showHidden, 12)
}

func (a *App) CancelListing(tabID string) {
	a.listing.Cancel(tabID)
}

func (a *App) TreeRoots() ([]tree.Node, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.tree.Roots(ctx)
}

func (a *App) TreeChildren(path string, showHidden bool) ([]tree.Node, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	loc := vfs.Location{
		Provider: "local",
		Path:     path,
	}
	return a.tree.Children(ctx, loc, showHidden)
}

func (a *App) SaveSession(data string) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.SaveSession(data)
}

func (a *App) LoadSession() string {
	if a.storage == nil {
		return ""
	}
	data, _ := a.storage.LoadSession()
	return data
}

func (a *App) OpenPath(path string) error {
	return platform.OpenPath(path)
}

func (a *App) GetDrives() []platform.DriveInfo {
	return platform.GetDrives()
}

func (a *App) GetSetting(key string) string {
	if a.storage == nil {
		return ""
	}
	val, _ := a.storage.GetSetting(key)
	return val
}

func (a *App) SetSetting(key, val string) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.SetSetting(key, val)
}
