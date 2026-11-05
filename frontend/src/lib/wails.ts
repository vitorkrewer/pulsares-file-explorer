export interface Location {
  provider: string;
  root: string;
  path: string;
}

export interface Attrs {
  hidden: boolean;
  system: boolean;
  readOnly: boolean;
}

export type Kind = 'file' | 'dir' | 'symlink' | 'other';

export interface Entry {
  name: string;
  location: Location;
  kind: Kind;
  size: number;
  modTime: string;
  attrs: Attrs;
  target?: Location;
}

export type Tri = 'yes' | 'no' | 'unknown';

export interface TreeNode {
  name: string;
  location: Location;
  hasChildren: Tri;
  isLink: boolean;
  hidden: boolean;
}

export interface DriveInfo {
  path: string;
  label: string;
  freeBytes?: number;
  totalBytes?: number;
  isRemovable?: boolean;
}

export interface FavoriteItem {
  path: string;
  label: string;
  position: number;
}

export interface RecentItem {
  path: string;
  visitCount: number;
  lastVisited: string;
}

export type ShellKind = 'powershell' | 'cmd' | 'posix' | 'fish' | 'wsl';

export interface TerminalProfile {
  id: string;
  name: string;
  path: string;
  args?: string[];
  env?: Record<string, string>;
  kind: ShellKind;
}

export interface TerminalDataEvent {
  id: string;
  chunk: string;
  rawLen: number;
  cwdOsc7?: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
}

export type PreviewKind =
  | 'image'
  | 'markdown'
  | 'code'
  | 'text'
  | 'media'
  | 'pdf'
  | 'binary'
  | 'folder';

export interface PreviewData {
  path: string;
  name: string;
  kind: PreviewKind;
  extension: string;
  mimeType: string;
  size: number;
  modTime: string;
  textContent?: string;
  truncated?: boolean;
  lineCount?: number;
  dataUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  childCount?: number;
}

export interface SearchOptions {
  rootPath: string;
  query: string;
  useRegex: boolean;
  extensions: string[];
  kind: string;
  minSize: number;
  maxSize: number;
  modifiedAfter: string;
  modifiedBefore: string;
  contentQuery: string;
  includeHidden: boolean;
  useIndex: boolean;
}

export interface SearchResultItem {
  path: string;
  relPath: string;
  name: string;
  kind: string;
  size: number;
  modTime: string;
  snippet?: string;
  lineNumber?: number;
}

export interface SearchBatchEvent {
  requestId: string;
  results: SearchResultItem[];
}

export interface SearchDoneEvent {
  requestId: string;
  total: number;
  canceled: boolean;
  error?: string;
}

export interface IndexedRoot {
  rootPath: string;
  itemCount: number;
  updatedAt: string;
}

export interface InitialState {
  systemLanguage: string;
  homeDir: string;
  drives: DriveInfo[];
  favorites?: FavoriteItem[];
  recent?: RecentItem[];
  language: string;
  theme: string;
  sessionData?: string;
}

export interface ListingBatchEvent {
  requestId: string;
  entries: Entry[];
}

export interface ListingDoneEvent {
  requestId: string;
  total: number;
  error?: string;
}

export type JobKind = 'copy' | 'move' | 'trash' | 'delete';
export type JobStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'paused'
  | 'conflict'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'canceled';
export type ConflictPolicy = 'ask' | 'overwrite' | 'skip' | 'rename' | 'keepNewer';

export interface ConflictInfo {
  srcPath: string;
  dstPath: string;
  srcSize: number;
  dstSize: number;
  srcModTime: string;
  dstModTime: string;
}

export interface JobSnapshot {
  id: string;
  kind: JobKind;
  sources: string[];
  destination: string;
  status: JobStatus;
  policy: ConflictPolicy;
  verifyHash: boolean;
  totalBytes: number;
  doneBytes: number;
  totalItems: number;
  doneItems: number;
  currentItem: string;
  speedBps: number;
  etaSeconds: number;
  error?: string;
  conflict?: ConflictInfo;
  createdAt: string;
}

export interface JournalEntry {
  id: number;
  opType: string;
  srcPath: string;
  dstPath: string;
  undone: boolean;
  createdAt: string;
}

