import { create } from 'zustand';
import { PreviewData, getPreview, getThumbnail } from '../../lib/wails';

export type BrowserViewMode = 'details' | 'list' | 'grid' | 'columns';
export type GridThumbSize = 'small' | 'medium' | 'large' | 'xlarge';
export type GroupByOption = 'none' | 'type' | 'date' | 'size';
export type UIDensity = 'comfortable' | 'compact';

export interface FolderZoomStep {
  index: number;
  id: string;
  pct: number;
  viewMode: BrowserViewMode;
  density: UIDensity;
  gridSize: GridThumbSize;
  labelKey: string;
}

export const FOLDER_ZOOM_STEPS: FolderZoomStep[] = [
  {
    index: 0,
    id: 'details-compact',
    pct: 85,
    viewMode: 'details',
    density: 'compact',
    gridSize: 'small',
    labelKey: 'folderZoom.stepDetailsCompact',
  },
  {
    index: 1,
    id: 'details-normal',
    pct: 100,
    viewMode: 'details',
    density: 'comfortable',
    gridSize: 'medium',
    labelKey: 'folderZoom.stepDetails',
  },
  {
    index: 2,
    id: 'list',
    pct: 115,
    viewMode: 'list',
    density: 'comfortable',
    gridSize: 'medium',
    labelKey: 'folderZoom.stepList',
  },
  {
    index: 3,
    id: 'grid-small',
    pct: 130,
    viewMode: 'grid',
    density: 'comfortable',
    gridSize: 'small',
    labelKey: 'folderZoom.stepSmallIcons',
  },
  {
    index: 4,
    id: 'grid-medium',
    pct: 150,
    viewMode: 'grid',
    density: 'comfortable',
    gridSize: 'medium',
    labelKey: 'folderZoom.stepMediumIcons',
  },
  {
    index: 5,
    id: 'grid-large',
    pct: 175,
    viewMode: 'grid',
    density: 'comfortable',
    gridSize: 'large',
    labelKey: 'folderZoom.stepLargeIcons',
  },
  {
    index: 6,
    id: 'grid-xlarge',
    pct: 200,
    viewMode: 'grid',
    density: 'comfortable',
    gridSize: 'xlarge',
    labelKey: 'folderZoom.stepExtraLargeIcons',
  },
];

export function resolveZoomStepIndex(
  viewMode: BrowserViewMode,
  density: UIDensity,
  gridSize: GridThumbSize
): number {
  if (viewMode === 'details') {
    return density === 'compact' ? 0 : 1;
  }
  if (viewMode === 'list' || viewMode === 'columns') {
    return 2;
  }
  switch (gridSize) {
    case 'small':
      return 3;
    case 'medium':
      return 4;
    case 'large':
      return 5;
    case 'xlarge':
      return 6;
    default:
      return 4;
  }
}

const STORAGE_KEY = 'pulsares.view.preferences.v1';

interface PersistedViewPrefs {
  viewMode: BrowserViewMode;
  gridSize: GridThumbSize;
  groupBy: GroupByOption;
  density: UIDensity;
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
  zoomHudStamp: number;
  thumbnails: Record<string, string>;

  setViewMode: (mode: BrowserViewMode) => void;
  setGridSize: (size: GridThumbSize) => void;
  setGroupBy: (groupBy: GroupByOption) => void;
  setDensity: (density: UIDensity) => void;
  toggleDensity: () => void;
  applyFolderZoomStep: (stepIndex: number, showHud?: boolean) => void;
  zoomFolderIn: (showHud?: boolean) => void;
  zoomFolderOut: (showHud?: boolean) => void;
  resetFolderZoom: (showHud?: boolean) => void;
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
    });
  };

  return {
    viewMode: saved.viewMode ?? 'details',
    gridSize: saved.gridSize ?? 'medium',
    groupBy: saved.groupBy ?? 'none',
    density: saved.density ?? 'comfortable',
    previewPanelOpen: false,
    quickLookOpen: false,
    previewData: null,
    previewLoading: false,
    imageZoom: 1,
    zoomHudStamp: 0,
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

    applyFolderZoomStep: (stepIndex, showHud = false) => {
      const clamped = Math.max(0, Math.min(FOLDER_ZOOM_STEPS.length - 1, stepIndex));
      const step = FOLDER_ZOOM_STEPS[clamped];
      set((s) => ({
        viewMode: step.viewMode,
        density: step.density,
        gridSize: step.gridSize,
        zoomHudStamp: showHud ? Date.now() : s.zoomHudStamp,
      }));
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-density', step.density);
      }
      persist();
    },

    zoomFolderIn: (showHud = false) => {
      const s = get();
      const curr = resolveZoomStepIndex(s.viewMode, s.density, s.gridSize);
      const next = Math.min(FOLDER_ZOOM_STEPS.length - 1, curr + 1);
      get().applyFolderZoomStep(next, showHud);
    },

    zoomFolderOut: (showHud = false) => {
      const s = get();
      const curr = resolveZoomStepIndex(s.viewMode, s.density, s.gridSize);
      const next = Math.max(0, curr - 1);
      get().applyFolderZoomStep(next, showHud);
    },

    resetFolderZoom: (showHud = false) => {
      get().applyFolderZoomStep(1, showHud);
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
