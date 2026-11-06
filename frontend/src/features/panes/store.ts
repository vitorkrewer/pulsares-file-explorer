import { create } from 'zustand';
import {
  Entry,
  listDirectory,
  cancelListing,
  subscribeEvent,
  ListingBatchEvent,
  ListingDoneEvent,
  enqueueOperation,
} from '../../lib/wails';
import { useBrowserStore } from '../browser/store';
import { useOperationsStore } from '../operations/store';

export type LayoutMode = 'single' | 'split-h' | 'split-v';

interface DualPaneState {
  layoutMode: LayoutMode;
  splitRatio: number;
  secondaryPath: string;
  secondaryEntries: Entry[];
  secondaryLoading: boolean;
  secondarySelected: Set<string>;
  secondaryLastSelected: string | null;
  secondaryRequestId: string;
  focusedPane: 'primary' | 'secondary';

  setLayoutMode: (mode: LayoutMode) => void;
  setSplitRatio: (ratio: number) => void;
  setFocusedPane: (pane: 'primary' | 'secondary') => void;
  navigateSecondary: (path: string) => void;
  refreshSecondary: () => void;
  selectSecondaryItem: (path: string, multi: boolean, range?: boolean, orderedPaths?: string[]) => void;
  copyToOppositePane: () => Promise<void>;
  moveToOppositePane: () => Promise<void>;
  initSecondaryListeners: () => () => void;
}

export const useDualPaneStore = create<DualPaneState>((set, get) => ({
  layoutMode: 'single',
  splitRatio: 0.5,
  secondaryPath: '',
  secondaryEntries: [],
  secondaryLoading: false,
  secondarySelected: new Set(),
  secondaryLastSelected: null,
  secondaryRequestId: '',
  focusedPane: 'primary',

  setLayoutMode: (mode: LayoutMode) => {
    const state = get();
    set({ layoutMode: mode });
    if (mode !== 'single' && !state.secondaryPath) {
      const primaryPath = useBrowserStore.getState().currentPath || '/';
      get().navigateSecondary(primaryPath);
    }
  },

  setSplitRatio: (ratio: number) => {
    set({ splitRatio: Math.max(0.2, Math.min(0.8, ratio)) });
  },

  setFocusedPane: (pane) => set({ focusedPane: pane }),

  navigateSecondary: (path: string) => {
    if (!path) return;
    const reqId = crypto.randomUUID();
    cancelListing('secondary-pane');
    set({
      secondaryPath: path,
      secondaryEntries: [],
      secondaryLoading: true,
      secondarySelected: new Set(),
      secondaryRequestId: reqId,
    });
    listDirectory('secondary-pane', reqId, path);
  },

  refreshSecondary: () => {
    const { secondaryPath } = get();
    if (secondaryPath) {
      get().navigateSecondary(secondaryPath);
    }
  },

  selectSecondaryItem: (path: string, multi: boolean, range = false, orderedPaths?: string[]) => {
    set((state) => {
      const list = orderedPaths || state.secondaryEntries.map((e) => e.location.path);
      const anchor =
        state.secondaryLastSelected ||
        (state.secondarySelected.size > 0 ? Array.from(state.secondarySelected)[0] : null);

      if (range && anchor) {
        const startIdx = list.indexOf(anchor);
        const endIdx = list.indexOf(path);
        if (startIdx !== -1 && endIdx !== -1) {
          const low = Math.min(startIdx, endIdx);
          const high = Math.max(startIdx, endIdx);
          const next = multi ? new Set(state.secondarySelected) : new Set<string>();
          for (let i = low; i <= high; i++) {
            next.add(list[i]);
          }
          return { secondarySelected: next, focusedPane: 'secondary' };
        }
      }

      const next = multi ? new Set(state.secondarySelected) : new Set<string>();
      if (multi && next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return {
        secondarySelected: next,
        secondaryLastSelected: path,
        focusedPane: 'secondary',
      };
    });
  },

  copyToOppositePane: async () => {
    const { layoutMode, focusedPane, secondaryPath, secondarySelected } = get();
    if (layoutMode === 'single') return;

    const browser = useBrowserStore.getState();
    const verifyHash = useOperationsStore.getState().verifyHash;

    const sources =
      focusedPane === 'primary'
        ? Array.from(browser.selectedPaths)
        : Array.from(secondarySelected);
    const destination =
      focusedPane === 'primary' ? secondaryPath : browser.currentPath;

    if (sources.length === 0 || !destination) return;
    useOperationsStore.getState().setPanelOpen(true);
    await enqueueOperation('copy', sources, destination, 'ask', verifyHash);
  },

  moveToOppositePane: async () => {
    const { layoutMode, focusedPane, secondaryPath, secondarySelected } = get();
    if (layoutMode === 'single') return;

    const browser = useBrowserStore.getState();
    const verifyHash = useOperationsStore.getState().verifyHash;

    const sources =
      focusedPane === 'primary'
        ? Array.from(browser.selectedPaths)
        : Array.from(secondarySelected);
    const destination =
      focusedPane === 'primary' ? secondaryPath : browser.currentPath;

    if (sources.length === 0 || !destination) return;
    useOperationsStore.getState().setPanelOpen(true);
    await enqueueOperation('move', sources, destination, 'ask', verifyHash);
  },

  initSecondaryListeners: () => {
    const unsubBatch = subscribeEvent<ListingBatchEvent>('listing:batch', (evt) => {
      if (evt.requestId !== get().secondaryRequestId) return;
      set((s) => ({
        secondaryEntries: [...s.secondaryEntries, ...evt.entries],
      }));
    });

    const unsubDone = subscribeEvent<ListingDoneEvent>('listing:done', (evt) => {
      if (evt.requestId !== get().secondaryRequestId) return;
      set({ secondaryLoading: false });
    });

    return () => {
      unsubBatch();
      unsubDone();
    };
  },
}));

