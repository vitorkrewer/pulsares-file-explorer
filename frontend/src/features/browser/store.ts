import { create } from 'zustand';
import {
  Entry,
  listDirectory,
  cancelListing,
  subscribeEvent,
  ListingBatchEvent,
  ListingDoneEvent,
  saveSession,
} from '../../lib/wails';

export type SortField = 'name' | 'size' | 'type' | 'modTime';
export type SortDirection = 'asc' | 'desc';

export interface TabState {
  id: string;
  path: string;
  history: string[];
  historyIndex: number;
  pinned: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  showHidden: boolean;
  selectedPaths: string[];
}

export interface PersistedSession {
  activeTabId: string;
  tabs: TabState[];
  closedTabs: TabState[];
  sidebar?: {
    visible: boolean;
    width: number;
    followActiveTab: boolean;
    expandedPaths: string[];
  };
}

const MAX_CLOSED_TABS = 25;
const MAX_LRU_CACHED_TABS = 10;

// Cache LRU em memória para listagens de abas inativas (troca de aba < 50 ms)
const lruCache = new Map<string, Entry[]>();

function putLruCache(key: string, entries: Entry[]) {
  if (!key) return;
  if (lruCache.has(key)) {
    lruCache.delete(key);
  }
  lruCache.set(key, entries);
  if (lruCache.size > MAX_LRU_CACHED_TABS) {
    const oldestKey = lruCache.keys().next().value;
    if (oldestKey !== undefined) {
      lruCache.delete(oldestKey);
    }
  }
}

function getLruCache(key: string): Entry[] | undefined {
  const val = lruCache.get(key);
  if (val !== undefined) {
    lruCache.delete(key);
    lruCache.set(key, val);
  }
  return val;
}

let saveSessionTimer: ReturnType<typeof setTimeout> | null = null;
let sidebarStateGetter: (() => PersistedSession['sidebar']) | null = null;

export function registerSidebarStateGetter(fn: () => PersistedSession['sidebar']) {
  sidebarStateGetter = fn;
}

export function triggerSessionSave() {
  if (saveSessionTimer) {
    clearTimeout(saveSessionTimer);
  }
  saveSessionTimer = setTimeout(() => {
    const state = useBrowserStore.getState();
    const payload: PersistedSession = {
      activeTabId: state.activeTabId,
      tabs: state.tabs.map((t) =>
        t.id === state.activeTabId
          ? {
              ...t,
              path: state.currentPath,
              history: state.history,
              historyIndex: state.historyIndex,
              showHidden: state.showHidden,
              sortField: state.sortField,
              sortDirection: state.sortDirection,
              selectedPaths: Array.from(state.selectedPaths),
            }
          : t
      ),
      closedTabs: state.closedTabs,
      sidebar: sidebarStateGetter ? sidebarStateGetter() : undefined,
    };
    saveSession(JSON.stringify(payload));
  }, 400);
}

function createTabState(path: string, partial?: Partial<TabState>): TabState {
  return {
    id: partial?.id || crypto.randomUUID(),
    path,
    history: partial?.history?.length ? partial.history : path ? [path] : [],
    historyIndex: partial?.historyIndex ?? (path ? 0 : -1),
    pinned: partial?.pinned ?? false,
    sortField: partial?.sortField ?? 'name',
    sortDirection: partial?.sortDirection ?? 'asc',
    showHidden: partial?.showHidden ?? false,
    selectedPaths: partial?.selectedPaths ?? [],
  };
}

export function getTabLabel(path: string): string {
  if (!path) return '...';
  const normalized = path.replace(/\\/g, '/');
  if (normalized === '/') return '/';
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return path;
  if (parts.length === 1 && /^[a-zA-Z]:$/.test(parts[0])) {
    return `${parts[0]}\\`;
  }
  return parts[parts.length - 1];
}

interface BrowserState {
  tabs: TabState[];
  activeTabId: string;
  closedTabs: TabState[];

  // Estado da aba ativa (mantido no topo para compatibilidade direta com os componentes)
  currentPath: string;
  history: string[];
  historyIndex: number;
  entries: Entry[];
  isLoading: boolean;
  error?: string;
  showHidden: boolean;
  selectedPaths: Set<string>;
  sortField: SortField;
  sortDirection: SortDirection;
  currentRequestId: string;

