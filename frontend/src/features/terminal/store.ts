import { create } from 'zustand';
import {
  TerminalProfile,
  terminalProfiles,
  terminalStart,
  terminalWrite,
  terminalResize,
  terminalAck,
  terminalKill,
  terminalHasRunningChildren,
  terminalChangeDir,
  terminalQuotePaths,
  expandPath,
  isDirectoryPath,
} from '../../lib/wails';
import { useBrowserStore } from '../browser/store';

export function resolveClientCdCommand(baseCwd: string, rawInput: string): string {
  const line = rawInput.trim();
  if (!line || (!rawInput.includes('\n') && !rawInput.includes('\r'))) {
    return '';
  }

  const isWin = baseCwd.includes('\\') || /^[A-Za-z]:/.test(baseCwd);
  const sep = isWin ? '\\' : '/';

  const resolveRelative = (cwd: string, targetArg: string): string => {
    const cleanArg = targetArg.trim().replace(/^["']+|["']+$/g, '');
    if (!cleanArg) return '';
    if (cleanArg === '~' || cleanArg.startsWith('~/') || cleanArg.startsWith('~\\')) {
      return cleanArg;
    }
    if (/^[A-Za-z]:[/\\]/.test(cleanArg)) {
      return cleanArg.replace(/[/\\]+/g, sep).replace(new RegExp(`\\${sep}+$`), '') || `${cleanArg.slice(0, 2)}${sep}`;
    }
    if (/^[A-Za-z]:$/.test(cleanArg)) {
      return `${cleanArg.toUpperCase()}${sep}`;
    }
    if (cleanArg.startsWith('/')) {
      return cleanArg;
    }
    const cleanBase = (cwd || '').replace(/[/\\]+$/, '');
    const parts = cleanBase ? cleanBase.split(/[/\\]/) : [];
    const relParts = cleanArg.replace(/[/\\]+$/, '').split(/[/\\]/);
    for (const p of relParts) {
      if (!p || p === '.') continue;
      if (p === '..') {
        if (parts.length > 1) parts.pop();
      } else if (p === '...') {
        if (parts.length > 1) parts.pop();
        if (parts.length > 1) parts.pop();
      } else {
        parts.push(p);
      }
    }
    if (parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) {
      return `${parts[0]}${sep}`;
    }
    return parts.join(sep) || (isWin ? `${parts[0] || 'C:'}\\` : '/');
  };

  const parseSegment = (cwd: string, seg: string): string => {
    const s = seg.trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    let arg = '';
    if (lower === 'cd..' || lower === '..') {
      arg = '..';
    } else if (lower === '...') {
      arg = '...';
    } else if (lower === 'cd' || lower === 'sl' || lower === '~') {
      arg = '~';
    } else if (/^[a-z]:$/i.test(s)) {
      arg = `${s.toUpperCase()}\\`;
    } else if (lower.startsWith('cd /d ')) {
      arg = s.slice(6).trim();
    } else if (lower.startsWith('cd -- ')) {
      arg = s.slice(6).trim();
    } else if (lower.startsWith('cd ')) {
      arg = s.slice(3).trim();
    } else if (lower.startsWith('chdir ')) {
      arg = s.slice(6).trim();
    } else if (lower.startsWith('pushd ')) {
      arg = s.slice(6).trim();
    } else if (lower.startsWith('set-location -literalpath ')) {
      arg = s.slice(26).trim();
    } else if (lower.startsWith('set-location -path ')) {
      arg = s.slice(19).trim();
    } else if (lower.startsWith('set-location ')) {
      arg = s.slice(13).trim();
    } else if (lower.startsWith('sl ')) {
      arg = s.slice(3).trim();
    } else {
      return '';
    }
    return resolveRelative(cwd, arg);
  };

  let cur = baseCwd;
  let changed = false;
  const segments = line.split(/[;\r\n]+/);
  for (const seg of segments) {
    for (const sub of seg.split('&&')) {
      const next = parseSegment(cur, sub);
      if (next) {
        cur = next;
        changed = true;
      }
    }
  }
  return changed ? cur : '';
}

export interface TerminalTabSession {
  id: string;
  backendId: string;
  title: string;
  profileId: string;
  cwd: string;
  output: string;
  inputDraft: string;
  exited: boolean;
  exitCode?: number;
}

interface PersistedTerminalMeta {
  visible: boolean;
  height: number;
  defaultProfileId: string;
  followOsc7: boolean;
  fontSize: number;
  scrollbackLines: number;
  tabs: Array<{
    title: string;
    profileId: string;
    cwd: string;
  }>;
}

const STORAGE_KEY = 'pulsares.terminal.state.v1';

function loadPersistedMeta(): Partial<PersistedTerminalMeta> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedTerminalMeta>;
  } catch {
    return {};
  }
}

