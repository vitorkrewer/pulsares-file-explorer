import { create } from 'zustand';
import {
  SearchOptions,
  SearchResultItem,
  IndexedRoot,
  SavedSearch,
  startSearch,
  cancelSearch,
  indexDirectory,
  listIndexRoots,
  removeIndexRoot,
  saveSearch,
  listSavedSearches,
  deleteSavedSearch,
} from '../../lib/wails';

interface SearchStoreState {
  drawerOpen: boolean;
  query: string;
  useRegex: boolean;
  extensionsText: string;
  kindFilter: string; // "" | "file" | "dir"
  minSizeKB: string;
  maxSizeKB: string;
  modifiedAfter: string;
  modifiedBefore: string;
  contentQuery: string;
  useIndex: boolean;

  isSearching: boolean;
  requestId: string;
  results: SearchResultItem[];
  selectedResultPaths: Set<string>;
  lastSelectedResultPath: string | null;
  savedSearches: SavedSearch[];
  error?: string;

  indexedRoots: IndexedRoot[];
  indexingRoot: boolean;

  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  setQuery: (q: string) => void;
  setUseRegex: (v: boolean) => void;
  setExtensionsText: (v: string) => void;
  setKindFilter: (v: string) => void;
  setMinSizeKB: (v: string) => void;
  setMaxSizeKB: (v: string) => void;
  setModifiedAfter: (v: string) => void;
  setModifiedBefore: (v: string) => void;
  setContentQuery: (v: string) => void;
  setUseIndex: (v: boolean) => void;
  resetFilters: () => void;

  selectResultItem: (path: string, multi: boolean, range?: boolean) => void;
  selectAllResults: () => void;
  clearResultSelection: () => void;

  loadSavedSearches: () => Promise<void>;
  saveCurrentSearchPreset: (name: string) => Promise<void>;
  applySavedSearchPreset: (preset: SavedSearch) => void;
  removeSavedSearchPreset: (id: number) => Promise<void>;

  runSearch: (rootPath: string, includeHidden: boolean) => Promise<void>;
  stopSearch: () => Promise<void>;
  appendBatch: (reqId: string, batch: SearchResultItem[]) => void;
  finishSearch: (reqId: string, error?: string) => void;

  refreshIndexedRoots: () => Promise<void>;
  indexCurrentRoot: (rootPath: string) => Promise<void>;
  deleteIndexedRoot: (rootPath: string) => Promise<void>;
}

