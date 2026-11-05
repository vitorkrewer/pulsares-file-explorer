import { create } from 'zustand';
import {
  readTextFile,
  writeTextFile,
  createFile,
  runStudioCommand,
  openStudioWindowNative,
  StudioRunResult,
} from '../../lib/wails';

export interface EditorDiagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'struct' | 'interface' | 'class' | 'type' | 'const' | 'heading' | 'key';
  line: number;
}

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  savedContent: string;
  lineEnding: 'LF' | 'CRLF';
  encoding: string;
  cursorLine: number;
  cursorCol: number;
  pinned?: boolean;
}

export type DevTransformKind =
  | 'sortAsc'
  | 'sortDesc'
  | 'dedupe'
  | 'removeEmpty'
  | 'trimTrailing'
  | 'upper'
  | 'lower'
  | 'camelCase'
  | 'snakeCase'
  | 'kebabCase'
  | 'jsonPretty'
  | 'jsonMinify'
  | 'jsonEscape'
  | 'jsonUnescape'
  | 'base64Encode'
  | 'base64Decode'
  | 'urlEncode'
  | 'urlDecode'
  | 'jwtDecode';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  txt: 'plaintext',
  log: 'plaintext',
  csv: 'plaintext',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  jsonc: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  go: 'go',
  py: 'python',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'css',
  less: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  env: 'ini',
  conf: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  sql: 'sql',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  java: 'java',
  php: 'php',
  rb: 'ruby',
  dockerfile: 'dockerfile',
  gitignore: 'ini',
  makefile: 'makefile',
};

export function detectLanguageFromPath(nameOrPath: string): string {
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  if (base.startsWith('.env')) return 'ini';
  if (base.startsWith('.git')) return 'ini';
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx < 0) return 'plaintext';
  const ext = base.slice(dotIdx + 1);
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

export function isEditableTextFile(nameOrPath: string, extension?: string): boolean {
  const ext = (extension || '').replace(/^\./, '').toLowerCase();
  if (ext && EXTENSION_LANGUAGE_MAP[ext]) return true;
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  if (
    base === 'dockerfile' ||
    base === 'makefile' ||
    base === 'license' ||
    base === 'readme' ||
    base.startsWith('.env') ||
    base.startsWith('.git') ||
    base.endsWith('.rc')
  ) {
    return true;
  }
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx >= 0) {
    const parsedExt = base.slice(dotIdx + 1);
    return Boolean(EXTENSION_LANGUAGE_MAP[parsedExt]);
  }
  return false;
}

