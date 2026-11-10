import { create } from 'zustand';
import {
  JobSnapshot,
  JournalEntry,
  ConflictPolicy,
  ItemProperties,
  createFolder,
  createFile,
  renameItem,
  enqueueOperation,
  pauseJob,
  resumeJob,
  cancelJob,
  resolveJobConflict,
  undoOperation,
  redoOperation,
  listJobs,
  listJournal,
  getItemProperties,
  openWithDialog,
  subscribeEvent,
  setNativeClipboardFiles,
  getNativeClipboardFiles,
} from '../../lib/wails';
import { useBrowserStore } from '../browser/store';

export type PromptDialogKind = 'newFolder' | 'newFile' | 'rename' | 'confirmPermanentDelete' | null;

interface ClipboardState {
  paths: string[];
  mode: 'copy' | 'cut';
}

interface OperationsState {
  clipboard: ClipboardState | null;
  jobs: JobSnapshot[];
  journal: JournalEntry[];
  panelOpen: boolean;
  verifyHash: boolean;

  promptKind: PromptDialogKind;
  promptTargetPath: string;
  promptInitialValue: string;

  propertiesOpen: boolean;
  propertiesLoading: boolean;
  propertiesData: ItemProperties | null;

  setPanelOpen: (open: boolean) => void;
  toggleVerifyHash: () => void;
  openPrompt: (kind: PromptDialogKind, targetPath?: string, initialValue?: string) => void;
  closePrompt: () => void;
  submitPrompt: (value?: string) => Promise<void>;

  openProperties: (targetPath?: string) => Promise<void>;
  closeProperties: () => void;
  openSelectedWithDialog: () => Promise<void>;

  copySelection: () => void;
  cutSelection: () => void;
  pasteIntoCurrent: () => Promise<void>;
  syncClipboardFromOS: () => Promise<void>;
  trashSelection: () => Promise<void>;
  requestPermanentDelete: () => void;
  requestRenameSelection: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;

  pause: (jobId: string) => Promise<void>;
  resume: (jobId: string) => Promise<void>;
  cancel: (jobId: string) => Promise<void>;
  resolveConflict: (jobId: string, policy: ConflictPolicy, applyToAll: boolean) => Promise<void>;

  initOpsListeners: () => () => void;
}