export const useSearchStore = create<SearchStoreState>((set, get) => ({
  drawerOpen: false,
  query: '',
  useRegex: false,
  extensionsText: '',
  kindFilter: '',
  minSizeKB: '',
  maxSizeKB: '',
  modifiedAfter: '',
  modifiedBefore: '',
  contentQuery: '',
  useIndex: true,

  isSearching: false,
  requestId: '',
  results: [],
  selectedResultPaths: new Set(),
  lastSelectedResultPath: null,
  savedSearches: [],
  error: undefined,

  indexedRoots: [],
  indexingRoot: false,

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setQuery: (query) => set({ query }),
  setUseRegex: (useRegex) => set({ useRegex }),
  setExtensionsText: (extensionsText) => set({ extensionsText }),
  setKindFilter: (kindFilter) => set({ kindFilter }),
  setMinSizeKB: (minSizeKB) => set({ minSizeKB }),
  setMaxSizeKB: (maxSizeKB) => set({ maxSizeKB }),
  setModifiedAfter: (modifiedAfter) => set({ modifiedAfter }),
  setModifiedBefore: (modifiedBefore) => set({ modifiedBefore }),
  setContentQuery: (contentQuery) => set({ contentQuery }),
  setUseIndex: (useIndex) => set({ useIndex }),

  resetFilters: () =>
    set({
      query: '',
      useRegex: false,
      extensionsText: '',
      kindFilter: '',
      minSizeKB: '',
      maxSizeKB: '',
      modifiedAfter: '',
      modifiedBefore: '',
      contentQuery: '',
      results: [],
      selectedResultPaths: new Set(),
      lastSelectedResultPath: null,
      error: undefined,
    }),

  selectResultItem: (path: string, multi: boolean, range = false) => {
    set((state) => {
      const ordered = state.results.map((r) => r.path);
      const anchor =
        state.lastSelectedResultPath ||
        (state.selectedResultPaths.size > 0
          ? Array.from(state.selectedResultPaths)[0]
          : null);

      if (range && anchor) {
        const startIdx = ordered.indexOf(anchor);
        const endIdx = ordered.indexOf(path);
        if (startIdx !== -1 && endIdx !== -1) {
          const low = Math.min(startIdx, endIdx);
          const high = Math.max(startIdx, endIdx);
          const next = multi ? new Set(state.selectedResultPaths) : new Set<string>();
          for (let i = low; i <= high; i++) {
            next.add(ordered[i]);
          }
          return { selectedResultPaths: next };
        }
      }

      const next = multi ? new Set(state.selectedResultPaths) : new Set<string>();
      if (multi && next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return {
        selectedResultPaths: next,
        lastSelectedResultPath: path,
      };
    });
  },

  selectAllResults: () => {
    set((state) => ({
      selectedResultPaths: new Set(state.results.map((r) => r.path)),
    }));
  },

  clearResultSelection: () => {
    set({ selectedResultPaths: new Set(), lastSelectedResultPath: null });
  },

  loadSavedSearches: async () => {
    const list = await listSavedSearches();
    set({ savedSearches: list });
  },

  saveCurrentSearchPreset: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const st = get();
    const payload = JSON.stringify({
      query: st.query,
      useRegex: st.useRegex,
      extensionsText: st.extensionsText,
      kindFilter: st.kindFilter,
      minSizeKB: st.minSizeKB,
      maxSizeKB: st.maxSizeKB,
      modifiedAfter: st.modifiedAfter,
      modifiedBefore: st.modifiedBefore,
      contentQuery: st.contentQuery,
      useIndex: st.useIndex,
    });
    await saveSearch(trimmed, payload);
    const list = await listSavedSearches();
    set({ savedSearches: list });
  },

  applySavedSearchPreset: (preset: SavedSearch) => {
    try {
      const parsed = JSON.parse(preset.queryJson) as Partial<SearchStoreState>;
      set({
        query: parsed.query ?? '',
        useRegex: Boolean(parsed.useRegex),
        extensionsText: parsed.extensionsText ?? '',
        kindFilter: parsed.kindFilter ?? '',
        minSizeKB: parsed.minSizeKB ?? '',
        maxSizeKB: parsed.maxSizeKB ?? '',
        modifiedAfter: parsed.modifiedAfter ?? '',
        modifiedBefore: parsed.modifiedBefore ?? '',
        contentQuery: parsed.contentQuery ?? '',
        useIndex: parsed.useIndex ?? true,
      });
    } catch {
      // ignora preset inválido
    }
  },

  removeSavedSearchPreset: async (id: number) => {
    await deleteSavedSearch(id);
    const list = await listSavedSearches();
    set({ savedSearches: list });
  },

  runSearch: async (rootPath, includeHidden) => {
    const st = get();
    if (st.requestId && st.isSearching) {
      await cancelSearch(st.requestId);
    }

    const reqId = `search-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const extensions = st.extensionsText
      .split(/[,\s;]+/)
      .map((x) => x.trim().replace(/^\./, ''))
      .filter(Boolean);

    const minBytes = Number(st.minSizeKB) > 0 ? Math.round(Number(st.minSizeKB) * 1024) : 0;
    const maxBytes = Number(st.maxSizeKB) > 0 ? Math.round(Number(st.maxSizeKB) * 1024) : 0;

    const opts: SearchOptions = {
      rootPath,
      query: st.query,
      useRegex: st.useRegex,
      extensions,
      kind: st.kindFilter,
      minSize: minBytes,
      maxSize: maxBytes,
      modifiedAfter: st.modifiedAfter,
      modifiedBefore: st.modifiedBefore,
      contentQuery: st.contentQuery,
      includeHidden,
      useIndex: st.useIndex,
    };

    set({
      isSearching: true,
      requestId: reqId,
      results: [],
      selectedResultPaths: new Set(),
      lastSelectedResultPath: null,
      error: undefined,
    });

    await startSearch(reqId, opts);
  },

  stopSearch: async () => {
    const { requestId } = get();
    if (requestId) {
      await cancelSearch(requestId);
    }
    set({ isSearching: false });
  },

  appendBatch: (reqId, batch) => {
    if (reqId !== get().requestId) return;
    set((prev) => ({
      results: [...prev.results, ...batch],
    }));
  },

  finishSearch: (reqId, error) => {
    if (reqId !== get().requestId) return;
    set({
      isSearching: false,
      error,
    });
  },

  refreshIndexedRoots: async () => {
    const roots = await listIndexRoots();
    set({ indexedRoots: roots });
  },

  indexCurrentRoot: async (rootPath) => {
    if (!rootPath) return;
    set({ indexingRoot: true });
    try {
      await indexDirectory(rootPath);
      const roots = await listIndexRoots();
      set({ indexedRoots: roots, indexingRoot: false });
    } catch {
      set({ indexingRoot: false });
    }
  },

  deleteIndexedRoot: async (rootPath) => {
    await removeIndexRoot(rootPath);
    const roots = await listIndexRoots();
    set({ indexedRoots: roots });
  },
}));

