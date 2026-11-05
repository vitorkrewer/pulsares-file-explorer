import { create } from 'zustand';
import { Entry, listDirectory, cancelListing, subscribeEvent, ListingBatchEvent, ListingDoneEvent } from '../../lib/wails';

export type SortField = 'name' | 'size' | 'type' | 'modTime';
export type SortDirection = 'asc' | 'desc';

interface BrowserState {
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

  // Actions
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
  initListener: () => () => void;
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
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
    const { history, historyIndex, currentPath } = get();
    if (newPath === currentPath) return;

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newPath);

    const requestId = crypto.randomUUID();
    cancelListing('main');

    set({
      currentPath: newPath,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      entries: [],
      isLoading: true,
      error: undefined,
      selectedPaths: new Set(),
      currentRequestId: requestId,
    });

    listDirectory('main', requestId, newPath);
  },

  goBack: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prevPath = history[historyIndex - 1];
      const requestId = crypto.randomUUID();
      cancelListing('main');

      set({
        currentPath: prevPath,
        historyIndex: historyIndex - 1,
        entries: [],
        isLoading: true,
        error: undefined,
        selectedPaths: new Set(),
        currentRequestId: requestId,
      });

      listDirectory('main', requestId, prevPath);
    }
  },

  goForward: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const nextPath = history[historyIndex + 1];
      const requestId = crypto.randomUUID();
      cancelListing('main');

      set({
        currentPath: nextPath,
        historyIndex: historyIndex + 1,
        entries: [],
        isLoading: true,
        error: undefined,
        selectedPaths: new Set(),
        currentRequestId: requestId,
      });

      listDirectory('main', requestId, nextPath);
    }
  },

  goUp: () => {
    const { currentPath, navigateTo } = get();
    if (!currentPath) return;

    // Normalizar separadores
    const normalized = currentPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);

    if (parts.length > 1) {
      parts.pop();
      // Se for Windows ex: C:/
      const isWindows = /^[a-zA-Z]:/.test(normalized);
      const parent = isWindows
        ? (parts.length === 1 ? `${parts[0]}\\` : parts.join('\\'))
        : '/' + parts.join('/');
      navigateTo(parent);
    } else if (parts.length === 1 && /^[a-zA-Z]:/.test(normalized)) {
      // Já está na raiz da unidade
    }
  },

  refresh: () => {
    const { currentPath } = get();
    if (!currentPath) return;
    const requestId = crypto.randomUUID();
    cancelListing('main');

    set({
      entries: [],
      isLoading: true,
      error: undefined,
      selectedPaths: new Set(),
      currentRequestId: requestId,
    });

    listDirectory('main', requestId, currentPath);
  },

  toggleHidden: () => {
    set((state) => ({ showHidden: !state.showHidden }));
  },

  setSort: (field: SortField) => {
    const { sortField, sortDirection } = get();
    if (sortField === field) {
      set({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' });
    } else {
      set({ sortField: field, sortDirection: 'asc' });
    }
  },

  selectItem: (path: string, multi: boolean) => {
    set((state) => {
      const next = multi ? new Set(state.selectedPaths) : new Set<string>();
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { selectedPaths: next };
    });
  },

  clearSelection: () => {
    set({ selectedPaths: new Set() });
  },

  selectAll: () => {
    const { entries, showHidden } = get();
    const visible = entries.filter((e) => showHidden || !e.attrs.hidden);
    set({ selectedPaths: new Set(visible.map((e) => e.location.path)) });
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
      const { currentRequestId } = get();
      if (event.requestId !== currentRequestId) return;

      set({
        isLoading: false,
        error: event.error,
      });
    });

    return () => {
      unsubBatch();
      unsubDone();
    };
  },
}));