export interface ItemProperties {
  name: string;
  path: string;
  parentDir: string;
  kind: 'file' | 'folder' | 'symlink';
  extension: string;
  size: number;
  fileCount: number;
  folderCount: number;
  modifiedAt: number;
  permissions: string;
  isReadOnly: boolean;
  isHidden: boolean;
  symlinkTarget?: string;
  sha256?: string;
}

export interface WatchChangeEvent {
  path: string;
  timestamp: number;
}

// Declaração de objetos injetados pelo Wails runtime
declare global {
  interface Window {
    go?: {
      app: {
        App: {
          GetInitialState: () => Promise<InitialState>;
          ListDirectory: (tabId: string, requestId: string, path: string) => Promise<void>;
          ListDirectorySnapshot: (path: string, showHidden: boolean) => Promise<Entry[]>;
          GetThumbnail: (path: string, maxDim: number) => Promise<string>;
          GetPreview: (path: string, maxTextBytes: number) => Promise<PreviewData>;
          StartSearch: (requestId: string, opts: SearchOptions) => Promise<void>;
          CancelSearch: (requestId: string) => Promise<void>;
          IndexDirectory: (rootPath: string) => Promise<number>;
          ListIndexRoots: () => Promise<IndexedRoot[]>;
          RemoveIndexRoot: (rootPath: string) => Promise<void>;
          ExpandPath: (path: string) => Promise<string>;
          AutocompletePath: (partial: string, showHidden: boolean) => Promise<string[]>;
          CancelListing: (tabId: string) => Promise<void>;
          TreeRoots: () => Promise<TreeNode[]>;
          TreeChildren: (path: string, showHidden: boolean) => Promise<TreeNode[]>;
          CreateFolder: (parentDir: string, name: string) => Promise<string>;
          CreateFile: (parentDir: string, name: string) => Promise<string>;
          RenameItem: (oldPath: string, newName: string) => Promise<string>;
          EnqueueOperation: (
            kind: string,
            sources: string[],
            destination: string,
            policy: string,
            verifyHash: boolean
          ) => Promise<string>;
          PauseJob: (jobId: string) => Promise<void>;
          ResumeJob: (jobId: string) => Promise<void>;
          CancelJob: (jobId: string) => Promise<void>;
          ResolveJobConflict: (jobId: string, policy: string, applyToAll: boolean) => Promise<void>;
          ListJobs: () => Promise<JobSnapshot[]>;
          UndoOperation: () => Promise<JournalEntry | null>;
          RedoOperation: () => Promise<JournalEntry | null>;
          ListJournal: () => Promise<JournalEntry[]>;
          ListFavorites: () => Promise<FavoriteItem[]>;
          AddFavorite: (path: string, label: string) => Promise<void>;
          RemoveFavorite: (path: string) => Promise<void>;
          ListRecent: () => Promise<RecentItem[]>;
          TerminalProfiles: () => Promise<TerminalProfile[]>;
          TerminalStart: (profileId: string, cwd: string, cols: number, rows: number) => Promise<string>;
          TerminalWrite: (sessionId: string, data: string) => Promise<void>;
          TerminalResize: (sessionId: string, cols: number, rows: number) => Promise<void>;
          TerminalAck: (sessionId: string, byteCount: number) => Promise<void>;
          TerminalKill: (sessionId: string) => Promise<void>;
          TerminalHasRunningChildren: (sessionId: string) => Promise<boolean>;
          TerminalChangeDir: (sessionId: string, path: string) => Promise<void>;
          TerminalQuotePaths: (sessionId: string, paths: string[]) => Promise<string>;
          SaveSession: (data: string) => Promise<void>;
          LoadSession: () => Promise<string>;
          OpenPath: (path: string) => Promise<void>;
          SetWatchedPaths: (paths: string[]) => Promise<void>;
          GetItemProperties: (path: string) => Promise<ItemProperties>;
          OpenWithDialog: (path: string) => Promise<void>;
          OpenExternalTerminal: (dirPath: string) => Promise<void>;
          RevealInSystemExplorer: (path: string) => Promise<void>;
          EjectDrive: (drivePath: string) => Promise<void>;
          GetDrives: () => Promise<DriveInfo[]>;
          GetSetting: (key: string) => Promise<string>;
          SetSetting: (key: string, val: string) => Promise<void>;
        };
      };
    };
    runtime?: {
      EventsOn: (eventName: string, callback: (data: unknown) => void) => () => void;
      EventsOff: (eventName: string) => void;
    };
  }
}

