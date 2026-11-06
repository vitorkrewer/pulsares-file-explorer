package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	_ "modernc.org/sqlite"
	"pulsares-file-explorer/internal/listing"
	"pulsares-file-explorer/internal/ops"
	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/productivity"
	"pulsares-file-explorer/internal/search"
	"pulsares-file-explorer/internal/storage"
	"pulsares-file-explorer/internal/terminal"
	"pulsares-file-explorer/internal/thumbs"
	"pulsares-file-explorer/internal/tree"
	"pulsares-file-explorer/internal/vfs"
	"pulsares-file-explorer/internal/vfs/archive"
	"pulsares-file-explorer/internal/vfs/local"
	"pulsares-file-explorer/internal/watch"
)

type App struct {
	ctx         context.Context
	fs          vfs.FileSystem
	listing     *listing.Manager
	tree        *tree.Service
	ops         *ops.Manager
	terminal    *terminal.Service
	thumbs      *thumbs.Service
	search      *search.Service
	watch       *watch.Service
	storage     *storage.DB
	studioMu    sync.Mutex
	studioCmd   *exec.Cmd
	dbStudioCmd *exec.Cmd
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
	StudioMode     bool                   `json:"studioMode,omitempty"`
	StudioTarget   string                 `json:"studioTarget,omitempty"`
	DBStudioMode   bool                   `json:"dbStudioMode,omitempty"`
	DBStudioTarget string                 `json:"dbStudioTarget,omitempty"`
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
	a.watch = watch.New(0, 0, emitter)
	if a.terminal == nil {
		a.terminal = terminal.New(emitter)
	} else {
		a.terminal.SetEmitter(emitter)
	}
	if a.thumbs == nil {
		a.thumbs = thumbs.New("", 64*1024*1024)
	}

	for _, arg := range os.Args[1:] {
		if arg == "--studio" {
			go a.watchStudioIPC(ctx)
			break
		}
		if arg == "--dbstudio" {
			go a.watchDBStudioIPC(ctx)
			break
		}
	}
}

func (a *App) Shutdown(ctx context.Context) {
	if a.watch != nil {
		a.watch.Close()
	}
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

	studioMode := false
	studioTarget := ""
	dbStudioMode := false
	dbStudioTarget := ""
	for i := 1; i < len(os.Args); i++ {
		if os.Args[i] == "--studio" {
			studioMode = true
			if i+1 < len(os.Args) {
				studioTarget = os.Args[i+1]
			}
			break
		}
		if os.Args[i] == "--dbstudio" {
			dbStudioMode = true
			if i+1 < len(os.Args) {
				dbStudioTarget = os.Args[i+1]
			}
			break
		}
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
		StudioMode:     studioMode,
		StudioTarget:   studioTarget,
		DBStudioMode:   dbStudioMode,
		DBStudioTarget: dbStudioTarget,
	}
}