function savePersistedMeta(meta: PersistedTerminalMeta): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Ignora falhas de armazenamento local
  }
}

function decodeBase64UTF8(b64: string): string {
  try {
    const binString = atob(b64);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0) ?? 0);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function stripAnsiCodes(text: string): string {
  // Remove sequências CSI e OSC mantendo quebras de linha e texto UTF-8 legível
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

interface TerminalStoreState {
  visible: boolean;
  height: number;
  maximized: boolean;
  profiles: TerminalProfile[];
  defaultProfileId: string;
  sessions: TerminalTabSession[];
  activeTabId: string | null;
  splitTabId: string | null;
  followOsc7: boolean;
  fontSize: number;
  scrollbackLines: number;
  searchOpen: boolean;
  searchQuery: string;
  confirmCloseTabId: string | null;
  initialized: boolean;

  initTerminalStore: (initialCwd: string) => Promise<void>;
  togglePanel: (cwdForNew?: string) => Promise<void>;
  setPanelVisible: (visible: boolean) => void;
  setPanelHeight: (height: number) => void;
  toggleMaximized: () => void;
  setDefaultProfile: (profileId: string) => void;
  setFollowOsc7: (enabled: boolean) => void;
  setFontSize: (size: number) => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  createSession: (cwd: string, profileId?: string, customTitle?: string) => Promise<string>;
  setActiveTab: (tabId: string) => void;
  toggleSplitWithTab: (tabId?: string) => void;
  renameTab: (tabId: string, newTitle: string) => void;
  requestCloseTab: (tabId: string, force?: boolean) => Promise<void>;
  closeAllSessions: () => Promise<void>;
  cancelCloseTab: () => void;
  sendInput: (tabId: string, data: string) => Promise<void>;
  setInputDraft: (tabId: string, draft: string) => void;
  appendQuotedPathsToDraft: (tabId: string, paths: string[]) => Promise<void>;
  changeDirectoryInSession: (tabId: string, path: string) => Promise<void>;
  clearOutput: (tabId: string) => void;
  resizeSession: (tabId: string, cols: number, rows: number) => Promise<void>;
  handleBackendData: (backendId: string, chunkB64: string, rawLen: number, cwdOsc7?: string) => void;
  handleBackendExit: (backendId: string, exitCode: number) => void;
}

export const MAX_TERMINAL_SESSIONS = 10;
const persisted = loadPersistedMeta();
let initPromise: Promise<void> | null = null;
let initialSessionCreating = false;

export const useTerminalStore = create<TerminalStoreState>((set, get) => {
  const persistSnapshot = () => {
    const st = get();
    savePersistedMeta({
      visible: st.visible,
      height: st.height,
      defaultProfileId: st.defaultProfileId,
      followOsc7: st.followOsc7,
      fontSize: st.fontSize,
      scrollbackLines: st.scrollbackLines,
      // Persiste apenas a sessão ativa para nunca abrir múltiplos terminais na inicialização
      tabs: st.sessions
        .filter((s) => s.id === st.activeTabId)
        .slice(0, 1)
        .map((s) => ({
          title: s.title,
          profileId: s.profileId,
          cwd: s.cwd,
        })),
    });
  };

  return {
    visible: persisted.visible ?? false,
    height: persisted.height ?? 260,
    maximized: false,
    profiles: [],
    defaultProfileId: persisted.defaultProfileId ?? '',
    sessions: [],
    activeTabId: null,
    splitTabId: null,
    followOsc7: false,
    fontSize: persisted.fontSize ?? 13,
    scrollbackLines: persisted.scrollbackLines ?? 2000,
    searchOpen: false,
    searchQuery: '',
    confirmCloseTabId: null,
    initialized: false,

    initTerminalStore: async (initialCwd: string) => {
      if (get().initialized) return;
      if (initPromise) {
        await initPromise;
        return;
      }

      set({ initialized: true });
      initPromise = (async () => {
        const detected = await terminalProfiles();
        const defId =
          persisted.defaultProfileId && detected.some((p) => p.id === persisted.defaultProfileId)
            ? persisted.defaultProfileId
            : detected[0]?.id || 'pwsh';

        set({
          profiles: detected,
          defaultProfileId: defId,
          initialized: true,
        });

        // Se o painel estava visível, cria apenas 1 sessão limpa (sem multiplicar abas)
        if (persisted.visible && get().sessions.length === 0 && !initialSessionCreating) {
          initialSessionCreating = true;
          try {
            const firstSaved = persisted.tabs?.[0];
            await get().createSession(
              firstSaved?.cwd || initialCwd || '/',
              firstSaved?.profileId || defId,
              firstSaved?.title
            );
          } finally {
            initialSessionCreating = false;
          }
        }
      })();

      await initPromise;
    },

    togglePanel: async (cwdForNew?: string) => {
      const nextVisible = !get().visible;
      set({ visible: nextVisible });
      if (nextVisible && get().sessions.length === 0 && !initialSessionCreating) {
        initialSessionCreating = true;
        try {
          await get().createSession(cwdForNew || '/');
        } finally {
          initialSessionCreating = false;
        }
      }
      persistSnapshot();
    },

    setPanelVisible: (visible) => {
      set({ visible });
      persistSnapshot();
    },

    setPanelHeight: (height) => {
      const clamped = Math.max(140, Math.min(720, height));
      set({ height: clamped });
      persistSnapshot();
    },

    toggleMaximized: () => {
      set((s) => ({ maximized: !s.maximized }));
    },

    setDefaultProfile: (profileId) => {
      set({ defaultProfileId: profileId });
      persistSnapshot();
    },

    setFollowOsc7: (enabled) => {
      set({ followOsc7: enabled });
      persistSnapshot();
    },

    setFontSize: (size) => {
      const clamped = Math.max(10, Math.min(22, size));
      set({ fontSize: clamped });
      persistSnapshot();
    },

    setSearchOpen: (open) => set({ searchOpen: open }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    createSession: async (cwd: string, profileId?: string, customTitle?: string) => {
      if (!get().initialized && initPromise) {
        await initPromise;
      } else if (!get().initialized) {
        const detected = await terminalProfiles();
        const defId = detected[0]?.id || 'pwsh';
        set({ profiles: detected, defaultProfileId: defId, initialized: true });
      }
      const st = get();
      if (st.sessions.length >= MAX_TERMINAL_SESSIONS) {
        const existingId = st.activeTabId || st.sessions[st.sessions.length - 1]?.id || '';
        return existingId;
      }
      const chosenId = profileId || st.defaultProfileId || st.profiles[0]?.id || 'pwsh';
      const profile = st.profiles.find((p) => p.id === chosenId) || st.profiles[0];
      const backendId = await terminalStart(chosenId, cwd, 110, 28);
      const id = `ui-term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const title = customTitle || (profile ? profile.name : chosenId);

      const newSession: TerminalTabSession = {
        id,
        backendId,
        title,
        profileId: chosenId,
        cwd,
        output: '',
        inputDraft: '',
        exited: false,
      };

      set((prev) => ({
        visible: true,
        sessions: [...prev.sessions, newSession],
        activeTabId: id,
      }));
      persistSnapshot();
      return id;
    },

    setActiveTab: (tabId) => {
      set({ activeTabId: tabId });
    },

    toggleSplitWithTab: (tabId) => {
      const st = get();
      if (st.splitTabId) {
        set({ splitTabId: null });
        return;
      }
      const candidate =
        tabId || st.sessions.find((s) => s.id !== st.activeTabId)?.id || null;
      set({ splitTabId: candidate });
    },

    renameTab: (tabId, newTitle) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      set((prev) => ({
        sessions: prev.sessions.map((s) => (s.id === tabId ? { ...s, title: trimmed } : s)),
      }));
      persistSnapshot();
    },

    requestCloseTab: async (tabId, force = false) => {
      const sess = get().sessions.find((s) => s.id === tabId);
      if (!sess) return;

      if (!force && !sess.exited) {
        const hasChildren = await terminalHasRunningChildren(sess.backendId);
        if (hasChildren) {
          set({ confirmCloseTabId: tabId });
          return;
        }
      }

      await terminalKill(sess.backendId);
      set((prev) => {
        const remaining = prev.sessions.filter((s) => s.id !== tabId);
        const nextActive =
          prev.activeTabId === tabId
            ? remaining[remaining.length - 1]?.id || null
            : prev.activeTabId;
        const nextSplit = prev.splitTabId === tabId ? null : prev.splitTabId;
        return {
          sessions: remaining,
          activeTabId: nextActive,
          splitTabId: nextSplit,
          confirmCloseTabId: null,
          visible: remaining.length > 0 ? prev.visible : false,
        };
      });
      persistSnapshot();
    },

    closeAllSessions: async () => {
      const currentSessions = [...get().sessions];
      for (const s of currentSessions) {
        try {
          await terminalKill(s.backendId);
        } catch {
          // Ignora erro ao encerrar processo já finalizado
        }
      }
      set({
        sessions: [],
        activeTabId: null,
        splitTabId: null,
        confirmCloseTabId: null,
        visible: false,
      });
      persistSnapshot();
    },

    cancelCloseTab: () => set({ confirmCloseTabId: null }),

    sendInput: async (tabId, data) => {
      const sess = get().sessions.find((s) => s.id === tabId);
      if (!sess || sess.exited) return;
      await terminalWrite(sess.backendId, data);

      const baseCwd =
        sess.cwd && sess.cwd !== '/'
          ? sess.cwd
          : useBrowserStore.getState().currentPath || sess.cwd;
      const candidate = resolveClientCdCommand(baseCwd, data);
      if (candidate) {
        try {
          const expanded = await expandPath(candidate);
          const targetPath = expanded || candidate;
          if (await isDirectoryPath(targetPath)) {
            set((prev) => ({
              sessions: prev.sessions.map((s) =>
                s.id === tabId ? { ...s, cwd: targetPath } : s
              ),
            }));
            persistSnapshot();
            if (get().followOsc7 && get().activeTabId === tabId) {
              useBrowserStore.getState().navigateTo(targetPath);
            }
          }
        } catch {
          // ignora caminho inválido
        }
      }
    },

    setInputDraft: (tabId, draft) => {
      set((prev) => ({
        sessions: prev.sessions.map((s) => (s.id === tabId ? { ...s, inputDraft: draft } : s)),
      }));
    },

    appendQuotedPathsToDraft: async (tabId, paths) => {
      const sess = get().sessions.find((s) => s.id === tabId);
      if (!sess || paths.length === 0) return;
      const quoted = await terminalQuotePaths(sess.backendId, paths);
      set((prev) => ({
        sessions: prev.sessions.map((s) => {
          if (s.id !== tabId) return s;
          const sep = s.inputDraft && !s.inputDraft.endsWith(' ') ? ' ' : '';
          return { ...s, inputDraft: `${s.inputDraft}${sep}${quoted}` };
        }),
      }));
    },

    changeDirectoryInSession: async (tabId, path) => {
      const sess = get().sessions.find((s) => s.id === tabId);
      if (!sess) return;
      await terminalChangeDir(sess.backendId, path);
      set((prev) => ({
        sessions: prev.sessions.map((s) => (s.id === tabId ? { ...s, cwd: path } : s)),
      }));
      persistSnapshot();
      if (get().followOsc7 && get().activeTabId === tabId && path) {
        useBrowserStore.getState().navigateTo(path);
      }
    },

    clearOutput: (tabId) => {
      set((prev) => ({
        sessions: prev.sessions.map((s) => (s.id === tabId ? { ...s, output: '' } : s)),
      }));
    },

    resizeSession: async (tabId, cols, rows) => {
      const sess = get().sessions.find((s) => s.id === tabId);
      if (!sess) return;
      await terminalResize(sess.backendId, cols, rows);
    },

    handleBackendData: (backendId, chunkB64, rawLen, cwdOsc7) => {
      const decoded = chunkB64 ? stripAnsiCodes(decodeBase64UTF8(chunkB64)) : '';
      if (rawLen > 0) {
        void terminalAck(backendId, rawLen);
      }

      let promptCwd = cwdOsc7 || '';
      if (!promptCwd && decoded) {
        const psMatches = Array.from(decoded.matchAll(/PS\s+([A-Za-z]:\\[^\r\n>]+?)>/g));
        if (psMatches.length > 0) {
          promptCwd = psMatches[psMatches.length - 1][1].trim();
        } else {
          const cmdMatches = Array.from(decoded.matchAll(/(?:^|\n)([A-Za-z]:\\[^\r\n>]+?)>/g));
          if (cmdMatches.length > 0) {
            promptCwd = cmdMatches[cmdMatches.length - 1][1].trim();
          }
        }
      }

      const maxLines = get().scrollbackLines;
      let isActiveSession = false;
      set((prev) => ({
        sessions: prev.sessions.map((s) => {
          if (s.backendId !== backendId) return s;
          if (s.id === prev.activeTabId) {
            isActiveSession = true;
          }
          const combined = decoded ? s.output + decoded : s.output;
          const lines = combined.split('\n');
          const trimmed =
            lines.length > maxLines ? lines.slice(lines.length - maxLines).join('\n') : combined;
          return {
            ...s,
            output: trimmed,
            cwd: promptCwd || s.cwd,
          };
        }),
      }));

      if (promptCwd && get().followOsc7 && isActiveSession) {
        useBrowserStore.getState().navigateTo(promptCwd);
      }
    },

    handleBackendExit: (backendId, exitCode) => {
      set((prev) => ({
        sessions: prev.sessions.map((s) =>
          s.backendId === backendId ? { ...s, exited: true, exitCode } : s
        ),
      }));
    },
  };
});