export const isWailsAvailable = (): boolean => {
  return typeof window !== 'undefined' && !!window.go?.app?.App;
};

export async function getInitialState(): Promise<InitialState> {
  if (isWailsAvailable()) {
    return window.go!.app.App.GetInitialState();
  }
  return {
    systemLanguage: navigator.language || 'en',
    homeDir: '/',
    drives: [{ path: '/', label: '/', freeBytes: 64 * 1024 * 1024 * 1024, totalBytes: 256 * 1024 * 1024 * 1024 }],
    favorites: [],
    recent: [],
    language: 'auto',
    theme: 'system',
    sessionData: '',
  };
}

export async function listDirectory(tabId: string, requestId: string, path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ListDirectory(tabId, requestId, path);
  }
  console.warn('[Wails Mock] listDirectory', { tabId, requestId, path });
}

export async function listDirectorySnapshot(path: string, showHidden: boolean): Promise<Entry[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListDirectorySnapshot(path, showHidden);
    return res || [];
  }
  return [];
}

export async function getThumbnail(path: string, maxDim = 128): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.GetThumbnail(path, maxDim);
  }
  return '';
}

export async function getPreview(path: string, maxTextBytes = 65536): Promise<PreviewData> {
  if (isWailsAvailable()) {
    return window.go!.app.App.GetPreview(path, maxTextBytes);
  }
  return {
    path,
    name: path.split(/[/\\]/).pop() || path,
    kind: 'text',
    extension: '',
    mimeType: 'text/plain',
    size: 0,
    modTime: new Date().toISOString(),
    textContent: '',
  };
}

export async function startSearch(requestId: string, opts: SearchOptions): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.StartSearch(requestId, opts);
  }
}

export async function cancelSearch(requestId: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.CancelSearch(requestId);
  }
}

export async function indexDirectory(rootPath: string): Promise<number> {
  if (isWailsAvailable()) {
    return window.go!.app.App.IndexDirectory(rootPath);
  }
  return 0;
}

export async function listIndexRoots(): Promise<IndexedRoot[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListIndexRoots();
    return res || [];
  }
  return [];
}

export async function removeIndexRoot(rootPath: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.RemoveIndexRoot(rootPath);
  }
}

export async function expandPath(path: string): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ExpandPath(path);
  }
  return path;
}

export async function autocompletePath(partial: string, showHidden: boolean): Promise<string[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.AutocompletePath(partial, showHidden);
    return res || [];
  }
  return [];
}

export async function cancelListing(tabId: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.CancelListing(tabId);
  }
}

export async function treeRoots(): Promise<TreeNode[]> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TreeRoots();
  }
  return [
    {
      name: '/',
      location: { provider: 'local', root: '/', path: '/' },
      hasChildren: 'yes',
      isLink: false,
      hidden: false,
    },
  ];
}

export async function treeChildren(path: string, showHidden: boolean): Promise<TreeNode[]> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TreeChildren(path, showHidden);
  }
  return [];
}

export async function createFolder(parentDir: string, name: string): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.CreateFolder(parentDir, name);
  }
  return `${parentDir}/${name}`;
}

export async function createFile(parentDir: string, name: string): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.CreateFile(parentDir, name);
  }
  return `${parentDir}/${name}`;
}

export async function renameItem(oldPath: string, newName: string): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.RenameItem(oldPath, newName);
  }
  return newName;
}

export async function enqueueOperation(
  kind: JobKind,
  sources: string[],
  destination: string,
  policy: ConflictPolicy = 'ask',
  verifyHash = false
): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.EnqueueOperation(kind, sources, destination, policy, verifyHash);
  }
  return 'mock-job-id';
}

export async function pauseJob(jobId: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.PauseJob(jobId);
  }
}

export async function resumeJob(jobId: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ResumeJob(jobId);
  }
}

export async function cancelJob(jobId: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.CancelJob(jobId);
  }
}

export async function resolveJobConflict(
  jobId: string,
  policy: ConflictPolicy,
  applyToAll: boolean
): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ResolveJobConflict(jobId, policy, applyToAll);
  }
}

export async function listJobs(): Promise<JobSnapshot[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListJobs();
    return res || [];
  }
  return [];
}