export function computeDiagnostics(content: string, language: string): EditorDiagnostic[] {
  const diags: EditorDiagnostic[] = [];
  if (language === 'json' && content.trim().length > 0) {
    try {
      JSON.parse(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'JSON inválido';
      const posMatch = msg.match(/position\s+(\d+)/i);
      let line = 1;
      if (posMatch) {
        const pos = Number(posMatch[1]);
        line = content.slice(0, pos).split('\n').length;
      }
      diags.push({ line, message: msg, severity: 'error' });
    }
  }

  if (['javascript', 'typescript', 'go', 'rust', 'c', 'cpp', 'java', 'csharp'].includes(language)) {
    const lines = content.split('\n');
    let braceBalance = 0;
    let lastOpenLine = 1;
    lines.forEach((ln, idx) => {
      const stripped = ln
        .replace(/\/\/.*$/, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
      for (const ch of stripped) {
        if (ch === '{') {
          braceBalance++;
          lastOpenLine = idx + 1;
        } else if (ch === '}') {
          braceBalance--;
        }
      }
    });
    if (braceBalance > 0) {
      diags.push({
        line: lastOpenLine,
        message: `Bloco '{' não fechado (${braceBalance} pendente)`,
        severity: 'warning',
      });
    } else if (braceBalance < 0) {
      diags.push({
        line: lines.length,
        message: `Chave '}' excedente encontrada`,
        severity: 'error',
      });
    }
  }

  return diags;
}

export function extractCodeSymbols(content: string, language: string): CodeSymbol[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const symbols: CodeSymbol[] = [];

  lines.forEach((raw, idx) => {
    const lineNum = idx + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (language === 'go') {
      const fnMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)/);
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], kind: 'function', line: lineNum });
        return;
      }
      const typeMatch = trimmed.match(/^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: typeMatch[2] === 'interface' ? 'interface' : 'struct',
          line: lineNum,
        });
        return;
      }
    } else if (language === 'typescript' || language === 'javascript') {
      const fnMatch = trimmed.match(
        /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/
      );
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], kind: 'function', line: lineNum });
        return;
      }
      const clsMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (clsMatch) {
        symbols.push({ name: clsMatch[1], kind: 'class', line: lineNum });
        return;
      }
      const ifaceMatch = trimmed.match(
        /^(?:export\s+)?(interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
      );
      if (ifaceMatch) {
        symbols.push({
          name: ifaceMatch[2],
          kind: ifaceMatch[1] === 'interface' ? 'interface' : 'type',
          line: lineNum,
        });
        return;
      }
      const constFnMatch = trimmed.match(
        /^(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/
      );
      if (constFnMatch) {
        symbols.push({ name: constFnMatch[1], kind: 'function', line: lineNum });
        return;
      }
    } else if (language === 'python') {
      const defMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (defMatch) {
        symbols.push({ name: defMatch[1], kind: 'function', line: lineNum });
        return;
      }
      const clsMatch = trimmed.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (clsMatch) {
        symbols.push({ name: clsMatch[1], kind: 'class', line: lineNum });
        return;
      }
    } else if (language === 'markdown') {
      const hdMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (hdMatch) {
        symbols.push({ name: hdMatch[2].trim(), kind: 'heading', line: lineNum });
        return;
      }
    } else if (language === 'json') {
      const keyMatch = raw.match(/^\s{2}"([^"]+)"\s*:/);
      if (keyMatch) {
        symbols.push({ name: keyMatch[1], kind: 'key', line: lineNum });
      }
    }
  });

  return symbols;
}

export function computeLineDiff(savedContent: string, currentContent: string): DiffLine[] {
  const oldLines = savedContent.replace(/\r\n/g, '\n').split('\n');
  const newLines = currentContent.replace(/\r\n/g, '\n').split('\n');
  const result: DiffLine[] = [];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ type: 'same', oldLine: i + 1, newLine: j + 1, text: newLines[j] });
      i++;
      j++;
    } else if (
      j + 1 < newLines.length &&
      i < oldLines.length &&
      oldLines[i] === newLines[j + 1]
    ) {
      result.push({ type: 'added', newLine: j + 1, text: newLines[j] });
      j++;
    } else if (
      i + 1 < oldLines.length &&
      j < newLines.length &&
      oldLines[i + 1] === newLines[j]
    ) {
      result.push({ type: 'removed', oldLine: i + 1, text: oldLines[i] });
      i++;
    } else {
      if (i < oldLines.length) {
        result.push({ type: 'removed', oldLine: i + 1, text: oldLines[i] });
        i++;
      }
      if (j < newLines.length) {
        result.push({ type: 'added', newLine: j + 1, text: newLines[j] });
        j++;
      }
    }
  }
  return result;
}

export function defaultCommandForTab(tab: EditorTab): string {
  const quoted = tab.path ? `"${tab.path}"` : '';
  switch (tab.language) {
    case 'go':
      return quoted ? `go run ${quoted}` : 'go test ./...';
    case 'python':
      return quoted ? `python ${quoted}` : 'python --version';
    case 'javascript':
      return quoted ? `node ${quoted}` : 'node -v';
    case 'typescript':
      return quoted ? `npx tsx ${quoted}` : 'npx tsc --noEmit';
    case 'powershell':
      return quoted ? `powershell -ExecutionPolicy Bypass -File ${quoted}` : 'Get-Location';
    case 'shell':
      return quoted ? `bash ${quoted}` : 'ls -la';
    default:
      return 'git status -sb';
  }
}

const STUDIO_STORAGE_KEY = 'pulsares.studio.tabs.v1';
const STUDIO_QUEUE_KEY = 'pulsares.studio.openQueue.v1';
const STUDIO_CHANNEL_NAME = 'pulsares_studio_ipc';

let studioPopupRef: Window | null = null;
let broadcastChannel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(STUDIO_CHANNEL_NAME);
  }
  return broadcastChannel;
}

export function isStandaloneStudioWindow(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('studio') === '1';
}

