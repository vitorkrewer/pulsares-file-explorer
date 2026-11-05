import { create } from 'zustand';
import {
  JobSnapshot,
  JournalEntry,
  ConflictPolicy,
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
  subscribeEvent,
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

  setPanelOpen: (open: boolean) => void;
  toggleVerifyHash: () => void;
  openPrompt: (kind: PromptDialogKind, targetPath?: string, initialValue?: string) => void;
  closePrompt: () => void;
  submitPrompt: (value?: string) => Promise<void>;

  copySelection: () => void;
  cutSelection: () => void;
  pasteIntoCurrent: () => Promise<void>;
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

  setPanelOpen: (open: boolean) => set({ panelOpen: open }),
  toggleVerifyHash: () => set((s) => ({ verifyHash: !s.verifyHash })),

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
  },

  cutSelection: () => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    if (selected.length === 0) return;
    set({ clipboard: { paths: selected, mode: 'cut' } });
  },

  pasteIntoCurrent: async () => {
    const { clipboard, verifyHash } = get();
    const currentPath = useBrowserStore.getState().currentPath;
    if (!clipboard || clipboard.paths.length === 0 || !currentPath) return;

    const kind = clipboard.mode === 'cut' ? 'move' : 'copy';
    set({ panelOpen: true });
    await enqueueOperation(kind, clipboard.paths, currentPath, 'ask', verifyHash);
    if (clipboard.mode === 'cut') {
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