func (a *App) ListDirectory(tabID string, requestID string, path string) {
	resolved := platform.ExpandPath(path)
	if a.storage != nil {
		_ = a.storage.RecordVisit(resolved)
	}
	if a.watch != nil {
		a.watch.Watch(resolved)
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

func (a *App) TerminalAutocomplete(sessionID string, cwdFallback string, line string) ([]string, error) {
	return a.terminal.Autocomplete(sessionID, cwdFallback, line)
}

type TextFilePayload struct {
	Path       string `json:"path"`
	Name       string `json:"name"`
	Content    string `json:"content"`
	LineEnding string `json:"lineEnding"`
	Encoding   string `json:"encoding"`
	Size       int64  `json:"size"`
}

func (a *App) ReadTextFile(path string) (TextFilePayload, error) {
	clean := filepath.Clean(path)
	data, err := os.ReadFile(clean)
	if err != nil {
		return TextFilePayload{}, err
	}
	content := string(data)
	lineEnding := "LF"
	if strings.Contains(content, "\r\n") {
		lineEnding = "CRLF"
	}
	return TextFilePayload{
		Path:       clean,
		Name:       filepath.Base(clean),
		Content:    content,
		LineEnding: lineEnding,
		Encoding:   "UTF-8",
		Size:       int64(len(data)),
	}, nil
}

func (a *App) WriteTextFile(path string, content string) error {
	clean := filepath.Clean(path)
	mode := os.FileMode(0o644)
	if info, err := os.Stat(clean); err == nil {
		mode = info.Mode().Perm()
	}
	return os.WriteFile(clean, []byte(content), mode)
}

type StudioRunResult struct {
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	ExitCode   int    `json:"exitCode"`
	DurationMs int64  `json:"durationMs"`
}

func (a *App) RunStudioCommand(cwd string, command string) (StudioRunResult, error) {
	trimmed := strings.TrimSpace(command)
	if trimmed == "" {
		return StudioRunResult{}, errors.New("empty command")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if goruntime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", trimmed)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", trimmed)
	}
	if strings.TrimSpace(cwd) != "" {
		if info, err := os.Stat(cwd); err == nil && info.IsDir() {
			cmd.Dir = cwd
		}
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start).Milliseconds()

	exitCode := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	return StudioRunResult{
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		ExitCode:   exitCode,
		DurationMs: duration,
	}, nil
}

type studioIPCMessage struct {
	TargetPath   string `json:"targetPath"`
	WorkspaceDir string `json:"workspaceDir"`
	Timestamp    int64  `json:"timestamp"`
}

func studioIPCFilePath() string {
	return filepath.Join(os.TempDir(), "pulsares_studio_ipc.json")
}

func (a *App) watchStudioIPC(ctx context.Context) {
	ipcFile := studioIPCFilePath()
	var lastTS int64
	if raw, err := os.ReadFile(ipcFile); err == nil {
		var msg studioIPCMessage
		if json.Unmarshal(raw, &msg) == nil {
			lastTS = msg.Timestamp
		}
	}

	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			raw, err := os.ReadFile(ipcFile)
			if err != nil {
				continue
			}
			var msg studioIPCMessage
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
			if msg.Timestamp > lastTS {
				lastTS = msg.Timestamp
				runtime.WindowUnminimise(a.ctx)
				runtime.WindowShow(a.ctx)
				runtime.EventsEmit(a.ctx, "studio:open-file", msg)
			}
		}
	}
}

