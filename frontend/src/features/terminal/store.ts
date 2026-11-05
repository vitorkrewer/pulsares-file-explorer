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
} from '../../lib/wails';

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

const persisted = loadPersistedMeta();

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
      tabs: st.sessions.map((s) => ({
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
    followOsc7: persisted.followOsc7 ?? false,
    fontSize: persisted.fontSize ?? 13,
    scrollbackLines: persisted.scrollbackLines ?? 2000,
    searchOpen: false,
    searchQuery: '',
    confirmCloseTabId: null,
    initialized: false,

    initTerminalStore: async (initialCwd: string) => {
      if (get().initialized) return;
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

      // Se havia abas persistidas e o painel estava visível, restaura metadados abrindo sessões limpas
      if (persisted.tabs && persisted.tabs.length > 0 && persisted.visible) {
        for (const savedTab of persisted.tabs.slice(0, 6)) {
          await get().createSession(savedTab.cwd || initialCwd, savedTab.profileId || defId, savedTab.title);
        }
      }
    },

    togglePanel: async (cwdForNew?: string) => {
      const nextVisible = !get().visible;
      set({ visible: nextVisible });
      if (nextVisible && get().sessions.length === 0) {
        await get().createSession(cwdForNew || '/');
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
      if (!get().initialized) {
        await get().initTerminalStore(cwd);
      }
      const st = get();
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

    cancelCloseTab: () => set({ confirmCloseTabId: null }),

    sendInput: async (tabId, data) => {
      const sess = get().sessions.find((s) => s.id === tabId);
      if (!sess || sess.exited) return;
      await terminalWrite(sess.backendId, data);
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
      const decoded = stripAnsiCodes(decodeBase64UTF8(chunkB64));
      void terminalAck(backendId, rawLen);

      const maxLines = get().scrollbackLines;
      set((prev) => ({
        sessions: prev.sessions.map((s) => {
          if (s.backendId !== backendId) return s;
          const combined = s.output + decoded;
          const lines = combined.split('\n');
          const trimmed =
            lines.length > maxLines ? lines.slice(lines.length - maxLines).join('\n') : combined;
          return {
            ...s,
            output: trimmed,
            cwd: cwdOsc7 || s.cwd,
          };
        }),
      }));
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
