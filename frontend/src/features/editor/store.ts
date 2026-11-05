import { create } from 'zustand';
import { readTextFile, writeTextFile, createFile } from '../../lib/wails';

export interface EditorDiagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
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
}

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

  // Verifica chaves/parênteses desbalanceados básicos em linguagens C-like / JS / TS / Go
  if (['javascript', 'typescript', 'go', 'rust', 'c', 'cpp', 'java', 'csharp'].includes(language)) {
    const lines = content.split('\n');
    let braceBalance = 0;
    let lastOpenLine = 1;
    lines.forEach((ln, idx) => {
      const stripped = ln.replace(/\/\/.*$/, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
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
        message: `Chave '}' extra encontrada`,
        severity: 'error',
      });
    }
  }

  return diags;
}

interface EditorState {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  tabs: EditorTab[];
  activeTabId: string | null;
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: boolean;
  showMinimap: boolean;
  showSplitPreview: boolean;
  findBarOpen: boolean;
  statusMessage: string | null;

  openFileInEditor: (path: string) => Promise<void>;
  openNewUntitledTab: (defaultDir?: string, language?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  updateCursor: (id: string, line: number, col: number) => void;
  setTabLanguage: (id: string, language: string) => void;
  toggleLineEnding: (id: string) => void;
  saveTab: (id: string, fallbackDir?: string) => Promise<boolean>;
  saveAllTabs: (fallbackDir?: string) => Promise<void>;
  formatActiveTab: () => void;
  transformActiveTab: (
    kind: 'sortAsc' | 'sortDesc' | 'dedupe' | 'trimTrailing' | 'upper' | 'lower'
  ) => void;

  setEditorOpen: (open: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  toggleMaximized: () => void;
  setFontSize: (size: number) => void;
  setTabSize: (size: 2 | 4) => void;
  toggleWordWrap: () => void;
  toggleMinimap: () => void;
  toggleSplitPreview: () => void;
  setFindBarOpen: (open: boolean) => void;
  setStatusMessage: (msg: string | null) => void;
}

let untitledSeq = 1;

export const useEditorStore = create<EditorState>((set, get) => ({
  isOpen: false,
  isMinimized: false,
  isMaximized: false,
  tabs: [],
  activeTabId: null,
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  showMinimap: true,
  showSplitPreview: false,
  findBarOpen: false,
  statusMessage: null,

  openFileInEditor: async (path: string) => {
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({
        isOpen: true,
        isMinimized: false,
        activeTabId: existing.id,
      });
      return;
    }

    try {
      const payload = await readTextFile(path);
      const lang = detectLanguageFromPath(payload.name || path);
      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newTab: EditorTab = {
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
      set((s) => ({
        isOpen: true,
        isMinimized: false,
        tabs: [...s.tabs, newTab],
        activeTabId: id,
        showSplitPreview: lang === 'markdown' ? true : s.showSplitPreview,
      }));
    } catch (err) {
      console.error('Erro ao abrir arquivo no editor:', err);
    }
  },

  openNewUntitledTab: (_defaultDir?: string, language = 'plaintext') => {
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
    set((s) => ({
      isOpen: true,
      isMinimized: false,
      tabs: [...s.tabs, newTab],
      activeTabId: id,
    }));
  },

  closeTab: (id: string) => {
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== id);
      const nextActive =
        s.activeTabId === id
          ? remaining[remaining.length - 1]?.id || null
          : s.activeTabId;
      return {
        tabs: remaining,
        activeTabId: nextActive,
        isOpen: remaining.length > 0 ? s.isOpen : false,
      };
    });
  },

  setActiveTab: (id: string) => set({ activeTabId: id }),

  updateTabContent: (id: string, content: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    }));
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
        const dir = fallbackDir || '.';
        targetPath = await createFile(dir, tab.name);
      }
      await writeTextFile(targetPath, tab.content);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === id
            ? { ...t, path: targetPath, savedContent: t.content }
            : t
        ),
        statusMessage: `Salvo: ${tab.name}`,
      }));
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

    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, content: formatted } : t)),
      statusMessage: 'Documento formatado (Monaco Formatter)',
    }));
  },

  transformActiveTab: (kind) => {
    const { activeTabId, tabs } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const sep = tab.lineEnding === 'CRLF' ? '\r\n' : '\n';
    const lines = tab.content.replace(/\r\n/g, '\n').split('\n');
    let nextLines = lines;

    switch (kind) {
      case 'sortAsc':
        nextLines = [...lines].sort((a, b) => a.localeCompare(b));
        break;
      case 'sortDesc':
        nextLines = [...lines].sort((a, b) => b.localeCompare(a));
        break;
      case 'dedupe':
        nextLines = Array.from(new Set(lines));
        break;
      case 'trimTrailing':
        nextLines = lines.map((l) => l.replace(/[ \t]+$/, ''));
        break;
      case 'upper':
        nextLines = lines.map((l) => l.toUpperCase());
        break;
      case 'lower':
        nextLines = lines.map((l) => l.toLowerCase());
        break;
    }

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, content: nextLines.join(sep) } : t
      ),
    }));
  },

  setEditorOpen: (isOpen) => set({ isOpen, isMinimized: false }),
  setMinimized: (isMinimized) => set({ isMinimized }),
  toggleMaximized: () => set((s) => ({ isMaximized: !s.isMaximized, isMinimized: false })),
  setFontSize: (size) => set({ fontSize: Math.max(10, Math.min(26, size)) }),
  setTabSize: (tabSize) => set({ tabSize }),
  toggleWordWrap: () => set((s) => ({ wordWrap: !s.wordWrap })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleSplitPreview: () => set((s) => ({ showSplitPreview: !s.showSplitPreview })),
  setFindBarOpen: (findBarOpen) => set({ findBarOpen }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
}));

