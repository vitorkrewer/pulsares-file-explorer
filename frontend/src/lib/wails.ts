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
  | 'database'
  | 'presentation'
  | 'binary'
  | 'folder';

export interface PresentationSlide {
  index: number;
  title: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
  images?: string[];
}

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
  slideCount?: number;
  slides?: PresentationSlide[];
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
  studioMode?: boolean;
  studioTarget?: string;
  dbStudioMode?: boolean;
  dbStudioTarget?: string;
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

export interface BatchRenameOptions {
  find: string;
  replace: string;
  useRegex: boolean;
  prefix: string;
  suffix: string;
  caseMode: 'none' | 'lower' | 'upper' | 'title';
  startNumber: number;
  stepNumber: number;
  numberDigits: number;
}

export interface BatchRenamePreviewItem {
  originalPath: string;
  originalName: string;
  newName: string;
  newPath: string;
  changed: boolean;
  hasConflict: boolean;
}

export interface FolderDiffItem {
  name: string;
  status: 'onlyLeft' | 'onlyRight' | 'different' | 'identical';
  isDir: boolean;
  leftPath?: string;
  rightPath?: string;
  leftSize: number;
  rightSize: number;
  leftModTime: number;
  rightModTime: number;
}

export interface FileHashes {
  path: string;
  size: number;
  md5: string;
  sha1: string;
  sha256: string;
}

export interface ItemTag {
  path: string;
  tagName: string;
  color: string;
  updatedAt: string;
}

export interface SavedSearch {
  id: number;
  name: string;
  queryJson: string;
  createdAt: string;
}

export interface ArchiveEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  compressedSize: number;
  modTime: number;
}

export interface RemoteProfile {
  id: number;
  name: string;
  protocol: 'sftp' | 'webdav';
  host: string;
  port: number;
  username: string;
  remotePath: string;
  authType?: 'key' | 'agent' | 'password';
  keyPath?: string;
  hostKeyFp?: string;
  createdAt?: string;
}

export interface SFTPConnectRequest {
  profileId: number;
  name: string;
  host: string;
  port: number;
  username: string;
  remotePath: string;
  authType: 'key' | 'agent' | 'password';
  keyPath: string;
  passphrase: string;
  trustHost: boolean;
}

export interface SFTPConnectResult {
  connected: boolean;
  profileId: number;
  rootUri: string;
  initialPath: string;
  hostKeyFp: string;
  hostKeyType: string;
  needsHostTrust: boolean;
  hostKeyMismatch: boolean;
  expectedHostFp?: string;
  serverBanner?: string;
  message?: string;
}

export interface LocalSSHKey {
  name: string;
  path: string;
  publicKey?: string;
}

export interface TextFilePayload {
  path: string;
  name: string;
  content: string;
  lineEnding: 'LF' | 'CRLF';
  encoding: string;
  size: number;
}

export interface StudioRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface StudioOpenFileEvent {
  targetPath: string;
  workspaceDir: string;
  timestamp: number;
}

export interface DBColumnInfo {
  cid: number;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string;
  pk: boolean;
  fk?: boolean;
  fkTarget?: string;
}

export interface DBForeignKeyInfo {
  id: number;
  seq: number;
  fromTable: string;
  fromCol: string;
  toTable: string;
  toCol: string;
  onUpdate: string;
  onDelete: string;
}

export interface DBRelationshipInfo {
  id: string;
  fromTable: string;
  fromCol: string;
  toTable: string;
  toCol: string;
  onUpdate: string;
  onDelete: string;
}

export interface DBObjectInfo {
  name: string;
  type: 'table' | 'view' | 'index';
  tableName: string;
  rowCount: number;
  sql: string;
  columns: DBColumnInfo[];
  foreignKeys?: DBForeignKeyInfo[];
}

export interface DBSchemaInfo {
  path: string;
  name: string;
  size: number;
  sqliteVer: string;
  tables: DBObjectInfo[];
  views: DBObjectInfo[];
  indexes: DBObjectInfo[];
  relationships?: DBRelationshipInfo[];
}

export interface DBQueryResult {
  columns: string[];
  rows: string[][];
  totalRows: number;
  rowsAffected: number;
  durationMs: number;
  isSelect: boolean;
  message?: string;
}