  // Navegação na aba ativa
  navigateTo: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  refresh: () => void;
  toggleHidden: () => void;
  setSort: (field: SortField) => void;
  selectItem: (path: string, multi: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Gestão de abas e sessão (0.2.0)
  newTab: (path?: string) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  duplicateTab: (tabId: string) => void;
  togglePinTab: (tabId: string) => void;
  reopenClosedTab: () => void;
  switchTab: (tabId: string) => void;
  nextTab: (reverse?: boolean) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  hydrateSession: (rawJson: string | undefined, fallbackPath: string) => PersistedSession['sidebar'];
  initListener: () => () => void;
}

const initialTab = createTabState('', { id: 'tab-initial' });

export const useBrowserStore = create<BrowserState>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  closedTabs: [],

  currentPath: '',
  history: [],
  historyIndex: -1,
  entries: [],
  isLoading: false,
  error: undefined,
  showHidden: false,
  selectedPaths: new Set(),
  sortField: 'name',
  sortDirection: 'asc',
  currentRequestId: '',

  navigateTo: (newPath: string) => {
    const { history, historyIndex, currentPath, activeTabId, tabs, entries } = get();
    if (!newPath || newPath === currentPath) return;

    if (currentPath && entries.length > 0) {
      putLruCache(`${activeTabId}:${currentPath}`, entries);
    }

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newPath);

    const requestId = crypto.randomUUID();
    cancelListing(activeTabId);

    const updatedTabs = tabs.map((t) =>
      t.id === activeTabId
        ? {
            ...t,
            path: newPath,
            history: newHistory,
            historyIndex: newHistory.length - 1,
            selectedPaths: [],
          }
        : t
    );

    set({
      tabs: updatedTabs,
      currentPath: newPath,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      entries: [],
      isLoading: true,
      error: undefined,
      selectedPaths: new Set(),
      currentRequestId: requestId,
    });

