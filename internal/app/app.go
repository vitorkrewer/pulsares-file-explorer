package app

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"pulsares-file-explorer/internal/listing"
	"pulsares-file-explorer/internal/ops"
	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/search"
	"pulsares-file-explorer/internal/storage"
	"pulsares-file-explorer/internal/terminal"
	"pulsares-file-explorer/internal/thumbs"
	"pulsares-file-explorer/internal/tree"
	"pulsares-file-explorer/internal/vfs"
	"pulsares-file-explorer/internal/vfs/local"
)

type App struct {
	ctx      context.Context
	fs       vfs.FileSystem
	listing  *listing.Manager
	tree     *tree.Service
	ops      *ops.Manager
	terminal *terminal.Service
	thumbs   *thumbs.Service
	search   *search.Service
	storage  *storage.DB
}

type InitialState struct {
	SystemLanguage string                 `json:"systemLanguage"`
	HomeDir        string                 `json:"homeDir"`
	Drives         []platform.DriveInfo   `json:"drives"`
	Favorites      []storage.FavoriteItem `json:"favorites"`
	Recent         []storage.RecentItem   `json:"recent"`
	Language       string                 `json:"language"`
	Theme          string                 `json:"theme"`
	SessionData    string                 `json:"sessionData,omitempty"`
}

func NewApp() *App {
	localFS := local.New()
	return &App{
		fs:       localFS,
		tree:     tree.NewService(localFS),
		terminal: terminal.New(nil),
		thumbs:   thumbs.New("", 64*1024*1024),
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	db, err := storage.Open()
	if err == nil {
		a.storage = db
	}

	emitter := func(eventName string, data interface{}) {
		runtime.EventsEmit(a.ctx, eventName, data)
	}

	a.listing = listing.NewManager(a.fs, emitter)
	a.ops = ops.NewManager(a.storage, emitter)
	a.search = search.New(a.storage, emitter)
	if a.terminal == nil {
		a.terminal = terminal.New(emitter)
	} else {
		a.terminal.SetEmitter(emitter)
	}
	if a.thumbs == nil {
		a.thumbs = thumbs.New("", 64*1024*1024)
	}
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
	var favorites []storage.FavoriteItem
	var recent []storage.RecentItem

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
		favorites, _ = a.storage.ListFavorites()
		recent, _ = a.storage.ListRecent(12)
	}

	return InitialState{
		SystemLanguage: sysLang,
		HomeDir:        home,
		Drives:         drives,
		Favorites:      favorites,
		Recent:         recent,
		Language:       lang,
		Theme:          theme,
		SessionData:    sessionData,
	}
}

func (a *App) ListDirectory(tabID string, requestID string, path string) {
	resolved := platform.ExpandPath(path)
	if a.storage != nil {
		_ = a.storage.RecordVisit(resolved)
	}
	loc := vfs.Location{
		Provider: "local",
		Path:     resolved,
	}
	a.listing.Start(tabID, requestID, loc, 500)
}

func (a *App) ListDirectorySnapshot(path string, showHidden bool) ([]vfs.Entry, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	resolved := platform.ExpandPath(path)
	loc := vfs.Location{
		Provider: "local",
		Path:     resolved,
	}
	batchCh, errCh := a.fs.ReadDir(ctx, loc, 500)
	var all []vfs.Entry
	for batch := range batchCh {
		for _, e := range batch {
			if !showHidden && e.Attrs.Hidden {
				continue
			}
			all = append(all, e)
		}
	}
	if err := <-errCh; err != nil {
		return all, err
	}
	return all, nil
}

func (a *App) GetThumbnail(path string, maxDim int) (string, error) {
	if a.thumbs == nil {
		a.thumbs = thumbs.New("", 64*1024*1024)
	}
	return a.thumbs.Thumbnail(path, maxDim)
}

func (a *App) GetPreview(path string, maxTextBytes int) (thumbs.PreviewData, error) {
	if a.thumbs == nil {
		a.thumbs = thumbs.New("", 64*1024*1024)
	}
	return a.thumbs.ReadPreview(path, maxTextBytes)
}

func (a *App) StartSearch(requestID string, opts search.Options) {
	if a.search == nil {
		a.search = search.New(a.storage, nil)
	}
	a.search.Start(requestID, opts)
}

func (a *App) CancelSearch(requestID string) {
	if a.search != nil {
		a.search.Cancel(requestID)
	}
}