export interface DBStudioOpenFileEvent {
  targetPath: string;
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
          TerminalAutocomplete: (sessionId: string, cwdFallback: string, line: string) => Promise<string[]>;
          ReadTextFile: (path: string) => Promise<TextFilePayload>;
          WriteTextFile: (path: string, content: string) => Promise<void>;
          RunStudioCommand: (cwd: string, command: string) => Promise<StudioRunResult>;
          OpenStudioWindow: (targetPath: string) => Promise<void>;
          DBInspectSchema: (dbPath: string) => Promise<DBSchemaInfo>;
          DBQueryTable: (
            dbPath: string,
            tableName: string,
            limit: number,
            offset: number,
            filterText: string,
            sortCol: string,
            sortDir: string
          ) => Promise<DBQueryResult>;
          DBExecuteSQL: (dbPath: string, query: string) => Promise<DBQueryResult>;
          OpenDBStudioWindow: (targetPath: string) => Promise<void>;
          WindowMinimize: () => Promise<void>;
          WindowToggleMaximize: () => Promise<void>;
          WindowClose: () => Promise<void>;
          SaveSession: (data: string) => Promise<void>;
          LoadSession: () => Promise<string>;
          OpenPath: (path: string) => Promise<void>;
          SetWatchedPaths: (paths: string[]) => Promise<void>;
          GetItemProperties: (path: string) => Promise<ItemProperties>;
          OpenWithDialog: (path: string) => Promise<void>;
          OpenExternalTerminal: (dirPath: string) => Promise<void>;
          RevealInSystemExplorer: (path: string) => Promise<void>;
          EjectDrive: (drivePath: string) => Promise<void>;
          PreviewBatchRename: (
            paths: string[],
            opts: BatchRenameOptions
          ) => Promise<BatchRenamePreviewItem[]>;
          ExecuteBatchRename: (paths: string[], opts: BatchRenameOptions) => Promise<number>;
          CompareDirectories: (leftDir: string, rightDir: string) => Promise<FolderDiffItem[]>;
          ComputeHashes: (filePath: string) => Promise<FileHashes>;
          SetItemTag: (path: string, tagName: string, color: string) => Promise<void>;
          RemoveItemTag: (path: string) => Promise<void>;
          ListItemTags: () => Promise<ItemTag[]>;
          SaveSearch: (name: string, queryJson: string) => Promise<number>;
          ListSavedSearches: () => Promise<SavedSearch[]>;
          DeleteSavedSearch: (id: number) => Promise<void>;
          ListArchive: (archivePath: string) => Promise<ArchiveEntry[]>;
          CreateArchive: (sources: string[], destArchivePath: string) => Promise<void>;
          ExtractArchive: (archivePath: string, destDir: string) => Promise<number>;
          SaveRemoteProfile: (profile: RemoteProfile) => Promise<number>;
          ListRemoteProfiles: () => Promise<RemoteProfile[]>;
          DeleteRemoteProfile: (id: number) => Promise<void>;
          ConnectRemoteSFTP: (req: SFTPConnectRequest) => Promise<SFTPConnectResult>;
          DisconnectRemoteSFTP: (profileId: number) => Promise<void>;
          ListActiveSFTPConnections: () => Promise<number[]>;
          DetectLocalSSHKeys: () => Promise<LocalSSHKey[]>;
          GetDrives: () => Promise<DriveInfo[]>;
          GetSetting: (key: string) => Promise<string>;
          SetSetting: (key: string, val: string) => Promise<void>;
          ShowSaveFileDialog?: (opts: SaveFileDialogOptions) => Promise<string>;
          DBCreatorInspectSource?: (sourcePath: string) => Promise<DBCreatorInspection>;
          DBCreatorExecute?: (req: DBCreatorRequest) => Promise<DBCreatorResult>;
        };
      };
    };
    runtime?: {
      EventsOn: (eventName: string, callback: (data: unknown) => void) => () => void;
      EventsOff: (eventName: string) => void;
      WindowMinimise?: () => void;
      WindowToggleMaximise?: () => void;
      Quit?: () => void;
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

function splitCommandTokenClient(line: string): {
  prefix: string;
  token: string;
  quoteChar: string;
} {
  if (!line) return { prefix: '', token: '', quoteChar: '' };
  let inQuote = '';
  let tokenStart = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      tokenStart = i;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      tokenStart = i + 1;
    }
  }
  const prefix = line.slice(0, tokenStart);
  let rawToken = line.slice(tokenStart);
  let quoteChar = '';
  if (rawToken.startsWith('"') || rawToken.startsWith("'")) {
    quoteChar = rawToken[0];
    rawToken = rawToken.slice(1);
    if (rawToken.endsWith(quoteChar)) {
      rawToken = rawToken.slice(0, -1);
    }
  }
  return { prefix, token: rawToken, quoteChar };
}