export async function undoOperation(): Promise<JournalEntry | null> {
  if (isWailsAvailable()) {
    return window.go!.app.App.UndoOperation();
  }
  return null;
}

export async function redoOperation(): Promise<JournalEntry | null> {
  if (isWailsAvailable()) {
    return window.go!.app.App.RedoOperation();
  }
  return null;
}

export async function listJournal(): Promise<JournalEntry[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListJournal();
    return res || [];
  }
  return [];
}

export async function listFavorites(): Promise<FavoriteItem[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListFavorites();
    return res || [];
  }
  return [];
}

export async function addFavorite(path: string, label = ''): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.AddFavorite(path, label);
  }
}

export async function removeFavorite(path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.RemoveFavorite(path);
  }
}

export async function listRecent(): Promise<RecentItem[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListRecent();
    return res || [];
  }
  return [];
}

export async function terminalProfiles(): Promise<TerminalProfile[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.TerminalProfiles();
    return res || [];
  }
  return [
    { id: 'pwsh', name: 'PowerShell 7', path: 'pwsh.exe', kind: 'powershell' },
    { id: 'cmd', name: 'Prompt de Comando (cmd)', path: 'cmd.exe', kind: 'cmd' },
    { id: 'bash', name: 'Bash', path: '/bin/bash', kind: 'posix' },
  ];
}

export async function terminalStart(
  profileId: string,
  cwd: string,
  cols = 100,
  rows = 28
): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TerminalStart(profileId, cwd, cols, rows);
  }
  return `mock-term-${Date.now()}`;
}

export async function terminalWrite(sessionId: string, data: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TerminalWrite(sessionId, data);
  }
}

export async function terminalResize(sessionId: string, cols: number, rows: number): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TerminalResize(sessionId, cols, rows);
  }
}

export async function terminalAck(sessionId: string, byteCount: number): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TerminalAck(sessionId, byteCount);
  }
}

export async function terminalKill(sessionId: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TerminalKill(sessionId);
  }
}

export async function terminalHasRunningChildren(sessionId: string): Promise<boolean> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TerminalHasRunningChildren(sessionId);
  }
  return false;
}

export async function terminalChangeDir(sessionId: string, path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TerminalChangeDir(sessionId, path);
  }
}

export async function terminalQuotePaths(sessionId: string, paths: string[]): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.TerminalQuotePaths(sessionId, paths);
  }
  return paths.map((p) => `'${p.replace(/'/g, "''")}'`).join(' ');
}

export async function getDrives(): Promise<DriveInfo[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.GetDrives();
    return res || [];
  }
  return [];
}

export async function saveSession(data: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.SaveSession(data);
  }
}

export async function loadSession(): Promise<string> {
  if (isWailsAvailable()) {
    return window.go!.app.App.LoadSession();
  }
  return '';
}

export async function openPath(path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.OpenPath(path);
  }
  console.log('[Wails Mock] OpenPath', path);
}

export async function setWatchedPaths(paths: string[]): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.SetWatchedPaths(paths);
  }
}

export async function getItemProperties(path: string): Promise<ItemProperties> {
  if (isWailsAvailable()) {
    return window.go!.app.App.GetItemProperties(path);
  }
  return {
    name: path.split(/[/\\]/).pop() || path,
    path,
    parentDir: path,
    kind: 'file',
    extension: '',
    size: 0,
    fileCount: 0,
    folderCount: 0,
    modifiedAt: Date.now(),
    permissions: '-rw-r--r--',
    isReadOnly: false,
    isHidden: false,
  };
}

export async function openWithDialog(path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.OpenWithDialog(path);
  }
}

export async function openExternalTerminal(dirPath: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.OpenExternalTerminal(dirPath);
  }
}

export async function revealInSystemExplorer(path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.RevealInSystemExplorer(path);
  }
}

export async function ejectDrive(drivePath: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.EjectDrive(drivePath);
  }
}

export async function saveSetting(key: string, val: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.SetSetting(key, val);
  }
}

export function subscribeEvent<T>(eventName: string, callback: (data: T) => void): () => void {
  if (typeof window !== 'undefined' && window.runtime?.EventsOn) {
    return window.runtime.EventsOn(eventName, (data: unknown) => {
      callback(data as T);
    });
  }
  return () => {};
}