func (a *App) IndexDirectory(rootPath string) (int, error) {
	if a.search == nil {
		a.search = search.New(a.storage, nil)
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.search.IndexDirectory(ctx, rootPath)
}

func (a *App) ListIndexRoots() []storage.IndexedRoot {
	if a.storage == nil {
		return nil
	}
	roots, _ := a.storage.ListIndexRoots()
	return roots
}

func (a *App) RemoveIndexRoot(rootPath string) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.RemoveIndexRoot(rootPath)
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

func (a *App) CreateFolder(parentDir, name string) (string, error) {
	if a.ops == nil {
		a.ops = ops.NewManager(a.storage, nil)
	}
	return a.ops.CreateFolder(parentDir, name)
}

func (a *App) CreateFile(parentDir, name string) (string, error) {
	if a.ops == nil {
		a.ops = ops.NewManager(a.storage, nil)
	}
	return a.ops.CreateFile(parentDir, name)
}

func (a *App) RenameItem(oldPath, newName string) (string, error) {
	if a.ops == nil {
		a.ops = ops.NewManager(a.storage, nil)
	}
	return a.ops.Rename(oldPath, newName)
}

func (a *App) EnqueueOperation(kind string, sources []string, destination string, policy string, verifyHash bool) string {
	if a.ops == nil {
		a.ops = ops.NewManager(a.storage, nil)
	}
	return a.ops.Enqueue(ops.JobKind(kind), sources, destination, ops.ConflictPolicy(policy), verifyHash)
}

func (a *App) PauseJob(jobID string) {
	if a.ops != nil {
		a.ops.PauseJob(jobID)
	}
}

func (a *App) ResumeJob(jobID string) {
	if a.ops != nil {
		a.ops.ResumeJob(jobID)
	}
}

func (a *App) CancelJob(jobID string) {
	if a.ops != nil {
		a.ops.CancelJob(jobID)
	}
}

func (a *App) ResolveJobConflict(jobID string, policy string, applyToAll bool) {
	if a.ops != nil {
		a.ops.ResolveConflict(jobID, ops.ConflictPolicy(policy), applyToAll)
	}
}

func (a *App) ListJobs() []ops.JobSnapshot {
	if a.ops == nil {
		return nil
	}
	return a.ops.ListJobs()
}

func (a *App) UndoOperation() (*storage.JournalEntry, error) {
	if a.ops == nil {
		return nil, nil
	}
	return a.ops.Undo()
}

func (a *App) RedoOperation() (*storage.JournalEntry, error) {
	if a.ops == nil {
		return nil, nil
	}
	return a.ops.Redo()
}

func (a *App) ListJournal() []storage.JournalEntry {
	if a.storage == nil {
		return nil
	}
	entries, _ := a.storage.ListJournal(20)
	return entries
}

func (a *App) ListFavorites() []storage.FavoriteItem {
	if a.storage == nil {
		return nil
	}
	favs, _ := a.storage.ListFavorites()
	return favs
}

func (a *App) AddFavorite(path, label string) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.AddFavorite(path, label)
}

func (a *App) RemoveFavorite(path string) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.RemoveFavorite(path)
}

func (a *App) ListRecent() []storage.RecentItem {
	if a.storage == nil {
		return nil
	}
	rec, _ := a.storage.ListRecent(12)
	return rec
}

func (a *App) TerminalProfiles() ([]terminal.Profile, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.terminal.Profiles(ctx)
}

func (a *App) TerminalStart(profileID string, cwd string, cols int, rows int) (string, error) {
	return a.terminal.Start(profileID, cwd, cols, rows)
}

func (a *App) TerminalWrite(sessionID string, data string) error {
	return a.terminal.Write(sessionID, []byte(data))
}

func (a *App) TerminalResize(sessionID string, cols int, rows int) error {
	return a.terminal.Resize(sessionID, cols, rows)
}

func (a *App) TerminalAck(sessionID string, byteCount int) error {
	return a.terminal.Ack(sessionID, byteCount)
}

func (a *App) TerminalKill(sessionID string) error {
	return a.terminal.Kill(sessionID)
}

func (a *App) TerminalHasRunningChildren(sessionID string) (bool, error) {
	return a.terminal.HasRunningChildren(sessionID)
}

func (a *App) TerminalChangeDir(sessionID string, path string) error {
	return a.terminal.ChangeDir(sessionID, path)
}

func (a *App) TerminalQuotePaths(sessionID string, paths []string) (string, error) {
	return a.terminal.QuotePathsForSession(sessionID, paths)
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