func (a *App) OpenStudioWindow(targetPath string) error {
	cleanTarget := strings.TrimSpace(targetPath)
	workspaceDir := ""
	if cleanTarget != "" {
		cleanTarget = filepath.Clean(cleanTarget)
		if info, err := os.Stat(cleanTarget); err == nil && info.IsDir() {
			workspaceDir = cleanTarget
			cleanTarget = ""
		} else {
			workspaceDir = filepath.Dir(cleanTarget)
		}
	}

	msg := studioIPCMessage{
		TargetPath:   cleanTarget,
		WorkspaceDir: workspaceDir,
		Timestamp:    time.Now().UnixNano(),
	}
	if payload, err := json.Marshal(msg); err == nil {
		_ = os.WriteFile(studioIPCFilePath(), payload, 0o600)
	}

	a.studioMu.Lock()
	defer a.studioMu.Unlock()

	if a.studioCmd != nil && a.studioCmd.Process != nil {
		return nil
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	args := []string{"--studio"}
	if cleanTarget != "" {
		args = append(args, cleanTarget)
	}
	cmd := exec.Command(exe, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	a.studioCmd = cmd
	go func(c *exec.Cmd) {
		_ = c.Wait()
		a.studioMu.Lock()
		if a.studioCmd == c {
			a.studioCmd = nil
		}
		a.studioMu.Unlock()
	}(cmd)
	return nil
}

func (a *App) WindowMinimize() {
	if a.ctx != nil {
		runtime.WindowMinimise(a.ctx)
	}
}

func (a *App) WindowToggleMaximize() {
	if a.ctx != nil {
		runtime.WindowToggleMaximise(a.ctx)
	}
}

func (a *App) WindowClose() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
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

func (a *App) SetWatchedPaths(paths []string) {
	if a.watch != nil {
		a.watch.SetWatchedPaths(paths)
	}
}

func (a *App) GetItemProperties(path string) (platform.ItemProperties, error) {
	return platform.GetItemProperties(path)
}

func (a *App) OpenWithDialog(path string) error {
	return platform.OpenWithDialog(path)
}

func (a *App) OpenExternalTerminal(dirPath string) error {
	return platform.OpenExternalTerminal(dirPath)
}

func (a *App) RevealInSystemExplorer(path string) error {
	return platform.RevealInSystemExplorer(path)
}

func (a *App) EjectDrive(drivePath string) error {
	return platform.EjectDrive(drivePath)
}

func (a *App) PreviewBatchRename(paths []string, opts productivity.BatchRenameOptions) ([]productivity.BatchRenamePreviewItem, error) {
	return productivity.PreviewBatchRename(paths, opts)
}

func (a *App) ExecuteBatchRename(paths []string, opts productivity.BatchRenameOptions) (int, error) {
	return productivity.ExecuteBatchRename(a.storage, paths, opts)
}

func (a *App) CompareDirectories(leftDir, rightDir string) ([]productivity.FolderDiffItem, error) {
	return productivity.CompareDirectories(leftDir, rightDir)
}

func (a *App) ComputeHashes(filePath string) (productivity.FileHashes, error) {
	return productivity.ComputeHashes(filePath)
}

func (a *App) SetItemTag(path, tagName, color string) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.SetItemTag(path, tagName, color)
}

func (a *App) RemoveItemTag(path string) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.RemoveItemTag(path)
}

func (a *App) ListItemTags() []storage.ItemTag {
	if a.storage == nil {
		return nil
	}
	tags, _ := a.storage.ListItemTags()
	return tags
}

func (a *App) SaveSearch(name, queryJSON string) (int64, error) {
	if a.storage == nil {
		return 0, nil
	}
	return a.storage.SaveSearch(name, queryJSON)
}

func (a *App) ListSavedSearches() []storage.SavedSearch {
	if a.storage == nil {
		return nil
	}
	items, _ := a.storage.ListSavedSearches()
	return items
}

func (a *App) DeleteSavedSearch(id int64) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.DeleteSavedSearch(id)
}

func (a *App) ListArchive(archivePath string) ([]archive.ArchiveEntry, error) {
	return archive.ListArchive(archivePath)
}

func (a *App) CreateArchive(sources []string, destArchivePath string) error {
	return archive.CreateArchive(sources, destArchivePath)
}

func (a *App) ExtractArchive(archivePath string, destDir string) (int, error) {
	return archive.ExtractArchive(archivePath, destDir)
}

func (a *App) SaveRemoteProfile(profile storage.RemoteProfile) (int64, error) {
	if a.storage == nil {
		return 0, nil
	}
	return a.storage.SaveRemoteProfile(profile)
}

func (a *App) ListRemoteProfiles() []storage.RemoteProfile {
	if a.storage == nil {
		return nil
	}
	items, _ := a.storage.ListRemoteProfiles()
	return items
}

func (a *App) DeleteRemoteProfile(id int64) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.DeleteRemoteProfile(id)
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

// ============================================================================
// Pulsares DB Studio (Visualizador de Bancos SQLite e Executor de Consultas SQL)
// ============================================================================

type DBColumnInfo struct {
	CID          int    `json:"cid"`
	Name         string `json:"name"`
	Type         string `json:"type"`
	NotNull      bool   `json:"notNull"`
	DefaultValue string `json:"defaultValue"`
	PK           bool   `json:"pk"`
}

