import { create } from 'zustand';
import {
  SearchOptions,
  SearchResultItem,
  IndexedRoot,
  startSearch,
  cancelSearch,
  indexDirectory,
  listIndexRoots,
  removeIndexRoot,
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
      error: undefined,
    }),

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

