import { create } from 'zustand';
import {
  BatchRenameOptions,
  BatchRenamePreviewItem,
  FolderDiffItem,
  FileHashes,
  ItemTag,
  ArchiveEntry,
  RemoteProfile,
  SFTPConnectRequest,
  SFTPConnectResult,
  LocalSSHKey,
  previewBatchRename,
  executeBatchRename,
  compareDirectories,
  computeHashes,
  listItemTags,
  setItemTag,
  removeItemTag,
  listArchive,
  createArchive,
  extractArchiveTo,
  showFolderDialog,
  isExtractableArchive,
  ExtractResult,
  listRemoteProfiles,
  saveRemoteProfile,
  deleteRemoteProfile,
  connectRemoteSFTP,
  disconnectRemoteSFTP,
  listActiveSFTPConnections,
  detectLocalSSHKeys,
} from '../../lib/wails';
import { useBrowserStore } from '../browser/store';
import { useDualPaneStore } from '../panes/store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { useTerminalStore } from '../terminal/store';

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
  { id: 'clipboardHistory', labelKey: 'clipboardHistory.title', defaultKey: 'Alt+V', currentKey: 'Alt+V' },
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

function readArchivePref(key: string, fallback: boolean): boolean {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function writeArchivePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // armazenamento indisponível: ignora
  }
}

/** Pasta que contém o arquivo informado (aceita separadores Windows e POSIX). */
export function parentDirOf(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  if (idx <= 0) return filePath;
  const parent = filePath.slice(0, idx);
  return /^[a-zA-Z]:$/.test(parent) ? `${parent}\\` : parent;
}

