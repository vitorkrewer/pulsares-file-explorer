import { create } from 'zustand';
import {
  ClipboardHistoryItem,
  ClipboardItemKind,
  addClipboardHistoryItem,
  clearUnpinnedClipboardHistory,
  deleteClipboardItem,
  enqueueOperation,
  getClipboardSequenceNumber,
  isWailsAvailable,
  listClipboardHistory,
  readNativeClipboardText,
  readSystemClipboardSnapshot,
  saveClipboardItemToFolder,
  setNativeClipboardFiles,
  setNativeClipboardImage,
  togglePinClipboardItem,
  writeNativeClipboardText,
} from '../../lib/wails';
import { useBrowserStore } from '../browser/store';
import { useOperationsStore } from '../operations/store';

export type ClipboardFilterType = 'all' | 'text' | 'image' | 'files' | 'pinned';

export interface ClipboardFilesPayload {
  paths: string[];
  mode: 'copy' | 'cut';
}

const MAX_UNPINNED_ITEMS = 20;
const LOCAL_STORAGE_KEY = 'pulsares.clipboard.history.v1';
const PAUSE_STORAGE_KEY = 'pulsares.clipboard.paused.v1';

function loadFallbackItems(): ClipboardHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFallbackItems(items: ClipboardHistoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

function loadPausedFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PAUSE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function buildPreview(kind: ClipboardItemKind, content: string, preview = ''): string {
  if (preview.trim()) return preview.trim().slice(0, 280);
  if (kind === 'text') {
    return content.trim().slice(0, 280);
  }
  if (kind === 'files') {
    try {
      const parsed = JSON.parse(content) as ClipboardFilesPayload;
      const names = (parsed.paths || []).map((p) => {
        const clean = p.replace(/\\/g, '/');
        const parts = clean.split('/').filter(Boolean);
        return parts[parts.length - 1] || p;
      });
      return names.slice(0, 5).join(', ') + (names.length > 5 ? ` (+${names.length - 5})` : '');
    } catch {
      return content.slice(0, 120);
    }
  }
  return 'Image (PNG)';
}

function enforceFallbackLimit(items: ClipboardHistoryItem[]): ClipboardHistoryItem[] {
  const pinned = items
    .filter((i) => i.pinned)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
  const unpinned = items
    .filter((i) => !i.pinned)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id)
    .slice(0, MAX_UNPINNED_ITEMS);
  return [...pinned, ...unpinned];
}

function blobToDataUrl(blob: Blob): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (typeof Image === 'undefined') {
        resolve({ dataUrl, width: 0, height: 0 });
        return;
      }
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl,
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
        });
      };
      img.onerror = () => resolve({ dataUrl, width: 0, height: 0 });
      img.src = dataUrl;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface ClipboardHistoryState {
  drawerOpen: boolean;
  items: ClipboardHistoryItem[];
  loading: boolean;
  capturePaused: boolean;
  filterType: ClipboardFilterType;
  searchQuery: string;
  lastCapturedSignature: string;
  lastSequenceNumber: number;
  feedbackMessage: string | null;

  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  setFilterType: (filter: ClipboardFilterType) => void;
  setSearchQuery: (query: string) => void;
  toggleCapturePaused: () => void;
  showFeedback: (msg: string) => void;

  loadHistory: () => Promise<void>;
  addItem: (
    kind: ClipboardItemKind,
    content: string,
    preview?: string,
    width?: number,
    height?: number
  ) => Promise<void>;
  togglePin: (id: number) => Promise<void>;
  removeItem: (id: number) => Promise<void>;
  clearUnpinned: () => Promise<void>;

  copyItemToSystem: (item: ClipboardHistoryItem) => Promise<void>;
  pasteFilesItemHere: (item: ClipboardHistoryItem) => Promise<void>;
  saveItemToCurrentFolder: (item: ClipboardHistoryItem, extOverride?: string) => Promise<string | null>;
  syncFromSystemClipboard: (forceRead?: boolean) => Promise<void>;
  initClipboardMonitor: () => () => void;
}