type DBObjectInfo struct {
	Name     string         `json:"name"`
	Type     string         `json:"type"` // "table" | "view" | "index" | "trigger"
	RowCount int64          `json:"rowCount"`
	SQL      string         `json:"sql"`
	Columns  []DBColumnInfo `json:"columns"`
}

type DBSchemaInfo struct {
	Path          string         `json:"path"`
	Name          string         `json:"name"`
	Size          int64          `json:"size"`
	SQLiteVersion string         `json:"sqliteVersion"`
	Tables        []DBObjectInfo `json:"tables"`
	Views         []DBObjectInfo `json:"views"`
	Indexes       []DBObjectInfo `json:"indexes"`
}

type DBQueryResult struct {
	Columns      []string   `json:"columns"`
	Rows         [][]string `json:"rows"`
	TotalCount   int64      `json:"totalCount"`
	RowsAffected int64      `json:"rowsAffected"`
	DurationMs   int64      `json:"durationMs"`
	IsSelect     bool       `json:"isSelect"`
	Message      string     `json:"message"`
}

func openUserSQLite(dbPath string) (*sql.DB, string, error) {
	clean := filepath.Clean(strings.TrimSpace(dbPath))
	if clean == "" {
		return nil, "", errors.New("caminho do banco de dados vazio")
	}
	info, err := os.Stat(clean)
	if err != nil {
		return nil, "", err
	}
	if info.IsDir() {
		return nil, "", errors.New("o caminho informado é uma pasta, não um arquivo de banco")
	}
	db, err := sql.Open("sqlite", clean)
	if err != nil {
		return nil, "", err
	}
	return db, clean, nil
}

func quoteSQLIdent(ident string) string {
	return `"` + strings.ReplaceAll(ident, `"`, `""`) + `"`
}

func fetchTableColumns(db *sql.DB, tableName string) []DBColumnInfo {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", quoteSQLIdent(tableName)))
	if err != nil {
		return nil
	}
	defer rows.Close()

	var cols []DBColumnInfo
	for rows.Next() {
		var cid, notnull, pk int
		var name, ctype string
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err == nil {
			cols = append(cols, DBColumnInfo{
				CID:          cid,
				Name:         name,
				Type:         ctype,
				NotNull:      notnull != 0,
				DefaultValue: dflt.String,
				PK:           pk != 0,
			})
		}
	}
	return cols
}

func (a *App) DBInspectSchema(dbPath string) (DBSchemaInfo, error) {
	db, clean, err := openUserSQLite(dbPath)
	if err != nil {
		return DBSchemaInfo{}, err
	}
	defer db.Close()

	info, _ := os.Stat(clean)
	var size int64
	if info != nil {
		size = info.Size()
	}

	var sqliteVer string
	_ = db.QueryRow("SELECT sqlite_version()").Scan(&sqliteVer)

	masterRows, err := db.Query(`
		SELECT type, name, COALESCE(sql, '')
		FROM sqlite_master
		WHERE name NOT LIKE 'sqlite_%'
		ORDER BY type, name
	`)
	if err != nil {
		return DBSchemaInfo{}, err
	}
	defer masterRows.Close()

	type rawMaster struct {
		objType string
		name    string
		sqlDef  string
	}
	var rawList []rawMaster
	for masterRows.Next() {
		var m rawMaster
		if err := masterRows.Scan(&m.objType, &m.name, &m.sqlDef); err == nil {
			rawList = append(rawList, m)
		}
	}
	_ = masterRows.Close()

	schema := DBSchemaInfo{
		Path:          clean,
		Name:          filepath.Base(clean),
		Size:          size,
		SQLiteVersion: sqliteVer,
		Tables:        []DBObjectInfo{},
		Views:         []DBObjectInfo{},
		Indexes:       []DBObjectInfo{},
	}

	for _, item := range rawList {
		obj := DBObjectInfo{
			Name: item.name,
			Type: item.objType,
			SQL:  item.sqlDef,
		}
		if item.objType == "table" || item.objType == "view" {
			obj.Columns = fetchTableColumns(db, item.name)
			var cnt int64
			if err := db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", quoteSQLIdent(item.name))).Scan(&cnt); err == nil {
				obj.RowCount = cnt
			}
			if item.objType == "table" {
				schema.Tables = append(schema.Tables, obj)
			} else {
				schema.Views = append(schema.Views, obj)
			}
		} else if item.objType == "index" {
			schema.Indexes = append(schema.Indexes, obj)
		}
	}

	return schema, nil
}