function finishExtraction(result: ExtractResult, openAfter: boolean): void {
  const browser = useBrowserStore.getState();
  if (openAfter && result.destDir) {
    browser.navigateTo(result.destDir);
  } else {
    browser.refresh();
  }
}

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

  archiveOpen: boolean;
  archivePath: string;
  archiveEntries: ArchiveEntry[];
  archiveLoading: boolean;
  /** Pasta onde o conteúdo será extraído (padrão: pasta do próprio compactado). */
  archiveDestDir: string;
  /** Cria uma subpasta com o nome do compactado dentro de archiveDestDir. */
  archiveCreateSubfolder: boolean;
  /** Navega até a pasta extraída ao concluir. */
  archiveOpenAfter: boolean;
  archiveExtracting: boolean;
  archiveError: string | null;
  archiveLastResult: ExtractResult | null;

  remoteOpen: boolean;
  remoteProfiles: RemoteProfile[];
  activeSftpIds: number[];
  localSshKeys: LocalSSHKey[];
  sftpConnecting: boolean;
  sftpError: string | null;
  sftpTrustPrompt: SFTPConnectResult | null;
  pendingConnectReq: SFTPConnectRequest | null;

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

  openArchiveModal: (targetArchivePath?: string) => Promise<void>;
  closeArchiveModal: () => void;
  compressSelection: (archiveName: string, format: 'zip' | 'tar.gz') => Promise<void>;
  extractCurrentArchive: (destDir?: string) => Promise<void>;
  setArchiveExtractOptions: (
    partial: Partial<Pick<ProductivityState, 'archiveDestDir' | 'archiveCreateSubfolder' | 'archiveOpenAfter'>>
  ) => void;
  chooseArchiveDestination: () => Promise<void>;
  /** Extração rápida (menu de contexto). parentDir vazio = pasta do compactado. */
  quickExtractArchive: (
    archivePath: string,
    opts: { parentDir?: string; createSubfolder: boolean; openAfter?: boolean }
  ) => Promise<ExtractResult | null>;
  /** Abre o seletor de pasta e extrai o compactado no destino escolhido. */
  extractArchiveToChosenFolder: (archivePath: string) => Promise<void>;

  openRemoteModal: () => Promise<void>;
  closeRemoteModal: () => void;
  loadRemoteState: () => Promise<void>;
  addRemoteProfile: (profile: Omit<RemoteProfile, 'id'>) => Promise<number>;
  removeRemoteProfile: (id: number) => Promise<void>;
  connectSFTP: (req: SFTPConnectRequest) => Promise<boolean>;
  confirmSftpTrustAndConnect: () => Promise<boolean>;
  cancelSftpTrustPrompt: () => void;
  disconnectSFTP: (profileId: number) => Promise<void>;
  openSshTerminalSession: (profile: RemoteProfile) => Promise<void>;
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

  archiveOpen: false,
  archivePath: '',
  archiveEntries: [],
  archiveLoading: false,
  archiveDestDir: '',
  archiveCreateSubfolder: readArchivePref('pulsares.archive.createSubfolder', true),
  archiveOpenAfter: readArchivePref('pulsares.archive.openAfter', false),
  archiveExtracting: false,
  archiveError: null,
  archiveLastResult: null,

  remoteOpen: false,
  remoteProfiles: [],
  activeSftpIds: [],
  localSshKeys: [],
  sftpConnecting: false,
  sftpError: null,
  sftpTrustPrompt: null,
  pendingConnectReq: null,

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

  openArchiveModal: async (targetArchivePath) => {
    const selected = Array.from(useBrowserStore.getState().selectedPaths);
    const candidate = targetArchivePath || selected[0] || '';
    const isArchive = isExtractableArchive(candidate);

    set({
      archiveOpen: true,
      archivePath: isArchive ? candidate : '',
      archiveEntries: [],
      archiveLoading: isArchive,
      archiveDestDir: isArchive ? parentDirOf(candidate) : '',
      archiveExtracting: false,
      archiveError: null,
      archiveLastResult: null,
    });

    if (isArchive) {
      try {
        const entries = await listArchive(candidate);
        set({ archiveEntries: entries, archiveLoading: false });
      } catch {
        set({ archiveLoading: false });
      }
    }
  },

  closeArchiveModal: () =>
    set({ archiveOpen: false, archiveEntries: [], archivePath: '', archiveError: null }),

  compressSelection: async (archiveName, format) => {
    const browser = useBrowserStore.getState();
    const sources = Array.from(browser.selectedPaths);
    if (sources.length === 0 || !browser.currentPath) return;

    const sep = browser.currentPath.includes('\\') ? '\\' : '/';
    const ext = format === 'tar.gz' ? '.tar.gz' : '.zip';
    const base = archiveName.trim() || 'compactado';
    const fileName = base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
    const destPath = browser.currentPath.endsWith(sep)
      ? `${browser.currentPath}${fileName}`
      : `${browser.currentPath}${sep}${fileName}`;

    await createArchive(sources, destPath);
    set({ archiveOpen: false });
    browser.refresh();
  },

  extractCurrentArchive: async (destDir) => {
    const { archivePath, archiveDestDir, archiveCreateSubfolder, archiveOpenAfter } = get();
    if (!archivePath) return;
    const parentDir = (destDir ?? archiveDestDir).trim() || parentDirOf(archivePath);

    set({ archiveExtracting: true, archiveError: null });
    try {
      const result = await extractArchiveTo(archivePath, parentDir, archiveCreateSubfolder);
      set({ archiveExtracting: false, archiveLastResult: result, archiveOpen: false });
      finishExtraction(result, archiveOpenAfter);
    } catch (err) {
      set({ archiveExtracting: false, archiveError: String((err as Error)?.message || err) });
    }
  },

  setArchiveExtractOptions: (partial) => {
    if (partial.archiveCreateSubfolder !== undefined) {
      writeArchivePref('pulsares.archive.createSubfolder', partial.archiveCreateSubfolder);
    }
    if (partial.archiveOpenAfter !== undefined) {
      writeArchivePref('pulsares.archive.openAfter', partial.archiveOpenAfter);
    }
    set(partial);
  },

  chooseArchiveDestination: async () => {
    const { archiveDestDir, archivePath } = get();
    const chosen = await showFolderDialog(
      'Escolher pasta de destino da extração',
      archiveDestDir || parentDirOf(archivePath)
    );
    if (chosen) set({ archiveDestDir: chosen });
  },

  quickExtractArchive: async (archivePath, opts) => {
    if (!isExtractableArchive(archivePath)) return null;
    try {
      const result = await extractArchiveTo(
        archivePath,
        opts.parentDir?.trim() || parentDirOf(archivePath),
        opts.createSubfolder
      );
      set({ archiveLastResult: result });
      finishExtraction(result, opts.openAfter ?? get().archiveOpenAfter);
      return result;
    } catch (err) {
      // Em caso de falha, abre o modal com o erro para o usuário ajustar o destino
      await get().openArchiveModal(archivePath);
      set({ archiveError: String((err as Error)?.message || err) });
      return null;
    }
  },

  extractArchiveToChosenFolder: async (archivePath) => {
    const chosen = await showFolderDialog(
      'Extrair para… (escolha a pasta de destino)',
      parentDirOf(archivePath)
    );
    if (!chosen) return;
    await get().quickExtractArchive(archivePath, {
      parentDir: chosen,
      createSubfolder: get().archiveCreateSubfolder,
    });
  },

  openRemoteModal: async () => {
    set({ remoteOpen: true, sftpError: null, sftpTrustPrompt: null });
    await get().loadRemoteState();
  },

  closeRemoteModal: () =>
    set({
      remoteOpen: false,
      sftpError: null,
      sftpTrustPrompt: null,
      pendingConnectReq: null,
      sftpConnecting: false,
    }),

  loadRemoteState: async () => {
    const [profiles, activeIds, keys] = await Promise.all([
      listRemoteProfiles(),
      listActiveSFTPConnections(),
      detectLocalSSHKeys(),
    ]);
    set({
      remoteProfiles: profiles || [],
      activeSftpIds: activeIds || [],
      localSshKeys: keys || [],
    });
  },

  addRemoteProfile: async (profile) => {
    const saved = await saveRemoteProfile({ id: 0, ...profile });
    const profiles = await listRemoteProfiles();
    set({ remoteProfiles: profiles });
    return saved;
  },

  removeRemoteProfile: async (id) => {
    if (get().activeSftpIds.includes(id)) {
      await get().disconnectSFTP(id);
    }
    await deleteRemoteProfile(id);
    const profiles = await listRemoteProfiles();
    set({ remoteProfiles: profiles });
  },

  connectSFTP: async (req) => {
    set({ sftpConnecting: true, sftpError: null, sftpTrustPrompt: null, pendingConnectReq: req });
    try {
      const res = await connectRemoteSFTP(req);
      if (!res) {
        set({ sftpConnecting: false, sftpError: 'Não foi possível iniciar a conexão SFTP.' });
        return false;
      }
      if (res.needsHostTrust || res.hostKeyMismatch) {
        set({
          sftpConnecting: false,
          sftpTrustPrompt: res,
          pendingConnectReq: req,
        });
        return false;
      }
      if (!res.connected && res.message) {
        set({ sftpConnecting: false, sftpError: res.message });
        return false;
      }
      if (res.connected) {
        await get().loadRemoteState();
        await useFolderTreeStore.getState().loadRoots();
        set({
          sftpConnecting: false,
          sftpError: null,
          sftpTrustPrompt: null,
          pendingConnectReq: null,
          remoteOpen: false,
        });
        const target = res.initialPath || `sftp://${res.profileId || req.profileId}/`;
        await useBrowserStore.getState().navigateTo(target);
        return true;
      }
      set({ sftpConnecting: false });
      return false;
    } catch (err) {
      set({ sftpConnecting: false, sftpError: String(err) });
      return false;
    }
  },

  confirmSftpTrustAndConnect: async () => {
    const { pendingConnectReq, sftpTrustPrompt } = get();
    if (!pendingConnectReq || !sftpTrustPrompt) return false;
    return get().connectSFTP({
      ...pendingConnectReq,
      trustHost: true,
    });
  },

  cancelSftpTrustPrompt: () => {
    set({ sftpTrustPrompt: null, pendingConnectReq: null });
  },

  disconnectSFTP: async (profileId) => {
    await disconnectRemoteSFTP(profileId);
    await get().loadRemoteState();
    await useFolderTreeStore.getState().loadRoots();
    const browser = useBrowserStore.getState();
    if (browser.currentPath.startsWith(`sftp://${profileId}`)) {
      const roots = useFolderTreeStore.getState().roots.filter((r) => !r.location.path.startsWith('sftp://'));
      if (roots.length > 0) {
        await browser.navigateTo(roots[0].location.path);
      }
    }
  },

  openSshTerminalSession: async (profile) => {
    const termStore = useTerminalStore.getState();
    const browser = useBrowserStore.getState();
    const localCwd = browser.currentPath.startsWith('sftp://') ? '/' : browser.currentPath || '/';
    const tabId = await termStore.createSession(localCwd, undefined, `SSH: ${profile.name}`);
    const portArg = profile.port && profile.port !== 22 ? ` -p ${profile.port}` : '';
    const keyArg =
      profile.authType === 'key' && profile.keyPath
        ? ` -i "${profile.keyPath.replace(/"/g, '\\"')}"`
        : '';
    const target = profile.username ? `${profile.username}@${profile.host}` : profile.host;
    const sshCmd = `ssh${portArg}${keyArg} ${target}\r\n`;
    setTimeout(() => {
      void useTerminalStore.getState().sendInput(tabId, sshCmd);
    }, 180);
  },
}));

