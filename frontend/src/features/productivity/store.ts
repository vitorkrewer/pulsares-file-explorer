import { create } from 'zustand';
import {
  BatchRenameOptions,
  BatchRenamePreviewItem,
  FolderDiffItem,
  FileHashes,
  ItemTag,
  previewBatchRename,
  executeBatchRename,
  compareDirectories,
  computeHashes,
  listItemTags,
  setItemTag,
  removeItemTag,
} from '../../lib/wails';
import { useBrowserStore } from '../browser/store';
import { useDualPaneStore } from '../panes/store';

export interface ShortcutBinding {
  id: string;
  labelKey: string;
  defaultKey: string;
  currentKey: string;
}

const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { id: 'commandPalette', labelKey: 'productivity.paletteTitle', defaultKey: 'Ctrl+Shift+P', currentKey: 'Ctrl+Shift+P' },
  { id: 'searchAdvanced', labelKey: 'search.toggleAdvanced', defaultKey: 'Ctrl+Shift+S', currentKey: 'Ctrl+Shift+S' },
  { id: 'instantFilter', labelKey: 'search.instantFilterPlaceholder', defaultKey: 'Ctrl+F', currentKey: 'Ctrl+F' },
  { id: 'newFolder', labelKey: 'ops.newFolder', defaultKey: 'Ctrl+Shift+N', currentKey: 'Ctrl+Shift+N' },
  { id: 'rename', labelKey: 'ops.rename', defaultKey: 'F2', currentKey: 'F2' },
  { id: 'properties', labelKey: 'os.propertiesShortcut', defaultKey: 'Alt+Enter', currentKey: 'Alt+Enter' },
  { id: 'quickLook', labelKey: 'preview.quickLook', defaultKey: 'Space', currentKey: 'Space' },
  { id: 'toggleTerminal', labelKey: 'terminal.togglePanel', defaultKey: 'Ctrl+`', currentKey: 'Ctrl+`' },
  { id: 'toggleSidebar', labelKey: 'nav.toggleSidebar', defaultKey: 'Ctrl+B', currentKey: 'Ctrl+B' },
];

const DEFAULT_BATCH_OPTIONS: BatchRenameOptions = {
  find: '',
  replace: '',
  useRegex: false,
  prefix: '',
  suffix: '',
  caseMode: 'none',
  startNumber: 1,
  stepNumber: 1,
  numberDigits: 0,
};

interface ProductivityState {
  paletteOpen: boolean;
  batchRenameOpen: boolean;
  batchPaths: string[];
  batchOptions: BatchRenameOptions;
  batchPreview: BatchRenamePreviewItem[];
  batchError: string | null;

  compareOpen: boolean;
  compareLeftDir: string;
  compareRightDir: string;
  compareResults: FolderDiffItem[];
  compareLoading: boolean;

  hashOpen: boolean;
  hashLoading: boolean;
  hashData: FileHashes | null;
  expectedHash: string;

  shortcutsOpen: boolean;
  shortcuts: ShortcutBinding[];

  tagsByPath: Record<string, ItemTag>;

  togglePalette: () => void;
  closePalette: () => void;

  openBatchRename: (paths?: string[]) => Promise<void>;
  closeBatchRename: () => void;
  updateBatchOptions: (partial: Partial<BatchRenameOptions>) => Promise<void>;
  applyBatchRename: () => Promise<void>;

  openCompare: () => Promise<void>;
  closeCompare: () => void;
  setCompareDirs: (leftDir: string, rightDir: string) => void;
  runCompare: () => Promise<void>;

  openHashModal: (targetPath?: string) => Promise<void>;
  closeHashModal: () => void;
  setExpectedHash: (val: string) => void;

  openShortcutsModal: () => void;
  closeShortcutsModal: () => void;
  updateShortcut: (id: string, newKey: string) => void;
  resetShortcuts: () => void;

  loadTags: () => Promise<void>;
  assignTagToSelection: (tagName: string, color: string) => Promise<void>;
  clearTagFromSelection: () => Promise<void>;
}

