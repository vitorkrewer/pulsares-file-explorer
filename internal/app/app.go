package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	_ "modernc.org/sqlite"
	"pulsares-file-explorer/internal/dbcreator"
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
	"pulsares-file-explorer/internal/vfs/sftp"
	"pulsares-file-explorer/internal/watch"
)

type App struct {
	ctx         context.Context
	fs          vfs.FileSystem
	sftp        *sftp.Manager
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
	Favorites          []storage.FavoriteItem      `json:"favorites"`
	Recent             []storage.RecentItem        `json:"recent"`
	SavedNetworkDrives []storage.SavedNetworkDrive `json:"savedNetworkDrives,omitempty"`
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
	sftpMgr := sftp.NewManager(nil)
	compFS := sftp.NewCompositeFS(localFS, sftpMgr)
	return &App{
		fs:       compFS,
		sftp:     sftpMgr,
		tree:     tree.NewService(compFS),
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

	a.sftp = sftp.NewManager(a.storage)
	a.fs = sftp.NewCompositeFS(local.New(), a.sftp)
	a.tree = tree.NewService(a.fs)
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
	if a.sftp != nil {
		a.sftp.CloseAll()
	}
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
	var savedNetDrives []storage.SavedNetworkDrive

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
		savedNetDrives, _ = a.storage.ListSavedNetworkDrives()
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

	if studioMode && studioTarget == "" {
		if raw, err := os.ReadFile(studioIPCFilePath()); err == nil {
			var msg studioIPCMessage
			if json.Unmarshal(raw, &msg) == nil {
				if msg.TargetPath != "" {
					studioTarget = msg.TargetPath
				} else if msg.WorkspaceDir != "" {
					studioTarget = msg.WorkspaceDir
				}
			}
		}
	}

	return InitialState{
		SystemLanguage: sysLang,
		HomeDir:        home,
		Drives:         drives,
		Favorites:          favorites,
		Recent:             recent,
		SavedNetworkDrives: savedNetDrives,
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
	if id, remote, ok := sftp.ParseSFTPPath(path); ok {
		canonical := sftp.FormatSFTPPath(id, remote)
		if a.storage != nil {
			_ = a.storage.RecordVisit(canonical)
		}
		loc := vfs.Location{
			Provider: "sftp",
			Root:     fmt.Sprintf("sftp://%d", id),
			Path:     canonical,
		}
		a.listing.Start(tabID, requestID, loc, 200)
		return
	}

	resolved := platform.ExpandPath(path)
	if a.storage != nil {
		_ = a.storage.RecordVisit(resolved)
	}
	if a.watch != nil {
		if _, isNetRoot := platform.IsNetworkServerRoot(resolved); !isNetRoot {
			a.watch.Watch(resolved)
		}
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
	var loc vfs.Location
	if id, remote, ok := sftp.ParseSFTPPath(path); ok {
		loc = vfs.Location{
			Provider: "sftp",
			Root:     fmt.Sprintf("sftp://%d", id),
			Path:     sftp.FormatSFTPPath(id, remote),
		}
	} else {
		resolved := platform.ExpandPath(path)
		loc = vfs.Location{
			Provider: "local",
			Path:     resolved,
		}
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
	if _, _, ok := sftp.ParseSFTPPath(path); ok {
		return "", errors.New("remote sftp thumbnail disabled for bandwidth safety")
	}
	if a.thumbs == nil {
		a.thumbs = thumbs.New("", 64*1024*1024)
	}
	return a.thumbs.Thumbnail(path, maxDim)
}

func (a *App) GetPreview(path string, maxTextBytes int) (thumbs.PreviewData, error) {
	if id, remote, ok := sftp.ParseSFTPPath(path); ok && a.sftp != nil {
		ctx := a.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		entry, err := a.sftp.Stat(ctx, id, remote)
		if err != nil {
			return thumbs.PreviewData{}, err
		}
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(entry.Name), "."))
		pd := thumbs.PreviewData{
			Path:      path,
			Name:      entry.Name,
			Extension: ext,
			Size:      entry.Size,
			ModTime:   entry.ModTime.Format(time.RFC3339),
		}
		if entry.Kind == vfs.KindDir {
			pd.Kind = thumbs.PreviewFolder
			pd.MimeType = "inode/directory"
			return pd, nil
		}
		limit := int64(maxTextBytes)
		if limit <= 0 {
			limit = 64 * 1024
		}
		raw, err := a.sftp.ReadBytes(ctx, id, remote, limit)
		if err != nil {
			return pd, err
		}
		pd.Kind = thumbs.PreviewText
		if ext == "md" || ext == "markdown" {
			pd.Kind = thumbs.PreviewMarkdown
		}
		pd.MimeType = "text/plain"
		pd.TextContent = string(raw)
		pd.Truncated = entry.Size > limit
		pd.LineCount = strings.Count(pd.TextContent, "\n") + 1
		return pd, nil
	}
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
	if id, remote, ok := sftp.ParseSFTPPath(path); ok {
		return sftp.FormatSFTPPath(id, remote)
	}
	return platform.ExpandPath(path)
}

func (a *App) AutocompletePath(partial string, showHidden bool) []string {
	if _, _, ok := sftp.ParseSFTPPath(partial); ok {
		return nil
	}
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
	roots, err := a.tree.Roots(ctx)
	if err != nil {
		return nil, err
	}
	if a.storage != nil && a.sftp != nil {
		activeIDs := a.sftp.ActiveProfileIDs()
		for _, id := range activeIDs {
			if prof, err := a.storage.GetRemoteProfile(id); err == nil && prof != nil {
				uri := sftp.FormatSFTPPath(prof.ID, prof.RemotePath)
				roots = append(roots, tree.Node{
					Name: fmt.Sprintf("SSH: %s (%s)", prof.Name, prof.Host),
					Location: vfs.Location{
						Provider: "sftp",
						Root:     fmt.Sprintf("sftp://%d", prof.ID),
						Path:     uri,
					},
					HasChildren: tree.TriYes,
				})
			}
		}
	}
	return roots, nil
}

func (a *App) TreeChildren(path string, showHidden bool) ([]tree.Node, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	var loc vfs.Location
	if id, remote, ok := sftp.ParseSFTPPath(path); ok {
		loc = vfs.Location{
			Provider: "sftp",
			Root:     fmt.Sprintf("sftp://%d", id),
			Path:     sftp.FormatSFTPPath(id, remote),
		}
	} else {
		loc = vfs.Location{
			Provider: "local",
			Path:     path,
		}
	}
	return a.tree.Children(ctx, loc, showHidden)
}

func (a *App) CreateFolder(parentDir, name string) (string, error) {
	if id, remote, ok := sftp.ParseSFTPPath(parentDir); ok && a.sftp != nil {
		ctx := a.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		return a.sftp.CreateFolder(ctx, id, remote, name)
	}
	if a.ops == nil {
		a.ops = ops.NewManager(a.storage, nil)
	}
	return a.ops.CreateFolder(parentDir, name)
}

func (a *App) CreateFile(parentDir, name string) (string, error) {
	if id, remote, ok := sftp.ParseSFTPPath(parentDir); ok && a.sftp != nil {
		ctx := a.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		return a.sftp.CreateFile(ctx, id, remote, name)
	}
	if a.ops == nil {
		a.ops = ops.NewManager(a.storage, nil)
	}
	return a.ops.CreateFile(parentDir, name)
}

func (a *App) RenameItem(oldPath, newName string) (string, error) {
	if id, remote, ok := sftp.ParseSFTPPath(oldPath); ok && a.sftp != nil {
		ctx := a.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		return a.sftp.Rename(ctx, id, remote, newName)
	}
	if a.ops == nil {
		a.ops = ops.NewManager(a.storage, nil)
	}
	return a.ops.Rename(oldPath, newName)
}

func (a *App) EnqueueOperation(kind string, sources []string, destination string, policy string, verifyHash bool) string {
	if a.sftp != nil && a.hasSFTPOperation(sources, destination) {
		return a.runSFTPOperationAsync(kind, sources, destination)
	}
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
	if id, remote, ok := sftp.ParseSFTPPath(path); ok && a.sftp != nil {
		ctx := a.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		data, err := a.sftp.ReadBytes(ctx, id, remote, 16*1024*1024)
		if err != nil {
			return TextFilePayload{}, err
		}
		content := string(data)
		lineEnding := "LF"
		if strings.Contains(content, "\r\n") {
			lineEnding = "CRLF"
		}
		return TextFilePayload{
			Path:       sftp.FormatSFTPPath(id, remote),
			Name:       filepath.Base(remote),
			Content:    content,
			LineEnding: lineEnding,
			Encoding:   "UTF-8",
			Size:       int64(len(data)),
		}, nil
	}

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
	if id, remote, ok := sftp.ParseSFTPPath(path); ok && a.sftp != nil {
		ctx := a.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		return a.sftp.WriteBytes(ctx, id, remote, []byte(content))
	}

	clean := filepath.Clean(path)
	mode := os.FileMode(0o644)
	if info, err := os.Stat(clean); err == nil {
		mode = info.Mode().Perm()
	}
	return os.WriteFile(clean, []byte(content), mode)
}

type SaveFileDialogOptions struct {
	Title             string `json:"title"`
	DefaultDirectory  string `json:"defaultDirectory"`
	DefaultFilename   string `json:"defaultFilename"`
	FilterDisplayName string `json:"filterDisplayName"`
	FilterPattern     string `json:"filterPattern"`
}

func (a *App) ShowSaveFileDialog(opts SaveFileDialogOptions) (string, error) {
	if a.ctx == nil {
		return "", errors.New("app context not initialized")
	}

	dialogOpts := runtime.SaveDialogOptions{
		Title:                opts.Title,
		DefaultDirectory:     opts.DefaultDirectory,
		DefaultFilename:      opts.DefaultFilename,
		CanCreateDirectories: true,
	}

	if opts.FilterPattern != "" {
		displayName := opts.FilterDisplayName
		if displayName == "" {
			displayName = "Arquivos"
		}
		dialogOpts.Filters = []runtime.FileFilter{
			{
				DisplayName: displayName,
				Pattern:     opts.FilterPattern,
			},
			{
				DisplayName: "Todos os arquivos (*.*)",
				Pattern:     "*.*",
			},
		}
	}

	return runtime.SaveFileDialog(a.ctx, dialogOpts)
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
	} else if workspaceDir != "" {
		args = append(args, workspaceDir)
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
	if a.sftp != nil {
		a.sftp.Disconnect(id)
	}
	if a.storage == nil {
		return nil
	}
	return a.storage.DeleteRemoteProfile(id)
}

func (a *App) ConnectRemoteSFTP(req sftp.ConnectRequest) (sftp.ConnectResult, error) {
	if a.sftp == nil {
		a.sftp = sftp.NewManager(a.storage)
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.sftp.Connect(ctx, req)
}

func (a *App) DisconnectRemoteSFTP(profileID int64) {
	if a.sftp != nil {
		a.sftp.Disconnect(profileID)
	}
}

func (a *App) ListActiveSFTPConnections() []int64 {
	if a.sftp == nil {
		return nil
	}
	return a.sftp.ActiveProfileIDs()
}

func (a *App) DetectLocalSSHKeys() []sftp.LocalSSHKey {
	return sftp.DetectLocalSSHKeys()
}

func (a *App) hasSFTPOperation(sources []string, destination string) bool {
	if _, _, ok := sftp.ParseSFTPPath(destination); ok {
		return true
	}
	for _, s := range sources {
		if _, _, ok := sftp.ParseSFTPPath(s); ok {
			return true
		}
	}
	return false
}

func (a *App) runSFTPOperationAsync(kind string, sources []string, destination string) string {
	jobID := fmt.Sprintf("sftp-job-%d", time.Now().UnixNano())
	snap := ops.JobSnapshot{
		ID:          jobID,
		Kind:        ops.JobKind(kind),
		Sources:     sources,
		Destination: destination,
		Status:      ops.StatusRunning,
		TotalItems:  len(sources),
		CreatedAt:   time.Now(),
	}
	emit := func(st ops.JobSnapshot) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "ops:update", st)
		}
	}
	emit(snap)

	go func() {
		ctx := a.ctx
		if ctx == nil {
			ctx = context.Background()
		}
		var firstErr error
		for idx, src := range sources {
			snap.CurrentItem = filepath.Base(strings.ReplaceAll(src, `\`, `/`))
			emit(snap)

			err := a.execSingleSFTPOp(ctx, kind, src, destination)
			if err != nil && firstErr == nil {
				firstErr = err
			}
			snap.DoneItems = idx + 1
			emit(snap)
		}
		if firstErr != nil {
			snap.Status = ops.StatusFailed
			snap.Error = firstErr.Error()
		} else {
			snap.Status = ops.StatusCompleted
		}
		emit(snap)
	}()

	return jobID
}

func (a *App) execSingleSFTPOp(ctx context.Context, kind, src, dst string) error {
	srcID, srcRemote, srcIsSFTP := sftp.ParseSFTPPath(src)
	dstID, dstRemote, dstIsSFTP := sftp.ParseSFTPPath(dst)

	if kind == "delete" || kind == "trash" {
		if srcIsSFTP {
			return a.sftp.RemoveRecursive(ctx, srcID, srcRemote)
		}
		return os.RemoveAll(src)
	}

	baseName := filepath.Base(strings.ReplaceAll(src, `\`, `/`))
	if srcIsSFTP && !dstIsSFTP {
		// Download SFTP -> Local
		data, err := a.sftp.ReadBytes(ctx, srcID, srcRemote, 128*1024*1024)
		if err != nil {
			return err
		}
		targetLocal := filepath.Join(filepath.Clean(dst), baseName)
		if err := os.WriteFile(targetLocal, data, 0o644); err != nil {
			return err
		}
		if kind == "move" {
			_ = a.sftp.RemoveRecursive(ctx, srcID, srcRemote)
		}
		return nil
	}

	if !srcIsSFTP && dstIsSFTP {
		// Upload Local -> SFTP
		data, err := os.ReadFile(filepath.Clean(src))
		if err != nil {
			return err
		}
		targetRemote := strings.TrimSuffix(dstRemote, "/") + "/" + baseName
		if err := a.sftp.WriteBytes(ctx, dstID, targetRemote, data); err != nil {
			return err
		}
		if kind == "move" {
			_ = os.Remove(filepath.Clean(src))
		}
		return nil
	}

	if srcIsSFTP && dstIsSFTP {
		data, err := a.sftp.ReadBytes(ctx, srcID, srcRemote, 128*1024*1024)
		if err != nil {
			return err
		}
		targetRemote := strings.TrimSuffix(dstRemote, "/") + "/" + baseName
		if err := a.sftp.WriteBytes(ctx, dstID, targetRemote, data); err != nil {
			return err
		}
		if kind == "move" {
			_ = a.sftp.RemoveRecursive(ctx, srcID, srcRemote)
		}
		return nil
	}
	return nil
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
	FK           bool   `json:"fk"`
	FKTarget     string `json:"fkTarget,omitempty"`
}

type DBForeignKeyInfo struct {
	ID        int    `json:"id"`
	Seq       int    `json:"seq"`
	FromTable string `json:"fromTable"`
	FromCol   string `json:"fromCol"`
	ToTable   string `json:"toTable"`
	ToCol     string `json:"toCol"`
	OnUpdate  string `json:"onUpdate"`
	OnDelete  string `json:"onDelete"`
}

type DBRelationshipInfo struct {
	ID        string `json:"id"`
	FromTable string `json:"fromTable"`
	FromCol   string `json:"fromCol"`
	ToTable   string `json:"toTable"`
	ToCol     string `json:"toCol"`
	OnUpdate  string `json:"onUpdate"`
	OnDelete  string `json:"onDelete"`
}

type DBObjectInfo struct {
	Name        string             `json:"name"`
	Type        string             `json:"type"` // "table" | "view" | "index" | "trigger"
	RowCount    int64              `json:"rowCount"`
	SQL         string             `json:"sql"`
	Columns     []DBColumnInfo     `json:"columns"`
	ForeignKeys []DBForeignKeyInfo `json:"foreignKeys"`
}

type DBSchemaInfo struct {
	Path          string               `json:"path"`
	Name          string               `json:"name"`
	Size          int64                `json:"size"`
	SQLiteVersion string               `json:"sqliteVersion"`
	Tables        []DBObjectInfo       `json:"tables"`
	Views         []DBObjectInfo       `json:"views"`
	Indexes       []DBObjectInfo       `json:"indexes"`
	Relationships []DBRelationshipInfo `json:"relationships"`
}

type DBQueryResult struct {
	Columns      []string   `json:"columns"`
	Rows         [][]string `json:"rows"`
	TotalRows    int64      `json:"totalRows"`
	TotalCount   int64      `json:"totalCount"`
	RowsAffected int64      `json:"rowsAffected"`
	DurationMs   int64      `json:"durationMs"`
	IsSelect     bool       `json:"isSelect"`
	Message      string     `json:"message"`
}

func openUserSQLite(dbPath string) (*sql.DB, string, error) {
	clean := filepath.Clean(strings.TrimSpace(dbPath))
	if clean == "" {
		return nil, "", errors.New("caminho do banco de dados não informado")
	}
	info, err := os.Stat(clean)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, "", fmt.Errorf("arquivo de banco de dados não encontrado: %s", filepath.Base(clean))
		}
		if os.IsPermission(err) {
			return nil, "", fmt.Errorf("permissão negada para acessar o arquivo: %s", filepath.Base(clean))
		}
		return nil, "", err
	}
	if info.IsDir() {
		return nil, "", errors.New("o caminho informado é uma pasta, selecione um arquivo de banco (.db, .sqlite)")
	}
	if info.Size() < 100 {
		return nil, "", fmt.Errorf("o arquivo '%s' possui tamanho insuficiente (%d bytes) para ser um banco SQLite válido ou está vazio", filepath.Base(clean), info.Size())
	}

	// Validar cabeçalho mágico de 16 bytes padrão do SQLite 3 ("SQLite format 3\x00")
	f, err := os.Open(clean)
	if err != nil {
		return nil, "", fmt.Errorf("não foi possível ler o arquivo: %w", err)
	}
	header := make([]byte, 16)
	n, readErr := io.ReadFull(f, header)
	_ = f.Close()
	if readErr != nil || n < 16 || string(header) != "SQLite format 3\x00" {
		return nil, "", fmt.Errorf("o arquivo '%s' não é um banco de dados SQLite válido (cabeçalho incompatível ou corrompido)", filepath.Base(clean))
	}

	db, err := sql.Open("sqlite", clean)
	if err != nil {
		return nil, "", fmt.Errorf("falha ao inicializar conexão SQLite: %w", err)
	}

	// Otimizações de alta performance para bancos grandes (cache em memória e memory-mapped I/O)
	_, _ = db.Exec(`
		PRAGMA cache_size = -64000;
		PRAGMA mmap_size = 268435456;
		PRAGMA temp_store = MEMORY;
		PRAGMA read_uncommitted = ON;
	`)

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

func fetchTableForeignKeys(db *sql.DB, tableName string) []DBForeignKeyInfo {
	rows, err := db.Query(fmt.Sprintf("PRAGMA foreign_key_list(%s)", quoteSQLIdent(tableName)))
	if err != nil {
		return nil
	}
	defer rows.Close()

	var fks []DBForeignKeyInfo
	for rows.Next() {
		var id, seq int
		var toTable, fromCol, onUpdate, onDelete, match string
		var nullToCol sql.NullString
		if err := rows.Scan(&id, &seq, &toTable, &fromCol, &nullToCol, &onUpdate, &onDelete, &match); err == nil {
			toCol := ""
			if nullToCol.Valid {
				toCol = nullToCol.String
			}
			fks = append(fks, DBForeignKeyInfo{
				ID:        id,
				Seq:       seq,
				FromTable: tableName,
				FromCol:   fromCol,
				ToTable:   toTable,
				ToCol:     toCol,
				OnUpdate:  onUpdate,
				OnDelete:  onDelete,
			})
		}
	}
	return fks
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
		Relationships: []DBRelationshipInfo{},
	}

	for _, item := range rawList {
		obj := DBObjectInfo{
			Name:        item.name,
			Type:        item.objType,
			SQL:         item.sqlDef,
			ForeignKeys: []DBForeignKeyInfo{},
		}
		if item.objType == "table" {
			obj.Columns = fetchTableColumns(db, item.name)
			obj.ForeignKeys = fetchTableForeignKeys(db, item.name)

			// Contagem inteligente sem travar bancos gigantes:
			var cnt int64 = -1
			// 1. Verificar sqlite_sequence para leitura instantânea O(1)
			var seq int64
			if errSeq := db.QueryRow("SELECT seq FROM sqlite_sequence WHERE name = ?", item.name).Scan(&seq); errSeq == nil && seq >= 0 {
				cnt = seq
			} else {
				// 2. Tentar SELECT COUNT(*) com timeout curto (150ms) por tabela
				ctxCount, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
				_ = db.QueryRowContext(ctxCount, fmt.Sprintf("SELECT COUNT(*) FROM %s", quoteSQLIdent(item.name))).Scan(&cnt)
				cancel()
			}
			obj.RowCount = cnt
			schema.Tables = append(schema.Tables, obj)
		} else if item.objType == "view" {
			obj.Columns = fetchTableColumns(db, item.name)
			// Views não executam count antecipado para não disparar joins pesados na inspeção do banco
			obj.RowCount = -1
			schema.Views = append(schema.Views, obj)
		} else if item.objType == "index" {
			schema.Indexes = append(schema.Indexes, obj)
		}
	}

	// 1. Mapear PKs das tabelas
	pkMap := make(map[string]string)
	for _, tbl := range schema.Tables {
		for _, col := range tbl.Columns {
			if col.PK && pkMap[tbl.Name] == "" {
				pkMap[tbl.Name] = col.Name
			}
		}
		if pkMap[tbl.Name] == "" {
			pkMap[tbl.Name] = "id"
		}
	}

	// 2. Resolver Foreign Keys e gerar lista de Relationships
	schema.Relationships = []DBRelationshipInfo{}
	for tIdx := range schema.Tables {
		tbl := &schema.Tables[tIdx]
		for fkIdx := range tbl.ForeignKeys {
			fk := &tbl.ForeignKeys[fkIdx]
			if fk.ToCol == "" {
				if destPK, ok := pkMap[fk.ToTable]; ok {
					fk.ToCol = destPK
				} else {
					fk.ToCol = "id"
				}
			}

			// Marca a coluna como FK na tabela de origem
			for cIdx := range tbl.Columns {
				if tbl.Columns[cIdx].Name == fk.FromCol {
					tbl.Columns[cIdx].FK = true
					tbl.Columns[cIdx].FKTarget = fmt.Sprintf("%s.%s", fk.ToTable, fk.ToCol)
				}
			}

			relID := fmt.Sprintf("%s_%s__%s_%s", fk.FromTable, fk.FromCol, fk.ToTable, fk.ToCol)
			schema.Relationships = append(schema.Relationships, DBRelationshipInfo{
				ID:        relID,
				FromTable: fk.FromTable,
				FromCol:   fk.FromCol,
				ToTable:   fk.ToTable,
				ToCol:     fk.ToCol,
				OnUpdate:  fk.OnUpdate,
				OnDelete:  fk.OnDelete,
			})
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

	var totalCount int64
	// Se for primeira página sem filtro e retornou menos linhas que o limite, já temos o total exato
	if offset == 0 && trimmedFilter == "" && len(dataRows) < limit {
		totalCount = int64(len(dataRows))
	} else {
		counted := false
		// Tentar sqlite_sequence se for sem filtro para resposta O(1)
		if trimmedFilter == "" {
			var seq int64
			if errSeq := db.QueryRow("SELECT seq FROM sqlite_sequence WHERE name = ?", tableName).Scan(&seq); errSeq == nil && seq >= int64(offset+len(dataRows)) {
				totalCount = seq
				counted = true
			}
		}
		if !counted {
			countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s%s", quotedTable, whereClause)
			_ = db.QueryRow(countSQL, args...).Scan(&totalCount)
		}
	}
	if totalCount < int64(offset+len(dataRows)) {
		totalCount = int64(offset + len(dataRows))
	}

	return DBQueryResult{
		Columns:      cols,
		Rows:         dataRows,
		TotalRows:    totalCount,
		TotalCount:   totalCount,
		DurationMs:   time.Since(start).Milliseconds(),
		IsSelect:     true,
		Message:      fmt.Sprintf("%d registro(s) carregado(s) de %d", len(dataRows), totalCount),
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
			Columns:      cols,
			Rows:         dataRows,
			TotalRows:    int64(len(dataRows)),
			TotalCount:   int64(len(dataRows)),
			DurationMs:   time.Since(start).Milliseconds(),
			IsSelect:     true,
			Message:      fmt.Sprintf("%d linha(s) retornada(s) em %d ms", len(dataRows), time.Since(start).Milliseconds()),
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
		TotalRows:    1,
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

func (a *App) DBCreatorInspectSource(sourcePath string) (*dbcreator.SourceInspection, error) {
	return dbcreator.InspectSource(sourcePath)
}

func (a *App) DBCreatorExecute(req dbcreator.CreateDBRequest) (*dbcreator.CreateDBResult, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return dbcreator.CreateDatabase(ctx, req, func(event dbcreator.ProgressEvent) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "dbcreator:progress", event)
		}
	})
}

func (a *App) ResolveStudioProjectURL(dirPath string, entryRelPath string, untitledHTML string) string {
	return thumbs.ResolveStudioProjectPreviewURL(dirPath, entryRelPath, untitledHTML)
}

func (a *App) SyncStudioLiveFiles(files map[string]string) {
	thumbs.ReplaceStudioLiveBuffers(files)
}