function joinClientPath(baseDir: string, relDir: string): string {
  if (!relDir) return baseDir;
  if (/^[A-Za-z]:[/\\]/.test(relDir) || relDir.startsWith('/')) {
    return relDir;
  }
  const isWin = baseDir.includes('\\') || /^[A-Za-z]:/.test(baseDir);
  const sep = isWin ? '\\' : '/';
  const cleanBase = baseDir.replace(/[/\\]+$/, '');
  const parts = cleanBase.split(/[/\\]/);
  const relParts = relDir.replace(/[/\\]+$/, '').split(/[/\\]/);
  for (const p of relParts) {
    if (!p || p === '.') continue;
    if (p === '..') {
      if (parts.length > 1) parts.pop();
    } else {
      parts.push(p);
    }
  }
  return parts.join(sep) || (isWin ? `${parts[0]}\\` : '/');
}

export async function terminalAutocomplete(
  sessionId: string,
  cwdFallback: string,
  line: string
): Promise<string[]> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.TerminalAutocomplete === 'function') {
    try {
      const res = await window.go!.app.App.TerminalAutocomplete(sessionId, cwdFallback, line);
      if (Array.isArray(res) && res.length > 0) {
        return res;
      }
    } catch {
      // Fallback abaixo via ListDirectorySnapshot
    }
  }

  const baseCwd = (cwdFallback || '').trim() || '/';
  const { prefix, token, quoteChar } = splitCommandTokenClient(line);
  const isWin = baseCwd.includes('\\') || /^[A-Za-z]:/.test(baseCwd);
  const sep = token.includes('/') && !token.includes('\\') ? '/' : isWin ? '\\' : '/';

  let dirPart = '';
  let filePrefix = token;
  const lastSlash = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'));
  if (lastSlash >= 0) {
    dirPart = token.slice(0, lastSlash + 1);
    filePrefix = token.slice(lastSlash + 1);
  }

  const candidates: string[] = [];
  const commonCmds = [
    'cd', 'ls', 'dir', 'cls', 'clear', 'pwd', 'echo', 'cat', 'type',
    'mkdir', 'rmdir', 'rm', 'del', 'cp', 'copy', 'mv', 'move',
    'git', 'go', 'npm', 'npx', 'pnpm', 'yarn', 'node', 'python',
    'code', 'docker', 'curl', 'ssh', 'tar', 'zip',
  ];

  const trimmedPrefix = prefix.trim();
  const firstWord = (trimmedPrefix.split(/\s+/)[0] || '').toLowerCase();
  const dirsOnly = ['cd', 'chdir', 'sl', 'set-location', 'pushd', 'rmdir'].includes(firstWord);

  if (!trimmedPrefix && !dirPart && filePrefix) {
    const lowerPref = filePrefix.toLowerCase();
    for (const cmd of commonCmds) {
      if (cmd.startsWith(lowerPref)) {
        candidates.push(`${prefix}${cmd} `);
      }
    }
  }

  const searchDir = joinClientPath(baseCwd, dirPart);
  try {
    const entries = await listDirectorySnapshot(searchDir, true);
    const lowerFilePref = filePrefix.toLowerCase();
    for (const entry of entries) {
      if (dirsOnly && entry.kind !== 'dir') continue;
      if (!entry.name.toLowerCase().startsWith(lowerFilePref)) continue;
      const completedPath = `${dirPart}${entry.name}${entry.kind === 'dir' ? sep : ''}`;
      const needsQuotes = completedPath.includes(' ');
      let formatted = completedPath;
      if (quoteChar) {
        formatted = `${quoteChar}${completedPath}${quoteChar}`;
      } else if (needsQuotes) {
        formatted = `"${completedPath}"`;
      }
      candidates.push(`${prefix}${formatted}`);
      if (candidates.length >= 60) break;
    }
  } catch {
    // Ignora diretório inacessível
  }

  return candidates;
}

export async function readTextFile(path: string): Promise<TextFilePayload> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.ReadTextFile === 'function') {
    try {
      return await window.go!.app.App.ReadTextFile(path);
    } catch {
      // Fallback para GetPreview abaixo
    }
  }
  if (isWailsAvailable()) {
    try {
      const prev = await getPreview(path, 512 * 1024);
      const content = prev.textContent || '';
      return {
        path: prev.path || path,
        name: prev.name || path.split(/[/\\]/).pop() || path,
        content,
        lineEnding: content.includes('\r\n') ? 'CRLF' : 'LF',
        encoding: 'UTF-8',
        size: prev.size || content.length,
      };
    } catch {
      // Fallback vazio abaixo
    }
  }
  return {
    path,
    name: path.split(/[/\\]/).pop() || path,
    content: '',
    lineEnding: 'LF',
    encoding: 'UTF-8',
    size: 0,
  };
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.WriteTextFile === 'function') {
    return window.go!.app.App.WriteTextFile(path, content);
  }
}