func scanRowsToStrings(rows *sql.Rows, maxRows int) ([]string, [][]string, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, nil, err
	}
	if maxRows <= 0 {
		maxRows = 500
	}

	outRows := [][]string{}
	rawVals := make([]interface{}, len(cols))
	scanPtrs := make([]interface{}, len(cols))
	for i := range rawVals {
		scanPtrs[i] = &rawVals[i]
	}

	for rows.Next() {
		if len(outRows) >= maxRows {
			break
		}
		if err := rows.Scan(scanPtrs...); err != nil {
			return cols, outRows, err
		}
		rowStr := make([]string, len(cols))
		for i, v := range rawVals {
			switch val := v.(type) {
			case nil:
				rowStr[i] = "NULL"
			case []byte:
				rowStr[i] = string(val)
			default:
				rowStr[i] = fmt.Sprintf("%v", val)
			}
		}
		outRows = append(outRows, rowStr)
	}
	return cols, outRows, nil
}

func (a *App) DBQueryTable(dbPath string, tableName string, limit int, offset int, filterText string, sortCol string, sortDir string) (DBQueryResult, error) {
	start := time.Now()
	db, _, err := openUserSQLite(dbPath)
	if err != nil {
		return DBQueryResult{}, err
	}
	defer db.Close()

	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	colsMeta := fetchTableColumns(db, tableName)
	quotedTable := quoteSQLIdent(tableName)

	whereClause := ""
	var args []interface{}
	trimmedFilter := strings.TrimSpace(filterText)
	if trimmedFilter != "" && len(colsMeta) > 0 {
		var parts []string
		for _, c := range colsMeta {
			parts = append(parts, fmt.Sprintf("CAST(%s AS TEXT) LIKE ?", quoteSQLIdent(c.Name)))
			args = append(args, "%"+trimmedFilter+"%")
		}
		whereClause = " WHERE " + strings.Join(parts, " OR ")
	}

	var totalCount int64
	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s%s", quotedTable, whereClause)
	_ = db.QueryRow(countSQL, args...).Scan(&totalCount)

	orderClause := ""
	cleanSortCol := strings.TrimSpace(sortCol)
	if cleanSortCol != "" {
		dir := "ASC"
		if strings.EqualFold(sortDir, "desc") {
			dir = "DESC"
		}
		orderClause = fmt.Sprintf(" ORDER BY %s %s", quoteSQLIdent(cleanSortCol), dir)
	}

	querySQL := fmt.Sprintf("SELECT * FROM %s%s%s LIMIT %d OFFSET %d", quotedTable, whereClause, orderClause, limit, offset)
	rows, err := db.Query(querySQL, args...)
	if err != nil {
		return DBQueryResult{}, err
	}
	defer rows.Close()

	cols, dataRows, err := scanRowsToStrings(rows, limit)
	if err != nil {
		return DBQueryResult{}, err
	}

	return DBQueryResult{
		Columns:    cols,
		Rows:       dataRows,
		TotalCount: totalCount,
		DurationMs: time.Since(start).Milliseconds(),
		IsSelect:   true,
		Message:    fmt.Sprintf("%d registro(s) carregado(s) de %d", len(dataRows), totalCount),
	}, nil
}