function persistTabsToStorage(tabs: EditorTab[], activeTabId: string | null, workspaceDir: string) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      STUDIO_STORAGE_KEY,
      JSON.stringify({ tabs: tabs.slice(-15), activeTabId, workspaceDir })
    );
  } catch {
    // ignora quota
  }
}

function loadPersistedTabs(): {
  tabs: EditorTab[];
  activeTabId: string | null;
  workspaceDir: string;
} {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { tabs: [], activeTabId: null, workspaceDir: '' };
    }
    const raw = window.localStorage.getItem(STUDIO_STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabId: null, workspaceDir: '' };
    const parsed = JSON.parse(raw);
    return {
      tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
      activeTabId: parsed.activeTabId || null,
      workspaceDir: parsed.workspaceDir || '',
    };
  } catch {
    return { tabs: [], activeTabId: null, workspaceDir: '' };
  }
}

interface EditorState {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  preferSeparateWindow: boolean;
  workspaceDir: string;
  tabs: EditorTab[];
  activeTabId: string | null;
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: boolean;
  showMinimap: boolean;
  showSplitPreview: boolean;
  showDiffView: boolean;
  sidebarTab: 'files' | 'symbols' | 'tools' | null;
  findBarOpen: boolean;
  quickOpenVisible: boolean;
  runnerOpen: boolean;
  runnerLoading: boolean;
  runnerCommand: string;
  runnerResult: StudioRunResult | null;
  statusMessage: string | null;

  hydrateStudioFromStorage: (initialTarget?: string, defaultDir?: string) => Promise<void>;
  openFileInEditor: (path: string, forceLocalModal?: boolean) => Promise<void>;
  openNewUntitledTab: (defaultDir?: string, language?: string, forceLocalModal?: boolean) => void;
  detachToSeparateWindow: () => Promise<void>;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  togglePinTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  revertTabContent: (id: string) => void;
  updateCursor: (id: string, line: number, col: number) => void;
  setTabLanguage: (id: string, language: string) => void;
  toggleLineEnding: (id: string) => void;
  saveTab: (id: string, fallbackDir?: string) => Promise<boolean>;
  saveAllTabs: (fallbackDir?: string) => Promise<void>;
  formatActiveTab: () => void;
  transformActiveTab: (kind: DevTransformKind) => void;
  runStudioScript: (cwd: string, customCmd?: string) => Promise<void>;