export const useOperationsStore = create<OperationsState>((set, get) => ({
  clipboard: null,
  jobs: [],
  journal: [],
  panelOpen: false,
  verifyHash: false,

  promptKind: null,
  promptTargetPath: '',
  promptInitialValue: '',

  propertiesOpen: false,
  propertiesLoading: false,
  propertiesData: null,

  setPanelOpen: (open: boolean) => set({ panelOpen: open }),
  toggleVerifyHash: () => set((s) => ({ verifyHash: !s.verifyHash })),

  openProperties: async (targetPath) => {
    const browser = useBrowserStore.getState();
    const selected = Array.from(browser.selectedPaths);
    const resolved = targetPath || selected[0] || browser.currentPath;
    if (!resolved) return;

    set({ propertiesOpen: true, propertiesLoading: true, propertiesData: null });
    try {
      const data = await getItemProperties(resolved);
      set({ propertiesData: data, propertiesLoading: false });
    } catch {
      set({ propertiesLoading: false });
    }
  },

  closeProperties: () => {
    set({ propertiesOpen: false, propertiesData: null, propertiesLoading: false });
  },

  openSelectedWithDialog: async () => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    if (selected.length > 0) {
      await openWithDialog(selected[0]);
    }
  },

  openPrompt: (kind, targetPath = '', initialValue = '') => {
    set({
      promptKind: kind,
      promptTargetPath: targetPath,
      promptInitialValue: initialValue,
    });
  },

  closePrompt: () => {
    set({
      promptKind: null,
      promptTargetPath: '',
      promptInitialValue: '',
    });
  },

  submitPrompt: async (value?: string) => {
    const { promptKind, promptTargetPath } = get();
    const browser = useBrowserStore.getState();
    const currentPath = browser.currentPath;

    if (!promptKind) return;

    try {
      if (promptKind === 'newFolder' && value?.trim() && currentPath) {
        await createFolder(currentPath, value.trim());
        browser.refresh();
      } else if (promptKind === 'newFile' && value?.trim() && currentPath) {
        await createFile(currentPath, value.trim());
        browser.refresh();
      } else if (promptKind === 'rename' && value?.trim() && promptTargetPath) {
        await renameItem(promptTargetPath, value.trim());
        browser.refresh();
      } else if (promptKind === 'confirmPermanentDelete') {
        const selected = Array.from(browser.selectedPaths);
        if (selected.length > 0) {
          set({ panelOpen: true });
          await enqueueOperation('delete', selected, '', 'overwrite', false);
        }
      }
    } finally {
      get().closePrompt();
    }
  },

  copySelection: () => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    if (selected.length === 0) return;
    set({ clipboard: { paths: selected, mode: 'copy' } });
    void setNativeClipboardFiles(selected, false);
  },

  cutSelection: () => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    if (selected.length === 0) return;
    set({ clipboard: { paths: selected, mode: 'cut' } });
    void setNativeClipboardFiles(selected, true);
  },

  syncClipboardFromOS: async () => {
    try {
      const osFiles = await getNativeClipboardFiles();
      if (osFiles.paths.length > 0) {
        const cur = get().clipboard;
        const same =
          cur &&
          cur.mode === osFiles.mode &&
          cur.paths.length === osFiles.paths.length &&
          cur.paths.every((p, idx) => p === osFiles.paths[idx]);
        if (!same) {
          set({ clipboard: { paths: osFiles.paths, mode: osFiles.mode } });
        }
      }
    } catch {
      // ignore
    }
  },

  pasteIntoCurrent: async () => {
    const { verifyHash } = get();
    const currentPath = useBrowserStore.getState().currentPath;
    if (!currentPath) return;

    let activeClip = get().clipboard;
    const isInternalSftp = activeClip?.paths.some((p) => p.startsWith('sftp://'));

    if (!isInternalSftp) {
      try {
        const osFiles = await getNativeClipboardFiles();
        if (osFiles.paths.length > 0) {
          activeClip = { paths: osFiles.paths, mode: osFiles.mode };
          set({ clipboard: activeClip });
        }
      } catch {
        // fallback to internal clipboard
      }
    }

    if (!activeClip || activeClip.paths.length === 0) return;

    const kind = activeClip.mode === 'cut' ? 'move' : 'copy';
    set({ panelOpen: true });
    await enqueueOperation(kind, activeClip.paths, currentPath, 'ask', verifyHash);
    if (activeClip.mode === 'cut') {
      set({ clipboard: null });
    }
  },

  trashSelection: async () => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    if (selected.length === 0) return;
    set({ panelOpen: true });
    await enqueueOperation('trash', selected, '', 'overwrite', false);
  },

  requestPermanentDelete: () => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    if (selected.length === 0) return;
    set({
      promptKind: 'confirmPermanentDelete',
      promptTargetPath: '',
      promptInitialValue: '',
    });
  },

  requestRenameSelection: () => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    if (selected.length !== 1) return;
    const target = selected[0];
    const parts = target.replace(/\\/g, '/').split('/').filter(Boolean);
    const baseName = parts[parts.length - 1] || '';
    set({
      promptKind: 'rename',
      promptTargetPath: target,
      promptInitialValue: baseName,
    });
  },

  undo: async () => {
    const entry = await undoOperation();
    if (entry) {
      useBrowserStore.getState().refresh();
    }
  },

  redo: async () => {
    const entry = await redoOperation();
    if (entry) {
      useBrowserStore.getState().refresh();
    }
  },

  pause: async (jobId: string) => {
    await pauseJob(jobId);
  },

  resume: async (jobId: string) => {
    await resumeJob(jobId);
  },

  cancel: async (jobId: string) => {
    await cancelJob(jobId);
  },

  resolveConflict: async (jobId: string, policy: ConflictPolicy, applyToAll: boolean) => {
    await resolveJobConflict(jobId, policy, applyToAll);
  },

  initOpsListeners: () => {
    listJobs().then((jobs) => set({ jobs }));
    listJournal().then((journal) => set({ journal }));

    const unsubUpdate = subscribeEvent<JobSnapshot>('ops:update', (snap) => {
      set((state) => {
        const exists = state.jobs.some((j) => j.id === snap.id);
        const nextJobs = exists
          ? state.jobs.map((j) => (j.id === snap.id ? snap : j))
          : [snap, ...state.jobs];

        const shouldOpen = snap.status === 'conflict' || state.panelOpen;
        return {
          jobs: nextJobs,
          panelOpen: shouldOpen,
        };
      });

      if (snap.status === 'completed') {
        useBrowserStore.getState().refresh();
      }
    });

    const unsubJournal = subscribeEvent<JournalEntry[]>('ops:journal', (entries) => {
      set({ journal: entries || [] });
    });

    return () => {
      unsubUpdate();
      unsubJournal();
    };
  },
}));