export const useProductivityStore = create<ProductivityState>((set, get) => ({
  paletteOpen: false,
  batchRenameOpen: false,
  batchPaths: [],
  batchOptions: { ...DEFAULT_BATCH_OPTIONS },
  batchPreview: [],
  batchError: null,

  compareOpen: false,
  compareLeftDir: '',
  compareRightDir: '',
  compareResults: [],
  compareLoading: false,

  hashOpen: false,
  hashLoading: false,
  hashData: null,
  expectedHash: '',

  shortcutsOpen: false,
  shortcuts: DEFAULT_SHORTCUTS,

  tagsByPath: {},

  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  closePalette: () => set({ paletteOpen: false }),

  openBatchRename: async (paths) => {
    const browser = useBrowserStore.getState();
    const targetPaths =
      paths && paths.length > 0
        ? paths
        : browser.selectedPaths.size > 0
          ? Array.from(browser.selectedPaths)
          : browser.entries.map((e) => e.location.path);

    if (targetPaths.length === 0) return;
    const opts = { ...DEFAULT_BATCH_OPTIONS };
    set({
      batchRenameOpen: true,
      batchPaths: targetPaths,
      batchOptions: opts,
      batchError: null,
    });
    try {
      const preview = await previewBatchRename(targetPaths, opts);
      set({ batchPreview: preview });
    } catch (err) {
      set({ batchError: String(err) });
    }
  },

  closeBatchRename: () => set({ batchRenameOpen: false, batchPreview: [], batchError: null }),

  updateBatchOptions: async (partial) => {
    const nextOpts = { ...get().batchOptions, ...partial };
    const paths = get().batchPaths;
    set({ batchOptions: nextOpts, batchError: null });
    try {
      const preview = await previewBatchRename(paths, nextOpts);
      set({ batchPreview: preview });
    } catch (err) {
      set({ batchError: String(err) });
    }
  },

  applyBatchRename: async () => {
    const { batchPaths, batchOptions } = get();
    try {
      await executeBatchRename(batchPaths, batchOptions);
      set({ batchRenameOpen: false, batchPreview: [], batchError: null });
      useBrowserStore.getState().refresh();
    } catch (err) {
      set({ batchError: String(err) });
    }
  },

  openCompare: async () => {
    const left = useBrowserStore.getState().currentPath || '';
    const right = useDualPaneStore.getState().secondaryPath || left;
    set({
      compareOpen: true,
      compareLeftDir: left,
      compareRightDir: right,
      compareResults: [],
    });
    if (left && right) {
      await get().runCompare();
    }
  },

  closeCompare: () => set({ compareOpen: false, compareResults: [] }),

  setCompareDirs: (leftDir, rightDir) =>
    set({ compareLeftDir: leftDir, compareRightDir: rightDir }),

  runCompare: async () => {
    const { compareLeftDir, compareRightDir } = get();
    if (!compareLeftDir.trim() || !compareRightDir.trim()) return;
    set({ compareLoading: true });
    try {
      const diffs = await compareDirectories(compareLeftDir.trim(), compareRightDir.trim());
      set({ compareResults: diffs, compareLoading: false });
    } catch {
      set({ compareResults: [], compareLoading: false });
    }
  },

  openHashModal: async (targetPath) => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    const resolved = targetPath || selected[0];
    if (!resolved) return;

    set({ hashOpen: true, hashLoading: true, hashData: null, expectedHash: '' });
    try {
      const hashes = await computeHashes(resolved);
      set({ hashData: hashes, hashLoading: false });
    } catch {
      set({ hashLoading: false });
    }
  },

  closeHashModal: () => set({ hashOpen: false, hashData: null, expectedHash: '' }),
  setExpectedHash: (expectedHash) => set({ expectedHash }),

  openShortcutsModal: () => set({ shortcutsOpen: true }),
  closeShortcutsModal: () => set({ shortcutsOpen: false }),

  updateShortcut: (id, newKey) => {
    set((s) => ({
      shortcuts: s.shortcuts.map((sc) =>
        sc.id === id ? { ...sc, currentKey: newKey.trim() || sc.defaultKey } : sc
      ),
    }));
  },

  resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),

  loadTags: async () => {
    const list = await listItemTags();
    const map: Record<string, ItemTag> = {};
    for (const item of list) {
      map[item.path] = item;
    }
    set({ tagsByPath: map });
  },

  assignTagToSelection: async (tagName, color) => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    for (const p of selected) {
      await setItemTag(p, tagName, color);
    }
    await get().loadTags();
  },

  clearTagFromSelection: async () => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    for (const p of selected) {
      await removeItemTag(p);
    }
    await get().loadTags();
  },
}));