  setWorkspaceDir: (dir: string) => void;
  setEditorOpen: (open: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  toggleMaximized: () => void;
  setPreferSeparateWindow: (prefer: boolean) => void;
  setFontSize: (size: number) => void;
  setTabSize: (size: 2 | 4) => void;
  toggleWordWrap: () => void;
  toggleMinimap: () => void;
  toggleSplitPreview: () => void;
  toggleDiffView: () => void;
  setSidebarTab: (tab: 'files' | 'symbols' | 'tools' | null) => void;
  setFindBarOpen: (open: boolean) => void;
  setQuickOpenVisible: (visible: boolean) => void;
  setRunnerOpen: (open: boolean) => void;
  setRunnerCommand: (cmd: string) => void;
  setStatusMessage: (msg: string | null) => void;
}

let untitledSeq = 1;

function spawnOrFocusSeparateStudioWindow(targetPath?: string, workspaceDir?: string): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandaloneStudioWindow()) return false;

  try {
    window.localStorage.setItem(
      STUDIO_QUEUE_KEY,
      JSON.stringify({
        targetPath: targetPath || '',
        workspaceDir: workspaceDir || '',
        ts: Date.now(),
      })
    );
  } catch {
    // ignora
  }

  const ch = getChannel();
  if (ch) {
    ch.postMessage({
      type: 'STUDIO_OPEN_REQUEST',
      targetPath: targetPath || '',
      workspaceDir: workspaceDir || '',
    });
  }

  if (studioPopupRef && !studioPopupRef.closed) {
    studioPopupRef.focus();
    return true;
  }

  const studioUrl = `${window.location.origin}${window.location.pathname}?studio=1`;
  const win = window.open(
    studioUrl,
    'PulsaresStudioWindow',
    'width=1280,height=820,left=90,top=50,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
  );
  if (win) {
    studioPopupRef = win;
    win.focus();
    return true;
  }
  return false;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  isOpen: isStandaloneStudioWindow(),
  isMinimized: false,
  isMaximized: isStandaloneStudioWindow(),
  preferSeparateWindow: true,
  workspaceDir: '',
  tabs: [],
  activeTabId: null,
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  showMinimap: true,
  showSplitPreview: false,
  showDiffView: false,
  sidebarTab: 'files',
  findBarOpen: false,
  quickOpenVisible: false,
  runnerOpen: false,
  runnerLoading: false,
  runnerCommand: '',
  runnerResult: null,
  statusMessage: null,

  hydrateStudioFromStorage: async (initialTarget?: string, defaultDir?: string) => {
    const saved = loadPersistedTabs();
    const dir = defaultDir || saved.workspaceDir || '';
    if (saved.tabs.length > 0) {
      set({
        tabs: saved.tabs,
        activeTabId: saved.activeTabId || saved.tabs[0].id,
        workspaceDir: dir,
        isOpen: true,
      });
    } else if (dir) {
      set({ workspaceDir: dir });
    }

    // Verifica se há pedido na fila de abertura
    try {
      const rawQ = window.localStorage.getItem(STUDIO_QUEUE_KEY);
      if (rawQ) {
        window.localStorage.removeItem(STUDIO_QUEUE_KEY);
        const q = JSON.parse(rawQ) as { targetPath?: string; workspaceDir?: string };
        if (q.workspaceDir) {
          set({ workspaceDir: q.workspaceDir });
        }
        if (q.targetPath) {
          await get().openFileInEditor(q.targetPath, true);
          return;
        }
      }
    } catch {
      // ignora
    }

    if (initialTarget) {
      await get().openFileInEditor(initialTarget, true);
    } else if (get().tabs.length === 0 && isStandaloneStudioWindow()) {
      get().openNewUntitledTab(dir, 'typescript', true);
    }
  },

  openFileInEditor: async (path: string, forceLocalModal = false) => {
    const parentDir = path.replace(/[/\\][^/\\]+$/, '') || get().workspaceDir;
    if (parentDir) {
      set({ workspaceDir: parentDir });
    }

    // Carrega e registra a aba no estado persistido antes de abrir/focar a janela separada
    const existing = get().tabs.find((t) => t.path === path);
    let activeTab: EditorTab | null = existing || null;

    if (!activeTab) {
      try {
        const payload = await readTextFile(path);
        const lang = detectLanguageFromPath(payload.name || path);
        const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        activeTab = {
          id,
          path: payload.path || path,
          name: payload.name || path.split(/[/\\]/).pop() || path,
          language: lang,
          content: payload.content,
          savedContent: payload.content,
          lineEnding: payload.lineEnding || 'LF',
          encoding: payload.encoding || 'UTF-8',
          cursorLine: 1,
          cursorCol: 1,
        };
        const nextTabs = [...get().tabs, activeTab];
        set((s) => ({
          tabs: nextTabs,
          activeTabId: id,
          runnerCommand: defaultCommandForTab(activeTab!),
          showSplitPreview: lang === 'markdown' ? true : s.showSplitPreview,
        }));
        persistTabsToStorage(nextTabs, id, parentDir);
      } catch (err) {
        console.error('Erro ao abrir arquivo no Pulsares Studio:', err);
        return;
      }
    } else {
      set({
        activeTabId: activeTab.id,
        runnerCommand: defaultCommandForTab(activeTab),
      });
      persistTabsToStorage(get().tabs, activeTab.id, parentDir);
    }

    // Se estamos na janela do Explorador e preferSeparateWindow está ativo, abre/foca a janela separada do Studio
    if (!forceLocalModal && !isStandaloneStudioWindow() && get().preferSeparateWindow) {
      const openedPopup = spawnOrFocusSeparateStudioWindow(path, parentDir);
      if (openedPopup) {
        set({ isOpen: false });
        return;
      }
      const openedNative = await openStudioWindowNative(path);
      if (openedNative) {
        set({ isOpen: false });
        return;
      }
    }

    set({
      isOpen: true,
      isMinimized: false,
    });
  },

  openNewUntitledTab: (defaultDir?: string, language = 'plaintext', forceLocalModal = false) => {
    const dir = defaultDir || get().workspaceDir;
    const num = untitledSeq++;
    const ext =
      language === 'markdown'
        ? 'md'
        : language === 'json'
        ? 'json'
        : language === 'typescript'
        ? 'ts'
        : language === 'javascript'
        ? 'js'
        : language === 'go'
        ? 'go'
        : language === 'python'
        ? 'py'
        : 'txt';
    const id = `untitled-${Date.now()}-${num}`;
    const newTab: EditorTab = {
      id,
      path: '',
      name: `sem-titulo-${num}.${ext}`,
      language,
      content: '',
      savedContent: '',
      lineEnding: 'LF',
      encoding: 'UTF-8',
      cursorLine: 1,
      cursorCol: 1,
    };
    const nextTabs = [...get().tabs, newTab];
    set({
      workspaceDir: dir,
      tabs: nextTabs,
      activeTabId: id,
      runnerCommand: defaultCommandForTab(newTab),
    });
    persistTabsToStorage(nextTabs, id, dir);

    if (!forceLocalModal && !isStandaloneStudioWindow() && get().preferSeparateWindow) {
      if (spawnOrFocusSeparateStudioWindow('', dir)) {
        set({ isOpen: false });
        return;
      }
    }

    set({ isOpen: true, isMinimized: false });
  },

  detachToSeparateWindow: async () => {
    const { tabs, activeTabId, workspaceDir } = get();
    persistTabsToStorage(tabs, activeTabId, workspaceDir);
    const active = tabs.find((t) => t.id === activeTabId) || tabs[0];
    if (spawnOrFocusSeparateStudioWindow(active?.path || '', workspaceDir)) {
      set({ isOpen: false, preferSeparateWindow: true });
      return;
    }
    const ok = await openStudioWindowNative(active?.path || '');
    if (ok) {
      set({ isOpen: false, preferSeparateWindow: true });
    }
  },

  closeTab: (id: string) => {
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== id);
      const nextActive =
        s.activeTabId === id
          ? remaining[remaining.length - 1]?.id || null
          : s.activeTabId;
      persistTabsToStorage(remaining, nextActive, s.workspaceDir);
      return {
        tabs: remaining,
        activeTabId: nextActive,
        isOpen: isStandaloneStudioWindow() ? true : remaining.length > 0 ? s.isOpen : false,
      };
    });
  },

  closeOtherTabs: (id: string) => {
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id === id || t.pinned);
      persistTabsToStorage(remaining, id, s.workspaceDir);
      return {
        tabs: remaining,
        activeTabId: id,
      };
    });
  },

  togglePinTab: (id: string) => {
    set((s) => {
      const nextTabs = s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return { tabs: nextTabs };
    });
  },

  setActiveTab: (id: string) => {
    const tab = get().tabs.find((t) => t.id === id);
    set({
      activeTabId: id,
      runnerCommand: tab ? defaultCommandForTab(tab) : get().runnerCommand,
    });
  },

  updateTabContent: (id: string, content: string) => {
    set((s) => {
      const nextTabs = s.tabs.map((t) => (t.id === id ? { ...t, content } : t));
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return { tabs: nextTabs };
    });
  },

  revertTabContent: (id: string) => {
    set((s) => {
      const nextTabs = s.tabs.map((t) =>
        t.id === id ? { ...t, content: t.savedContent } : t
      );
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return {
        tabs: nextTabs,
        statusMessage: 'Alterações revertidas para a versão salva em disco',
      };
    });
  },

  updateCursor: (id: string, line: number, col: number) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, cursorLine: line, cursorCol: col } : t
      ),
    }));
  },

  setTabLanguage: (id: string, language: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, language } : t)),
    }));
  },

  toggleLineEnding: (id: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id) return t;
        const nextLE = t.lineEnding === 'LF' ? 'CRLF' : 'LF';
        const normalized = t.content.replace(/\r\n/g, '\n');
        const nextContent =
          nextLE === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized;
        return { ...t, lineEnding: nextLE, content: nextContent };
      }),
    }));
  },

  saveTab: async (id: string, fallbackDir?: string) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return false;

    try {
      let targetPath = tab.path;
      if (!targetPath) {
        const dir = fallbackDir || get().workspaceDir || '.';
        targetPath = await createFile(dir, tab.name);
      }
      await writeTextFile(targetPath, tab.content);
      set((s) => {
        const nextTabs = s.tabs.map((t) =>
          t.id === id
            ? { ...t, path: targetPath, savedContent: t.content }
            : t
        );
        persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
        return {
          tabs: nextTabs,
          statusMessage: `Salvo: ${tab.name}`,
        };
      });
      const ch = getChannel();
      if (ch) {
        ch.postMessage({ type: 'STUDIO_FILE_SAVED', path: targetPath });
      }
      setTimeout(() => {
        if (get().statusMessage === `Salvo: ${tab.name}`) {
          set({ statusMessage: null });
        }
      }, 2500);
      return true;
    } catch (err) {
      set({
        statusMessage: `Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`,
      });
      return false;
    }
  },

  saveAllTabs: async (fallbackDir?: string) => {
    const { tabs, saveTab } = get();
    for (const tab of tabs) {
      if (tab.content !== tab.savedContent || !tab.path) {
        await saveTab(tab.id, fallbackDir);
      }
    }
  },

  formatActiveTab: () => {
    const { activeTabId, tabs, tabSize } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const indentUnit = ' '.repeat(tabSize);
    let formatted = tab.content;

    if (tab.language === 'json') {
      try {
        const parsed = JSON.parse(tab.content);
        formatted = JSON.stringify(parsed, null, tabSize);
      } catch {
        // mantém se inválido
      }
    } else if (
      ['javascript', 'typescript', 'go', 'rust', 'c', 'cpp', 'java', 'csharp', 'css'].includes(
        tab.language
      )
    ) {
      const rawLines = tab.content.replace(/\r\n/g, '\n').split('\n');
      let level = 0;
      const out: string[] = [];
      for (const raw of rawLines) {
        const trimmed = raw.trim();
        if (!trimmed) {
          out.push('');
          continue;
        }
        if (/^[}\])]/.test(trimmed)) {
          level = Math.max(0, level - 1);
        }
        out.push(indentUnit.repeat(level) + trimmed);
        const opens = (trimmed.match(/[{[(]/g) || []).length;
        const closes = (trimmed.match(/[}\])]/g) || []).length;
        const net = opens - closes + (/^[}\])]/.test(trimmed) ? 1 : 0);
        level = Math.max(0, level + net);
      }
      formatted = out.join(tab.lineEnding === 'CRLF' ? '\r\n' : '\n');
    } else {
      formatted = tab.content
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join(tab.lineEnding === 'CRLF' ? '\r\n' : '\n');
    }

    set((s) => {
      const nextTabs = s.tabs.map((t) =>
        t.id === tab.id ? { ...t, content: formatted } : t
      );
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return {
        tabs: nextTabs,
        statusMessage: 'Código formatado com sucesso',
      };
    });
  },

  transformActiveTab: (kind: DevTransformKind) => {
    const { activeTabId, tabs, tabSize } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const sep = tab.lineEnding === 'CRLF' ? '\r\n' : '\n';
    const raw = tab.content;
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    let nextContent = raw;

    try {
      switch (kind) {
        case 'sortAsc':
          nextContent = [...lines].sort((a, b) => a.localeCompare(b)).join(sep);
          break;
        case 'sortDesc':
          nextContent = [...lines].sort((a, b) => b.localeCompare(a)).join(sep);
          break;
        case 'dedupe':
          nextContent = Array.from(new Set(lines)).join(sep);
          break;
        case 'removeEmpty':
          nextContent = lines.filter((l) => l.trim().length > 0).join(sep);
          break;
        case 'trimTrailing':
          nextContent = lines.map((l) => l.replace(/[ \t]+$/, '')).join(sep);
          break;
        case 'upper':
          nextContent = raw.toUpperCase();
          break;
        case 'lower':
          nextContent = raw.toLowerCase();
          break;
        case 'camelCase':
          nextContent = lines
            .map((l) =>
              l.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
            )
            .join(sep);
          break;
        case 'snakeCase':
          nextContent = lines
            .map((l) =>
              l
                .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
                .replace(/[-\s]+/g, '_')
                .toLowerCase()
            )
            .join(sep);
          break;
        case 'kebabCase':
          nextContent = lines
            .map((l) =>
              l
                .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
                .replace(/[_\s]+/g, '-')
                .toLowerCase()
            )
            .join(sep);
          break;
        case 'jsonPretty':
          nextContent = JSON.stringify(JSON.parse(raw), null, tabSize);
          break;
        case 'jsonMinify':
          nextContent = JSON.stringify(JSON.parse(raw));
          break;
        case 'jsonEscape':
          nextContent = JSON.stringify(raw);
          break;
        case 'jsonUnescape': {
          const parsed = JSON.parse(raw.trim().startsWith('"') ? raw.trim() : `"${raw}"`);
          nextContent = String(parsed);
          break;
        }
        case 'base64Encode': {
          const bytes = new TextEncoder().encode(raw);
          let bin = '';
          bytes.forEach((b) => (bin += String.fromCharCode(b)));
          nextContent = btoa(bin);
          break;
        }
        case 'base64Decode': {
          const bin = atob(raw.trim());
          const bytes = Uint8Array.from(bin, (m) => m.codePointAt(0) ?? 0);
          nextContent = new TextDecoder('utf-8').decode(bytes);
          break;
        }
        case 'urlEncode':
          nextContent = encodeURIComponent(raw);
          break;
        case 'urlDecode':
          nextContent = decodeURIComponent(raw);
          break;
        case 'jwtDecode': {
          const parts = raw.trim().split('.');
          if (parts.length >= 2) {
            const decodePart = (p: string) => {
              const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
              return JSON.parse(atob(b64));
            };
            nextContent = JSON.stringify(
              {
                header: decodePart(parts[0]),
                payload: decodePart(parts[1]),
                signature: parts[2] || '',
              },
              null,
              2
            );
          }
          break;
        }
      }
    } catch (err) {
      set({
        statusMessage: `Falha na transformação: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    set((s) => {
      const nextTabs = s.tabs.map((t) =>
        t.id === tab.id ? { ...t, content: nextContent } : t
      );
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return {
        tabs: nextTabs,
        statusMessage: 'Transformação aplicada',
      };
    });
  },

  runStudioScript: async (cwd: string, customCmd?: string) => {
    const st = get();
    const active = st.tabs.find((t) => t.id === st.activeTabId) || st.tabs[0];
    const cmdToRun = (customCmd ?? st.runnerCommand).trim() || (active ? defaultCommandForTab(active) : '');
    if (!cmdToRun) return;

    // Se o arquivo ativo tiver alterações pendentes e caminho válido, salva antes de executar
    if (active && active.path && active.content !== active.savedContent) {
      await st.saveTab(active.id, cwd);
    }

    set({
      runnerOpen: true,
      runnerLoading: true,
      runnerCommand: cmdToRun,
    });

    const targetCwd =
      (active?.path ? active.path.replace(/[/\\][^/\\]+$/, '') : '') ||
      cwd ||
      st.workspaceDir;

    try {
      const res = await runStudioCommand(targetCwd, cmdToRun);
      set({
        runnerLoading: false,
        runnerResult: res,
      });
    } catch (err) {
      set({
        runnerLoading: false,
        runnerResult: {
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          exitCode: 1,
          durationMs: 0,
        },
      });
    }
  },

  setWorkspaceDir: (workspaceDir) => set({ workspaceDir }),
  setEditorOpen: (isOpen) => set({ isOpen, isMinimized: false }),
  setMinimized: (isMinimized) => set({ isMinimized }),
  toggleMaximized: () => set((s) => ({ isMaximized: !s.isMaximized, isMinimized: false })),
  setPreferSeparateWindow: (preferSeparateWindow) => set({ preferSeparateWindow }),
  setFontSize: (size) => set({ fontSize: Math.max(10, Math.min(26, size)) }),
  setTabSize: (tabSize) => set({ tabSize }),
  toggleWordWrap: () => set((s) => ({ wordWrap: !s.wordWrap })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleSplitPreview: () => set((s) => ({ showSplitPreview: !s.showSplitPreview, showDiffView: false })),
  toggleDiffView: () => set((s) => ({ showDiffView: !s.showDiffView, showSplitPreview: false })),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setFindBarOpen: (findBarOpen) => set({ findBarOpen }),
  setQuickOpenVisible: (quickOpenVisible) => set({ quickOpenVisible }),
  setRunnerOpen: (runnerOpen) => set({ runnerOpen }),
  setRunnerCommand: (runnerCommand) => set({ runnerCommand }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
}));