export interface SaveFileDialogOptions {
  title?: string;
  defaultDirectory?: string;
  defaultFilename?: string;
  filterDisplayName?: string;
  filterPattern?: string;
}

export async function showSaveFileDialog(opts: SaveFileDialogOptions): Promise<string> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.ShowSaveFileDialog === 'function') {
    return await (appObj.ShowSaveFileDialog as (o: SaveFileDialogOptions) => Promise<string>)(opts);
  }
  return '';
}

export async function runStudioCommand(cwd: string, command: string): Promise<StudioRunResult> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.RunStudioCommand === 'function') {
    return window.go!.app.App.RunStudioCommand(cwd, command);
  }
  return {
    stdout: '',
    stderr: 'Execução disponível apenas após recompilar o backend Go.',
    exitCode: 1,
    durationMs: 0,
  };
}

export async function openStudioWindowNative(targetPath: string): Promise<boolean> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.OpenStudioWindow === 'function') {
    try {
      await window.go!.app.App.OpenStudioWindow(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function dbInspectSchema(dbPath: string): Promise<DBSchemaInfo> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.DBInspectSchema === 'function') {
    return window.go!.app.App.DBInspectSchema(dbPath);
  }
  return {
    path: dbPath,
    name: dbPath.split(/[/\\]/).pop() || dbPath,
    size: 0,
    sqliteVer: '3.x',
    tables: [],
    views: [],
    indexes: [],
  };
}

export async function dbQueryTable(
  dbPath: string,
  tableName: string,
  limit = 100,
  offset = 0,
  filterText = '',
  sortCol = '',
  sortDir = 'ASC'
): Promise<DBQueryResult> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.DBQueryTable === 'function') {
    return window.go!.app.App.DBQueryTable(dbPath, tableName, limit, offset, filterText, sortCol, sortDir);
  }
  return {
    columns: [],
    rows: [],
    totalRows: 0,
    rowsAffected: 0,
    durationMs: 0,
    isSelect: true,
  };
}

export async function dbExecuteSQL(dbPath: string, query: string): Promise<DBQueryResult> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.DBExecuteSQL === 'function') {
    return window.go!.app.App.DBExecuteSQL(dbPath, query);
  }
  return {
    columns: [],
    rows: [],
    totalRows: 0,
    rowsAffected: 0,
    durationMs: 0,
    isSelect: false,
    message: 'Wails indisponível no modo navegador.',
  };
}

export async function openDBStudioWindowNative(targetPath: string): Promise<boolean> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.OpenDBStudioWindow === 'function') {
    try {
      await window.go!.app.App.OpenDBStudioWindow(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function windowMinimize(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.runtime?.WindowMinimise === 'function') {
    window.runtime.WindowMinimise();
    return;
  }
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.WindowMinimize === 'function') {
    await window.go!.app.App.WindowMinimize();
  }
}

export async function windowToggleMaximize(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.runtime?.WindowToggleMaximise === 'function') {
    window.runtime.WindowToggleMaximise();
    return;
  }
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.WindowToggleMaximize === 'function') {
    await window.go!.app.App.WindowToggleMaximize();
  }
}

export async function windowClose(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.runtime?.Quit === 'function') {
    window.runtime.Quit();
    return;
  }
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.WindowClose === 'function') {
    await window.go!.app.App.WindowClose();
    return;
  }
  if (typeof window !== 'undefined') {
    window.close();
  }
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

export async function previewBatchRename(
  paths: string[],
  opts: BatchRenameOptions
): Promise<BatchRenamePreviewItem[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.PreviewBatchRename(paths, opts);
    return res || [];
  }
  return [];
}

export async function executeBatchRename(
  paths: string[],
  opts: BatchRenameOptions
): Promise<number> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ExecuteBatchRename(paths, opts);
  }
  return 0;
}

export async function compareDirectories(
  leftDir: string,
  rightDir: string
): Promise<FolderDiffItem[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.CompareDirectories(leftDir, rightDir);
    return res || [];
  }
  return [];
}

export async function computeHashes(filePath: string): Promise<FileHashes> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ComputeHashes(filePath);
  }
  return { path: filePath, size: 0, md5: '', sha1: '', sha256: '' };
}

export async function setItemTag(path: string, tagName: string, color: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.SetItemTag(path, tagName, color);
  }
}

export async function removeItemTag(path: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.RemoveItemTag(path);
  }
}