func (a *App) DBExecuteSQL(dbPath string, query string) (DBQueryResult, error) {
	start := time.Now()
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return DBQueryResult{}, errors.New("consulta SQL vazia")
	}

	db, _, err := openUserSQLite(dbPath)
	if err != nil {
		return DBQueryResult{}, err
	}
	defer db.Close()

	upper := strings.ToUpper(trimmed)
	isQuery := strings.HasPrefix(upper, "SELECT") ||
		strings.HasPrefix(upper, "PRAGMA") ||
		strings.HasPrefix(upper, "WITH") ||
		strings.HasPrefix(upper, "EXPLAIN")

	if isQuery {
		rows, err := db.Query(trimmed)
		if err != nil {
			return DBQueryResult{}, err
		}
		defer rows.Close()

		cols, dataRows, err := scanRowsToStrings(rows, 500)
		if err != nil {
			return DBQueryResult{}, err
		}
		return DBQueryResult{
			Columns:    cols,
			Rows:       dataRows,
			TotalCount: int64(len(dataRows)),
			DurationMs: time.Since(start).Milliseconds(),
			IsSelect:   true,
			Message:    fmt.Sprintf("%d linha(s) retornada(s) em %d ms", len(dataRows), time.Since(start).Milliseconds()),
		}, nil
	}

	res, err := db.Exec(trimmed)
	if err != nil {
		return DBQueryResult{}, err
	}
	affected, _ := res.RowsAffected()
	dur := time.Since(start).Milliseconds()
	return DBQueryResult{
		Columns:      []string{"Resultado", "Linhas Afetadas", "Tempo (ms)"},
		Rows:         [][]string{{"Comando executado com sucesso", fmt.Sprintf("%d", affected), fmt.Sprintf("%d", dur)}},
		TotalCount:   1,
		RowsAffected: affected,
		DurationMs:   dur,
		IsSelect:     false,
		Message:      fmt.Sprintf("Comando executado com sucesso (%d linha(s) afetada(s) em %d ms)", affected, dur),
	}, nil
}

func dbStudioIPCFilePath() string {
	return filepath.Join(os.TempDir(), "pulsares_dbstudio_ipc.json")
}

func (a *App) watchDBStudioIPC(ctx context.Context) {
	ipcFile := dbStudioIPCFilePath()
	var lastTS int64
	if raw, err := os.ReadFile(ipcFile); err == nil {
		var msg studioIPCMessage
		if json.Unmarshal(raw, &msg) == nil {
			lastTS = msg.Timestamp
		}
	}

	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			raw, err := os.ReadFile(ipcFile)
			if err != nil {
				continue
			}
			var msg studioIPCMessage
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
			if msg.Timestamp > lastTS {
				lastTS = msg.Timestamp
				runtime.WindowUnminimise(a.ctx)
				runtime.WindowShow(a.ctx)
				runtime.EventsEmit(a.ctx, "dbstudio:open-file", msg)
			}
		}
	}
}

func (a *App) OpenDBStudioWindow(targetPath string) error {
	cleanTarget := strings.TrimSpace(targetPath)
	workspaceDir := ""
	if cleanTarget != "" {
		cleanTarget = filepath.Clean(cleanTarget)
		workspaceDir = filepath.Dir(cleanTarget)
	}

	msg := studioIPCMessage{
		TargetPath:   cleanTarget,
		WorkspaceDir: workspaceDir,
		Timestamp:    time.Now().UnixNano(),
	}
	if payload, err := json.Marshal(msg); err == nil {
		_ = os.WriteFile(dbStudioIPCFilePath(), payload, 0o600)
	}

	a.studioMu.Lock()
	defer a.studioMu.Unlock()

	if a.dbStudioCmd != nil && a.dbStudioCmd.Process != nil {
		return nil
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	args := []string{"--dbstudio"}
	if cleanTarget != "" {
		args = append(args, cleanTarget)
	}
	cmd := exec.Command(exe, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	a.dbStudioCmd = cmd
	go func(c *exec.Cmd) {
		_ = c.Wait()
		a.studioMu.Lock()
		if a.dbStudioCmd == c {
			a.dbStudioCmd = nil
		}
		a.studioMu.Unlock()
	}(cmd)
	return nil
}
