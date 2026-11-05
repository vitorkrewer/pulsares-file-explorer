import { create } from 'zustand';
import { PreviewData, getPreview, getThumbnail } from '../../lib/wails';

export type BrowserViewMode = 'details' | 'list' | 'grid' | 'columns';
export type GridThumbSize = 'small' | 'medium' | 'large';
export type GroupByOption = 'none' | 'type' | 'date' | 'size';
export type UIDensity = 'comfortable' | 'compact';

const STORAGE_KEY = 'pulsares.view.preferences.v1';

interface PersistedViewPrefs {
  viewMode: BrowserViewMode;
  gridSize: GridThumbSize;
  groupBy: GroupByOption;
  density: UIDensity;
  previewPanelOpen: boolean;
}

function loadViewPrefs(): Partial<PersistedViewPrefs> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedViewPrefs>;
  } catch {
    return {};
  }
}

function saveViewPrefs(prefs: PersistedViewPrefs): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignorar erros de quota
  }
}

interface PreviewStoreState {
  viewMode: BrowserViewMode;
  gridSize: GridThumbSize;
  groupBy: GroupByOption;
  density: UIDensity;
  previewPanelOpen: boolean;
  quickLookOpen: boolean;
  previewData: PreviewData | null;
  previewLoading: boolean;
  imageZoom: number;
  thumbnails: Record<string, string>;

  setViewMode: (mode: BrowserViewMode) => void;
  setGridSize: (size: GridThumbSize) => void;
  setGroupBy: (groupBy: GroupByOption) => void;
  setDensity: (density: UIDensity) => void;
  toggleDensity: () => void;
  togglePreviewPanel: () => void;
  toggleQuickLook: () => void;
  closeQuickLook: () => void;
  setImageZoom: (zoom: number) => void;
  loadPreview: (path: string | null) => Promise<void>;
  ensureThumbnail: (path: string, maxDim?: number) => Promise<void>;
}

const saved = loadViewPrefs();

export const usePreviewStore = create<PreviewStoreState>((set, get) => {
  const persist = () => {
    const s = get();
    saveViewPrefs({
      viewMode: s.viewMode,
      gridSize: s.gridSize,
      groupBy: s.groupBy,
      density: s.density,
      previewPanelOpen: s.previewPanelOpen,
    });
  };

  return {
    viewMode: saved.viewMode ?? 'details',
    gridSize: saved.gridSize ?? 'medium',
    groupBy: saved.groupBy ?? 'none',
    density: saved.density ?? 'comfortable',
    previewPanelOpen: saved.previewPanelOpen ?? false,
    quickLookOpen: false,
    previewData: null,
    previewLoading: false,
    imageZoom: 1,
    thumbnails: {},

    setViewMode: (viewMode) => {
      set({ viewMode });
      persist();
    },

    setGridSize: (gridSize) => {
      set({ gridSize });
      persist();
    },

    setGroupBy: (groupBy) => {
      set({ groupBy });
      persist();
    },

    setDensity: (density) => {
      set({ density });
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-density', density);
      }
      persist();
    },

    toggleDensity: () => {
      const next: UIDensity = get().density === 'comfortable' ? 'compact' : 'comfortable';
      get().setDensity(next);
    },

    togglePreviewPanel: () => {
      set((s) => ({ previewPanelOpen: !s.previewPanelOpen }));
      persist();
    },

    toggleQuickLook: () => {
      set((s) => ({ quickLookOpen: !s.quickLookOpen, imageZoom: 1 }));
    },

    closeQuickLook: () => {
      set({ quickLookOpen: false, imageZoom: 1 });
    },

    setImageZoom: (zoom) => {
      const clamped = Math.max(0.25, Math.min(4, zoom));
      set({ imageZoom: clamped });
    },

    loadPreview: async (path) => {
      if (!path) {
        set({ previewData: null, previewLoading: false });
        return;
      }
      set({ previewLoading: true, imageZoom: 1 });
      try {
        const data = await getPreview(path, 65536);
        set({ previewData: data, previewLoading: false });
      } catch {
        set({ previewData: null, previewLoading: false });
      }
    },

    ensureThumbnail: async (path, maxDim = 140) => {
      const key = `${path}:${maxDim}`;
      if (get().thumbnails[key] !== undefined) return;
      set((prev) => ({
        thumbnails: { ...prev.thumbnails, [key]: '' },
      }));
      try {
        const uri = await getThumbnail(path, maxDim);
        if (uri) {
          set((prev) => ({
            thumbnails: { ...prev.thumbnails, [key]: uri },
          }));
        }
      } catch {
        // Ignora formatos sem miniatura
      }
    },
  };
});