export async function listItemTags(): Promise<ItemTag[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListItemTags();
    return res || [];
  }
  return [];
}

export async function saveSearch(name: string, queryJson: string): Promise<number> {
  if (isWailsAvailable()) {
    return window.go!.app.App.SaveSearch(name, queryJson);
  }
  return 0;
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListSavedSearches();
    return res || [];
  }
  return [];
}

export async function deleteSavedSearch(id: number): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.DeleteSavedSearch(id);
  }
}

export async function listArchive(archivePath: string): Promise<ArchiveEntry[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListArchive(archivePath);
    return res || [];
  }
  return [];
}

export async function createArchive(sources: string[], destArchivePath: string): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.CreateArchive(sources, destArchivePath);
  }
}

export async function extractArchive(archivePath: string, destDir: string): Promise<number> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ExtractArchive(archivePath, destDir);
  }
  return 0;
}

export async function saveRemoteProfile(profile: RemoteProfile): Promise<number> {
  if (isWailsAvailable()) {
    return window.go!.app.App.SaveRemoteProfile(profile);
  }
  return 0;
}

export async function listRemoteProfiles(): Promise<RemoteProfile[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListRemoteProfiles();
    return res || [];
  }
  return [];
}

export async function deleteRemoteProfile(id: number): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.DeleteRemoteProfile(id);
  }
}

export async function connectRemoteSFTP(req: SFTPConnectRequest): Promise<SFTPConnectResult> {
  if (isWailsAvailable()) {
    return window.go!.app.App.ConnectRemoteSFTP(req);
  }
  return {
    connected: false,
    profileId: req.profileId,
    rootUri: '',
    initialPath: '',
    hostKeyFp: '',
    hostKeyType: '',
    needsHostTrust: false,
    hostKeyMismatch: false,
  };
}

export async function disconnectRemoteSFTP(profileId: number): Promise<void> {
  if (isWailsAvailable()) {
    return window.go!.app.App.DisconnectRemoteSFTP(profileId);
  }
}

export async function listActiveSFTPConnections(): Promise<number[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.ListActiveSFTPConnections();
    return res || [];
  }
  return [];
}

export async function detectLocalSSHKeys(): Promise<LocalSSHKey[]> {
  if (isWailsAvailable()) {
    const res = await window.go!.app.App.DetectLocalSSHKeys();
    return res || [];
  }
  return [];
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

export interface DBCreatorColumnDef {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  notNull?: boolean;
}

export interface DBCreatorInspection {
  sourcePath: string;
  format: 'csv' | 'tsv' | 'json' | 'jsonl';
  detectedDelim: string;
  hasHeader: boolean;
  estimatedRows: number;
  fileSize: number;
  suggestedTable: string;
  suggestedDBName: string;
  columns: DBCreatorColumnDef[];
  sampleRows: string[][];
  rawSampleJson?: Record<string, unknown>[];
}

export interface DBCreatorRequest {
  sourcePath: string;
  destinationPath: string;
  tableName: string;
  columns: DBCreatorColumnDef[];
  addAutoId: boolean;
  delimiter?: string;
  hasHeader?: boolean;
  batchSize?: number;
  enableWal?: boolean;
  customDdl?: string;
}

export interface DBCreatorProgressEvent {
  stage: 'analyzing' | 'creating_schema' | 'importing' | 'finalizing' | 'completed' | 'error';
  processedRows: number;
  totalRows: number;
  percentage: number;
  speedRowsSec: number;
  elapsedMs: number;
  estimatedRemMs: number;
  currentLog?: string;
}

export interface DBCreatorResult {
  destinationPath: string;
  tableName: string;
  totalRows: number;
  totalDurationMs: number;
  finalFileSizeBytes: number;
  ddlExecuted: string;
}

export async function dbCreatorInspectSource(sourcePath: string): Promise<DBCreatorInspection> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.DBCreatorInspectSource === 'function') {
    return await (appObj.DBCreatorInspectSource as (path: string) => Promise<DBCreatorInspection>)(sourcePath);
  }
  throw new Error('DBCreatorInspectSource indisponível no ambiente atual');
}

export async function dbCreatorExecute(req: DBCreatorRequest): Promise<DBCreatorResult> {
  const appObj = window.go?.app?.App as Record<string, unknown> | undefined;
  if (isWailsAvailable() && typeof appObj?.DBCreatorExecute === 'function') {
    return await (appObj.DBCreatorExecute as (r: DBCreatorRequest) => Promise<DBCreatorResult>)(req);
  }
  throw new Error('DBCreatorExecute indisponível no ambiente atual');
}