    listDirectory(activeTabId, requestId, newPath);
    triggerSessionSave();
  },

  goBack: () => {
    const { history, historyIndex, activeTabId, tabs, currentPath, entries } = get();
    if (historyIndex > 0) {
      if (currentPath && entries.length > 0) {
        putLruCache(`${activeTabId}:${currentPath}`, entries);
      }
      const prevPath = history[historyIndex - 1];
      const nextIdx = historyIndex - 1;
      const requestId = crypto.randomUUID();
      cancelListing(activeTabId);

      const updatedTabs = tabs.map((t) =>
        t.id === activeTabId ? { ...t, path: prevPath, historyIndex: nextIdx, selectedPaths: [] } : t
      );

      set({
        tabs: updatedTabs,
        currentPath: prevPath,
        historyIndex: nextIdx,
        entries: [],
        isLoading: true,
        error: undefined,
        selectedPaths: new Set(),
        currentRequestId: requestId,
      });

      listDirectory(activeTabId, requestId, prevPath);
      triggerSessionSave();
    }
  },

  goForward: () => {
    const { history, historyIndex, activeTabId, tabs, currentPath, entries } = get();
    if (historyIndex < history.length - 1) {
      if (currentPath && entries.length > 0) {
        putLruCache(`${activeTabId}:${currentPath}`, entries);
      }
      const nextPath = history[historyIndex + 1];
      const nextIdx = historyIndex + 1;
      const requestId = crypto.randomUUID();
      cancelListing(activeTabId);

      const updatedTabs = tabs.map((t) =>
        t.id === activeTabId ? { ...t, path: nextPath, historyIndex: nextIdx, selectedPaths: [] } : t
      );

      set({
        tabs: updatedTabs,
        currentPath: nextPath,
        historyIndex: nextIdx,
        entries: [],
        isLoading: true,
        error: undefined,
        selectedPaths: new Set(),
        currentRequestId: requestId,
      });

      listDirectory(activeTabId, requestId, nextPath);
      triggerSessionSave();
    }
  },

  goUp: () => {
    const { currentPath, navigateTo } = get();
    if (!currentPath) return;

    const normalized = currentPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);

    if (parts.length > 1) {
      parts.pop();
      const isWindows = /^[a-zA-Z]:/.test(normalized);
      const parent = isWindows
        ? parts.length === 1
          ? `${parts[0]}\\`
          : parts.join('\\')
        : '/' + parts.join('/');
      navigateTo(parent);
    }
  },

  refresh: () => {
    const { currentPath, activeTabId } = get();
    if (!currentPath) return;
    const requestId = crypto.randomUUID();
    cancelListing(activeTabId);

    set({
      entries: [],
      isLoading: true,
      error: undefined,
      selectedPaths: new Set(),
      currentRequestId: requestId,
    });

    listDirectory(activeTabId, requestId, currentPath);
  },

  toggleHidden: () => {
    set((state) => {
      const nextHidden = !state.showHidden;
      const updatedTabs = state.tabs.map((t) =>
        t.id === state.activeTabId ? { ...t, showHidden: nextHidden } : t
      );
      return { showHidden: nextHidden, tabs: updatedTabs };
    });
    triggerSessionSave();
  },

  setSort: (field: SortField) => {
    const { sortField, sortDirection, activeTabId, tabs } = get();
    const nextDir: SortDirection =
      sortField === field ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc';
    const updatedTabs = tabs.map((t) =>
      t.id === activeTabId ? { ...t, sortField: field, sortDirection: nextDir } : t
    );
    set({ sortField: field, sortDirection: nextDir, tabs: updatedTabs });
    triggerSessionSave();
  },

  selectItem: (path: string, multi: boolean) => {
    set((state) => {
      const next = multi ? new Set(state.selectedPaths) : new Set<string>();
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      const updatedTabs = state.tabs.map((t) =>
        t.id === state.activeTabId ? { ...t, selectedPaths: Array.from(next) } : t
      );
      return { selectedPaths: next, tabs: updatedTabs };
    });
  },

  clearSelection: () => {
    set((state) => ({
      selectedPaths: new Set(),
      tabs: state.tabs.map((t) => (t.id === state.activeTabId ? { ...t, selectedPaths: [] } : t)),
    }));
  },

  selectAll: () => {
    const { entries, showHidden, activeTabId, tabs } = get();
    const visible = entries.filter((e) => showHidden || !e.attrs.hidden);
    const paths = visible.map((e) => e.location.path);
    set({
      selectedPaths: new Set(paths),
      tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, selectedPaths: paths } : t)),
    });
  },

  newTab: (targetPath?: string) => {
    const state = get();
    const path = targetPath || state.currentPath || '/';

    if (state.currentPath && state.entries.length > 0) {
      putLruCache(`${state.activeTabId}:${state.currentPath}`, state.entries);
    }
    cancelListing(state.activeTabId);

    const syncedTabs = state.tabs.map((t) =>
      t.id === state.activeTabId
        ? {
            ...t,
            path: state.currentPath,
            history: state.history,
            historyIndex: state.historyIndex,
            showHidden: state.showHidden,
            sortField: state.sortField,
            sortDirection: state.sortDirection,
            selectedPaths: Array.from(state.selectedPaths),
          }
        : t
    );

    const created = createTabState(path, {
      showHidden: state.showHidden,
      sortField: state.sortField,
      sortDirection: state.sortDirection,
    });
    const requestId = crypto.randomUUID();

    set({
      tabs: [...syncedTabs, created],
      activeTabId: created.id,
      currentPath: created.path,
      history: created.history,
      historyIndex: created.historyIndex,
      showHidden: created.showHidden,
      sortField: created.sortField,
      sortDirection: created.sortDirection,
      selectedPaths: new Set(),
      entries: [],
      isLoading: true,
      error: undefined,
      currentRequestId: requestId,
    });

    listDirectory(created.id, requestId, created.path);
    triggerSessionSave();
  },

  switchTab: (tabId: string) => {
    const state = get();
    if (tabId === state.activeTabId) return;

    const target = state.tabs.find((t) => t.id === tabId);
    if (!target) return;

    // Salvar listagem atual no cache LRU antes de trocar
    if (state.currentPath && state.entries.length > 0) {
      putLruCache(`${state.activeTabId}:${state.currentPath}`, state.entries);
    }
    cancelListing(state.activeTabId);

    const syncedTabs = state.tabs.map((t) =>
      t.id === state.activeTabId
        ? {
            ...t,
            path: state.currentPath,
            history: state.history,
            historyIndex: state.historyIndex,
            showHidden: state.showHidden,
            sortField: state.sortField,
            sortDirection: state.sortDirection,
            selectedPaths: Array.from(state.selectedPaths),
          }
        : t
    );

    const cachedEntries = getLruCache(`${target.id}:${target.path}`);
    const requestId = crypto.randomUUID();

    set({
      tabs: syncedTabs,
      activeTabId: target.id,
      currentPath: target.path,
      history: target.history,
      historyIndex: target.historyIndex,
      showHidden: target.showHidden,
      sortField: target.sortField,
      sortDirection: target.sortDirection,
      selectedPaths: new Set(target.selectedPaths),
      entries: cachedEntries ?? [],
      isLoading: !cachedEntries,
      error: undefined,
      currentRequestId: cachedEntries ? '' : requestId,
    });

    if (!cachedEntries && target.path) {
      listDirectory(target.id, requestId, target.path);
    }
    triggerSessionSave();
  },

  nextTab: (reverse = false) => {
    const { tabs, activeTabId, switchTab } = get();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx === -1) return;
    const nextIdx = reverse ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length;
    switchTab(tabs[nextIdx].id);
  },

  closeTab: (tabId: string) => {
    const state = get();
    if (state.tabs.length <= 1) return; // Mantém ao menos uma aba aberta

    const idx = state.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const closingTab =
      tabId === state.activeTabId
        ? {
            ...state.tabs[idx],
            path: state.currentPath,
            history: state.history,
            historyIndex: state.historyIndex,
            showHidden: state.showHidden,
            sortField: state.sortField,
            sortDirection: state.sortDirection,
          }
        : state.tabs[idx];

    cancelListing(tabId);
    const nextClosed = [closingTab, ...state.closedTabs].slice(0, MAX_CLOSED_TABS);
    const remaining = state.tabs.filter((t) => t.id !== tabId);

    if (tabId !== state.activeTabId) {
      set({ tabs: remaining, closedTabs: nextClosed });
      triggerSessionSave();
      return;
    }

    const nextActive = remaining[Math.min(idx, remaining.length - 1)];
    const cachedEntries = getLruCache(`${nextActive.id}:${nextActive.path}`);
    const requestId = crypto.randomUUID();

    set({
      tabs: remaining,
      closedTabs: nextClosed,
      activeTabId: nextActive.id,
      currentPath: nextActive.path,
      history: nextActive.history,
      historyIndex: nextActive.historyIndex,
      showHidden: nextActive.showHidden,
      sortField: nextActive.sortField,
      sortDirection: nextActive.sortDirection,
      selectedPaths: new Set(nextActive.selectedPaths),
      entries: cachedEntries ?? [],
      isLoading: !cachedEntries,
      error: undefined,
      currentRequestId: cachedEntries ? '' : requestId,
    });

    if (!cachedEntries && nextActive.path) {
      listDirectory(nextActive.id, requestId, nextActive.path);
    }
    triggerSessionSave();
  },

  closeOtherTabs: (tabId: string) => {
    const state = get();
    const keep = state.tabs.filter((t) => t.id === tabId || t.pinned);
    const removed = state.tabs.filter((t) => t.id !== tabId && !t.pinned);
    if (removed.length === 0) return;

    const nextClosed = [...removed, ...state.closedTabs].slice(0, MAX_CLOSED_TABS);
    set({ tabs: keep, closedTabs: nextClosed });
    if (state.activeTabId !== tabId) {
      get().switchTab(tabId);
    } else {
      triggerSessionSave();
    }
  },

  closeTabsToRight: (tabId: string) => {
    const state = get();
    const idx = state.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1 || idx === state.tabs.length - 1) return;

    const keep = state.tabs.filter((t, i) => i <= idx || t.pinned);
    const removed = state.tabs.filter((t, i) => i > idx && !t.pinned);
    if (removed.length === 0) return;

    const nextClosed = [...removed, ...state.closedTabs].slice(0, MAX_CLOSED_TABS);
    const activeStillExists = keep.some((t) => t.id === state.activeTabId);

    set({ tabs: keep, closedTabs: nextClosed });
    if (!activeStillExists) {
      get().switchTab(tabId);
    } else {
      triggerSessionSave();
    }
  },

  duplicateTab: (tabId: string) => {
    const state = get();
    const idx = state.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const source =
      tabId === state.activeTabId
        ? {
            ...state.tabs[idx],
            path: state.currentPath,
            history: state.history,
            historyIndex: state.historyIndex,
            showHidden: state.showHidden,
            sortField: state.sortField,
            sortDirection: state.sortDirection,
          }
        : state.tabs[idx];

    const copy = createTabState(source.path, {
      history: [...source.history],
      historyIndex: source.historyIndex,
      showHidden: source.showHidden,
      sortField: source.sortField,
      sortDirection: source.sortDirection,
      pinned: false,
    });

    const nextTabs = [...state.tabs];
    nextTabs.splice(idx + 1, 0, copy);
    set({ tabs: nextTabs });
    get().switchTab(copy.id);
  },

  togglePinTab: (tabId: string) => {
    set((state) => {
      const updated = state.tabs.map((t) => (t.id === tabId ? { ...t, pinned: !t.pinned } : t));
      // Abas fixadas ficam sempre à esquerda
      const pinned = updated.filter((t) => t.pinned);
      const unpinned = updated.filter((t) => !t.pinned);
      return { tabs: [...pinned, ...unpinned] };
    });
    triggerSessionSave();
  },

  reopenClosedTab: () => {
    const state = get();
    if (state.closedTabs.length === 0) return;
    const [restored, ...restClosed] = state.closedTabs;
    const revived = createTabState(restored.path, {
      ...restored,
      id: crypto.randomUUID(),
    });
    set({
      tabs: [...state.tabs, revived],
      closedTabs: restClosed,
    });
    get().switchTab(revived.id);
  },

  moveTab: (fromIndex: number, toIndex: number) => {
    const { tabs } = get();
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= tabs.length || toIndex >= tabs.length) {
      return;
    }
    const next = [...tabs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set({ tabs: next });
    triggerSessionSave();
  },

  hydrateSession: (rawJson: string | undefined, fallbackPath: string) => {
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson) as PersistedSession;
        if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          const validTabs = parsed.tabs.map((t) =>
            createTabState(t.path || fallbackPath, t)
          );
          const active =
            validTabs.find((t) => t.id === parsed.activeTabId) || validTabs[0];
          const requestId = crypto.randomUUID();

          set({
            tabs: validTabs,
            activeTabId: active.id,
            closedTabs: Array.isArray(parsed.closedTabs) ? parsed.closedTabs : [],
            currentPath: active.path,
            history: active.history,
            historyIndex: active.historyIndex,
            showHidden: active.showHidden,
            sortField: active.sortField,
            sortDirection: active.sortDirection,
            selectedPaths: new Set(active.selectedPaths || []),
            entries: [],
            isLoading: true,
            error: undefined,
            currentRequestId: requestId,
          });

          listDirectory(active.id, requestId, active.path);
          return parsed.sidebar;
        }
      } catch {
        // Ignorar JSON corrompido e usar fallback
      }
    }

    const first = createTabState(fallbackPath);
    const requestId = crypto.randomUUID();
    set({
      tabs: [first],
      activeTabId: first.id,
      currentPath: first.path,
      history: first.history,
      historyIndex: first.historyIndex,
      entries: [],
      isLoading: true,
      error: undefined,
      currentRequestId: requestId,
    });
    listDirectory(first.id, requestId, first.path);
    return undefined;
  },

  initListener: () => {
    const unsubBatch = subscribeEvent<ListingBatchEvent>('listing:batch', (event) => {
      const { currentRequestId } = get();
      if (event.requestId !== currentRequestId) return;

      set((state) => ({
        entries: [...state.entries, ...event.entries],
      }));
    });

    const unsubDone = subscribeEvent<ListingDoneEvent>('listing:done', (event) => {
      const { currentRequestId, activeTabId, currentPath } = get();
      if (event.requestId !== currentRequestId) return;

      set((state) => {
        if (!event.error && currentPath && state.entries.length > 0) {
          putLruCache(`${activeTabId}:${currentPath}`, state.entries);
        }
        return {
          isLoading: false,
          error: event.error,
        };
      });
    });

    return () => {
      unsubBatch();
      unsubDone();
    };
  },
}));