let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
let syncingInFlight = false;

export const useClipboardHistoryStore = create<ClipboardHistoryState>((set, get) => ({
  drawerOpen: false,
  items: loadFallbackItems(),
  loading: false,
  capturePaused: loadPausedFlag(),
  filterType: 'all',
  searchQuery: '',
  lastCapturedSignature: '',
  lastSequenceNumber: 0,
  feedbackMessage: null,

  setDrawerOpen: (open: boolean) => {
    set({ drawerOpen: open });
    if (open) {
      void get().loadHistory();
      void get().syncFromSystemClipboard(true);
    }
  },

  toggleDrawer: () => {
    const next = !get().drawerOpen;
    get().setDrawerOpen(next);
  },

  setFilterType: (filterType: ClipboardFilterType) => set({ filterType }),
  setSearchQuery: (searchQuery: string) => set({ searchQuery }),

  toggleCapturePaused: () => {
    const next = !get().capturePaused;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(PAUSE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
    }
    set({ capturePaused: next });
  },

  showFeedback: (msg: string) => {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    set({ feedbackMessage: msg });
    feedbackTimer = setTimeout(() => {
      set({ feedbackMessage: null });
    }, 2600);
  },

  loadHistory: async () => {
    set({ loading: true });
    try {
      if (isWailsAvailable() && typeof window.go?.app?.App?.ListClipboardHistory === 'function') {
        const list = await listClipboardHistory();
        set({ items: list, loading: false });
        saveFallbackItems(list);
      } else {
        const local = enforceFallbackLimit(loadFallbackItems());
        set({ items: local, loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  addItem: async (kind, content, preview = '', width = 0, height = 0) => {
    if (get().capturePaused) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    const signature = `${kind}:${trimmed.slice(0, 128)}:${trimmed.length}`;
    set({ lastCapturedSignature: signature });

    if (isWailsAvailable() && typeof window.go?.app?.App?.AddClipboardHistoryItem === 'function') {
      try {
        const updated = await addClipboardHistoryItem(kind, trimmed, preview, width, height);
        set({ items: updated });
        saveFallbackItems(updated);
        return;
      } catch {
        // fall through to local fallback
      }
    }

    const now = new Date().toISOString();
    const hash = `${kind}:${trimmed}`;
    const current = [...get().items];
    const existingIdx = current.findIndex((i) => i.contentHash === hash || (i.kind === kind && i.content === trimmed));
    const computedPreview = buildPreview(kind, trimmed, preview);
    const byteSize =
      kind === 'image' ? Math.round((trimmed.length * 3) / 4) : new Blob([trimmed]).size;

    if (existingIdx >= 0) {
      const existing = current[existingIdx];
      current[existingIdx] = {
        ...existing,
        preview: computedPreview || existing.preview,
        width: width || existing.width,
        height: height || existing.height,
        byteSize,
        updatedAt: now,
      };
    } else {
      const nextId = current.reduce((max, it) => Math.max(max, it.id), 0) + 1;
      current.unshift({
        id: nextId,
        kind,
        content: trimmed,
        preview: computedPreview,
        contentHash: hash,
        byteSize,
        width: width || undefined,
        height: height || undefined,
        pinned: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    const nextList = enforceFallbackLimit(current);
    set({ items: nextList });
    saveFallbackItems(nextList);
  },

  togglePin: async (id: number) => {
    if (isWailsAvailable() && typeof window.go?.app?.App?.TogglePinClipboardItem === 'function') {
      try {
        const updated = await togglePinClipboardItem(id);
        set({ items: updated });
        saveFallbackItems(updated);
        return;
      } catch {
        // fallback
      }
    }
    const now = new Date().toISOString();
    const updated = enforceFallbackLimit(
      get().items.map((it) => (it.id === id ? { ...it, pinned: !it.pinned, updatedAt: now } : it))
    );
    set({ items: updated });
    saveFallbackItems(updated);
  },

  removeItem: async (id: number) => {
    if (isWailsAvailable() && typeof window.go?.app?.App?.DeleteClipboardItem === 'function') {
      try {
        const updated = await deleteClipboardItem(id);
        set({ items: updated });
        saveFallbackItems(updated);
        return;
      } catch {
        // fallback
      }
    }
    const updated = get().items.filter((it) => it.id !== id);
    set({ items: updated });
    saveFallbackItems(updated);
  },

  clearUnpinned: async () => {
    if (isWailsAvailable() && typeof window.go?.app?.App?.ClearUnpinnedClipboardHistory === 'function') {
      try {
        const updated = await clearUnpinnedClipboardHistory();
        set({ items: updated });
        saveFallbackItems(updated);
        return;
      } catch {
        // fallback
      }
    }
    const updated = get().items.filter((it) => it.pinned);
    set({ items: updated });
    saveFallbackItems(updated);
  },

  copyItemToSystem: async (item: ClipboardHistoryItem) => {
    if (item.kind === 'text') {
      const signature = `text:${item.content.slice(0, 128)}:${item.content.length}`;
      set({ lastCapturedSignature: signature });
      await writeNativeClipboardText(item.content);
      const seq = await getClipboardSequenceNumber();
      if (seq > 0) set({ lastSequenceNumber: seq });
      return;
    }

    if (item.kind === 'image') {
      const signature = `image:${item.content.slice(0, 128)}:${item.content.length}`;
      set({ lastCapturedSignature: signature });

      if (isWailsAvailable() && typeof window.go?.app?.App?.SetNativeClipboardImage === 'function') {
        try {
          await setNativeClipboardImage(item.content);
          const seq = await getClipboardSequenceNumber();
          if (seq > 0) set({ lastSequenceNumber: seq });
          return;
        } catch {
          // fall through to WebView API
        }
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          const res = await fetch(item.content);
          const blob = await res.blob();
          const pngBlob = blob.type === 'image/png' ? blob : new Blob([await blob.arrayBuffer()], { type: 'image/png' });
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
          return;
        } catch {
          // fallback: copy data URL as text
        }
      }
      await writeNativeClipboardText(item.content);
      return;
    }

    if (item.kind === 'files') {
      try {
        const parsed = JSON.parse(item.content) as ClipboardFilesPayload;
        if (Array.isArray(parsed.paths) && parsed.paths.length > 0) {
          const isCut = parsed.mode === 'cut';
          useOperationsStore.setState({
            clipboard: {
              paths: parsed.paths,
              mode: isCut ? 'cut' : 'copy',
            },
          });
          await setNativeClipboardFiles(parsed.paths, isCut);
          const seq = await getClipboardSequenceNumber();
          if (seq > 0) set({ lastSequenceNumber: seq });
        }
      } catch {
        // ignore invalid payload
      }
    }
  },

  pasteFilesItemHere: async (item: ClipboardHistoryItem) => {
    if (item.kind !== 'files') return;
    const currentPath = useBrowserStore.getState().currentPath;
    if (!currentPath) return;

    try {
      const parsed = JSON.parse(item.content) as ClipboardFilesPayload;
      if (!Array.isArray(parsed.paths) || parsed.paths.length === 0) return;

      const verifyHash = useOperationsStore.getState().verifyHash;
      const opKind = parsed.mode === 'cut' ? 'move' : 'copy';
      useOperationsStore.setState({ panelOpen: true });
      await enqueueOperation(opKind, parsed.paths, currentPath, 'ask', verifyHash);
    } catch {
      // ignore
    }
  },

  saveItemToCurrentFolder: async (item: ClipboardHistoryItem, extOverride?: string) => {
    const browser = useBrowserStore.getState();
    const currentPath = browser.currentPath;
    if (!currentPath) return null;

    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '-');

    const defaultName =
      item.kind === 'image'
        ? `clipboard-${ts}.png`
        : `snippet-${ts}${extOverride || '.txt'}`;

    if (isWailsAvailable() && typeof window.go?.app?.App?.SaveClipboardItemToFolder === 'function') {
      const savedPath = await saveClipboardItemToFolder(item.id, currentPath, defaultName);
      browser.refresh();
      return savedPath;
    }
    return `${currentPath}/${defaultName}`;
  },

  syncFromSystemClipboard: async (forceRead = false) => {
    if (syncingInFlight) return;
    syncingInFlight = true;

    try {
      // 1. No desktop Wails, usa inspeção nativa do SO (CF_HDROP, PNG/DIB, CF_UNICODETEXT)
      if (isWailsAvailable() && typeof window.go?.app?.App?.ReadSystemClipboardSnapshot === 'function') {
        if (!forceRead) {
          const seq = await getClipboardSequenceNumber();
          if (seq > 0 && seq === get().lastSequenceNumber) {
            return;
          }
          // Pequeno atraso de estabilização para permitir que ferramentas de captura (Lightshot, Snipping Tool, ShareX)
          // concluam todas as escritas no clipboard e fechem seu overlay sem contenção.
          await new Promise((resolve) => setTimeout(resolve, 220));
        }

        const snap = await readSystemClipboardSnapshot();
        if (!snap || snap.busy) {
          // Se outra aplicação detém o clipboard ou o usuário está capturando a tela, não avança lastSequenceNumber!
          return;
        }
        if (snap.sequence > 0) {
          set({ lastSequenceNumber: snap.sequence });
        }

        if (snap.kind === 'files' && snap.paths && snap.paths.length > 0) {
          const mode: 'copy' | 'cut' = snap.cut ? 'cut' : 'copy';
          // Sincroniza sempre o botão Colar / estado de operações com o clipboard de arquivos do SO!
          const curClip = useOperationsStore.getState().clipboard;
          const isSameClip =
            curClip &&
            curClip.mode === mode &&
            curClip.paths.length === snap.paths.length &&
            curClip.paths.every((p, idx) => p === snap.paths![idx]);
          if (!isSameClip) {
            useOperationsStore.setState({
              clipboard: { paths: snap.paths, mode },
            });
          }

          if (!get().capturePaused) {
            const payload: ClipboardFilesPayload = { paths: snap.paths, mode };
            const json = JSON.stringify(payload);
            const sig = `files:${json.slice(0, 128)}:${json.length}`;
            if (sig !== get().lastCapturedSignature) {
              await get().addItem('files', json, buildPreview('files', json));
            }
          }
          return;
        }

        if (get().capturePaused) return;

        if (snap.kind === 'image' && snap.imageB64) {
          const sig = `image:${snap.imageB64.slice(0, 128)}:${snap.imageB64.length}`;
          if (sig !== get().lastCapturedSignature) {
            const w = snap.width || 0;
            const h = snap.height || 0;
            await get().addItem(
              'image',
              snap.imageB64,
              w && h ? `PNG (${w}×${h})` : 'PNG',
              w,
              h
            );
          }
          return;
        }

        if (snap.kind === 'text' && snap.text?.trim()) {
          const trimmed = snap.text.trim();
          const sig = `text:${trimmed.slice(0, 128)}:${trimmed.length}`;
          if (sig !== get().lastCapturedSignature) {
            await get().addItem('text', trimmed);
          }
          return;
        }
        return;
      }

      // 2. Fallback para ambiente Web/Browser sem Wails
      if (get().capturePaused) return;

      if (forceRead && typeof navigator !== 'undefined' && navigator.clipboard?.read) {
        try {
          const clipItems = await navigator.clipboard.read();
          for (const clipItem of clipItems) {
            const imgType = clipItem.types.find((t) => t.startsWith('image/'));
            if (imgType) {
              const blob = await clipItem.getType(imgType);
              const { dataUrl, width, height } = await blobToDataUrl(blob);
              if (dataUrl) {
                const sig = `image:${dataUrl.slice(0, 128)}:${dataUrl.length}`;
                if (sig !== get().lastCapturedSignature) {
                  await get().addItem(
                    'image',
                    dataUrl,
                    width && height ? `PNG (${width}×${height})` : 'PNG',
                    width,
                    height
                  );
                  return;
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }

      const text = await readNativeClipboardText();
      const trimmed = (text || '').trim();
      if (trimmed) {
        const sig = `text:${trimmed.slice(0, 128)}:${trimmed.length}`;
        if (sig !== get().lastCapturedSignature) {
          await get().addItem('text', trimmed);
        }
      }
    } catch {
      // ignore
    } finally {
      syncingInFlight = false;
    }
  },

  initClipboardMonitor: () => {
    void get().loadHistory();
    void get().syncFromSystemClipboard(true);

    // Subscribe to file copy/cut in useOperationsStore (includes SFTP paths too)
    let prevClipboard = useOperationsStore.getState().clipboard;
    const unsubOps = useOperationsStore.subscribe((state) => {
      if (state.clipboard && state.clipboard !== prevClipboard && state.clipboard.paths.length > 0) {
        prevClipboard = state.clipboard;
        const payload: ClipboardFilesPayload = {
          paths: state.clipboard.paths,
          mode: state.clipboard.mode,
        };
        const json = JSON.stringify(payload);
        const preview = buildPreview('files', json);
        void get().addItem('files', json, preview);
      } else if (!state.clipboard) {
        prevClipboard = null;
      }
    });

    const handleCopyOrCut = (e: ClipboardEvent) => {
      if (get().capturePaused) return;
      const directText = e.clipboardData?.getData('text/plain') || window.getSelection()?.toString() || '';
      if (directText.trim()) {
        void get().addItem('text', directText.trim());
      } else {
        setTimeout(() => {
          void get().syncFromSystemClipboard(true);
        }, 120);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (get().capturePaused) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            void blobToDataUrl(file).then(({ dataUrl, width, height }) => {
              if (dataUrl) {
                void get().addItem(
                  'image',
                  dataUrl,
                  width && height ? `PNG (${width}×${height})` : 'PNG',
                  width,
                  height
                );
              }
            });
          }
        }
      }
    };

    let focusSyncTimer: number | null = null;
    const clearFocusSyncTimer = () => {
      if (focusSyncTimer !== null) {
        window.clearTimeout(focusSyncTimer);
        focusSyncTimer = null;
      }
    };

    const handleFocus = () => {
      clearFocusSyncTimer();
      // Atraso suave ao retomar foco (ex.: fechamento do overlay do Lightshot) evitando corrida com SetClipboardData externo
      focusSyncTimer = window.setTimeout(() => {
        focusSyncTimer = null;
        void get().syncFromSystemClipboard(false);
      }, 380);
    };

    const handleBlur = () => {
      clearFocusSyncTimer();
    };

    document.addEventListener('copy', handleCopyOrCut);
    document.addEventListener('cut', handleCopyOrCut);
    document.addEventListener('paste', handlePaste);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Monitoramento leve por SequenceNumber (custo zero no Win32 mesmo em segundo plano!)
    const intervalId = window.setInterval(() => {
      void get().syncFromSystemClipboard(false);
    }, 1500);

    return () => {
      unsubOps();
      clearFocusSyncTimer();
      document.removeEventListener('copy', handleCopyOrCut);
      document.removeEventListener('cut', handleCopyOrCut);
      document.removeEventListener('paste', handlePaste);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.clearInterval(intervalId);
    };
  },
}));
