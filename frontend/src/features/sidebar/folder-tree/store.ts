import { create } from 'zustand';
import {
  TreeNode,
  DriveInfo,
  FavoriteItem,
  RecentItem,
  SavedNetworkDrive,
  treeRoots,
  treeChildren,
  listFavorites,
  addFavorite,
  removeFavorite,
  listRecent,
  getDrives,
  listSavedNetworkDrives,
  deleteSavedNetworkDrive,
  disconnectNetworkDrive,
  getAvailableDriveLetters,
} from '../../../lib/wails';
import { getCollator } from '../../../i18n/format';
import { registerSidebarStateGetter, triggerSessionSave } from '../../browser/store';

export interface FlatTreeNode {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  loading: boolean;
  parentPath: string | null;
}

interface NodeCacheEntry {
  children?: TreeNode[];
  loading: boolean;
  expanded: boolean;
  error?: string;
}

interface FolderTreeState {
  visible: boolean;
  width: number;
  followActiveTab: boolean;
  roots: TreeNode[];
  drives: DriveInfo[];
  favorites: FavoriteItem[];
  recent: RecentItem[];
  savedNetworkDrives: SavedNetworkDrive[];
  availableDriveLetters: string[];
  networkModalOpen: boolean;
  networkModalPrefill: Partial<SavedNetworkDrive> | null;
  nodesByPath: Record<string, NodeCacheEntry>;
  focusedPath: string | null;

  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleFollowActiveTab: () => void;
  collapseAll: () => void;
  setFocusedPath: (path: string | null) => void;
  loadRoots: () => Promise<void>;
  refreshSidebarMeta: () => Promise<void>;
  openNetworkModal: (prefill?: Partial<SavedNetworkDrive>) => Promise<void>;
  closeNetworkModal: () => void;
  removeSavedNetworkDrive: (id: number) => Promise<void>;
  disconnectMountedNetworkDrive: (target: string) => Promise<void>;
  toggleFavorite: (path: string, label?: string) => Promise<void>;
  toggleExpand: (node: TreeNode, showHidden: boolean, locale: string) => Promise<void>;
  expandLevel: (node: TreeNode, showHidden: boolean, locale: string) => Promise<void>;
  revealPath: (targetPath: string, showHidden: boolean, locale: string) => Promise<void>;
  hydrateSidebar: (
    saved?: {
      visible: boolean;
      width: number;
      followActiveTab: boolean;
      expandedPaths: string[];
    },
    showHidden?: boolean,
    locale?: string,
    initialDrives?: DriveInfo[],
    initialFavorites?: FavoriteItem[],
    initialRecent?: RecentItem[],
    initialSavedNetworkDrives?: SavedNetworkDrive[]
  ) => Promise<void>;
}

const DEFAULT_SIDEBAR_WIDTH = 250;

export const useFolderTreeStore = create<FolderTreeState>((set, get) => ({
  visible: true,
  width: DEFAULT_SIDEBAR_WIDTH,
  followActiveTab: true,
  roots: [],
  drives: [],
  favorites: [],
  recent: [],
  savedNetworkDrives: [],
  availableDriveLetters: [],
  networkModalOpen: false,
  networkModalPrefill: null,
  nodesByPath: {},
  focusedPath: null,

  toggleSidebar: () => {
    set((s) => ({ visible: !s.visible }));
    triggerSessionSave();
  },

  setSidebarWidth: (width: number) => {
    const clamped = Math.max(170, Math.min(520, width));
    set({ width: clamped });
    triggerSessionSave();
  },

  toggleFollowActiveTab: () => {
    set((s) => ({ followActiveTab: !s.followActiveTab }));
    triggerSessionSave();
  },

  collapseAll: () => {
    set((state) => {
      const next: Record<string, NodeCacheEntry> = {};
      for (const [k, v] of Object.entries(state.nodesByPath)) {
        next[k] = { ...v, expanded: false };
      }
      return { nodesByPath: next };
    });
    triggerSessionSave();
  },

  setFocusedPath: (path: string | null) => {
    set({ focusedPath: path });
  },

  loadRoots: async () => {
    const roots = await treeRoots();
    set({ roots });
    await get().refreshSidebarMeta();
  },

  refreshSidebarMeta: async () => {
    const [drives, favorites, recent, savedNetworkDrives] = await Promise.all([
      getDrives(),
      listFavorites(),
      listRecent(),
      listSavedNetworkDrives(),
    ]);
    set({ drives, favorites, recent, savedNetworkDrives });
  },

  openNetworkModal: async (prefill) => {
    const letters = await getAvailableDriveLetters();
    set({
      availableDriveLetters: letters,
      networkModalPrefill: prefill || null,
      networkModalOpen: true,
    });
  },

  closeNetworkModal: () => {
    set({ networkModalOpen: false, networkModalPrefill: null });
  },

  removeSavedNetworkDrive: async (id: number) => {
    await deleteSavedNetworkDrive(id);
    const savedNetworkDrives = await listSavedNetworkDrives();
    set({ savedNetworkDrives });
  },

  disconnectMountedNetworkDrive: async (target: string) => {
    await disconnectNetworkDrive(target);
    await get().refreshSidebarMeta();
  },

  toggleFavorite: async (path: string, label = '') => {
    if (!path) return;
    const isFav = get().favorites.some((f) => f.path === path);
    if (isFav) {
      await removeFavorite(path);
    } else {
      await addFavorite(path, label);
    }
    const favorites = await listFavorites();
    set({ favorites });
  },

  toggleExpand: async (node: TreeNode, showHidden: boolean, locale: string) => {
    const pathKey = node.location.path;
    const current = get().nodesByPath[pathKey];

    if (current?.expanded) {
      set((state) => ({
        nodesByPath: {
          ...state.nodesByPath,
          [pathKey]: { ...current, expanded: false },
        },
      }));
      triggerSessionSave();
      return;
    }

    set((state) => ({
      nodesByPath: {
        ...state.nodesByPath,
        [pathKey]: {
          ...state.nodesByPath[pathKey],
          expanded: true,
          loading: !state.nodesByPath[pathKey]?.children,
        },
      },
    }));

    try {
      const children = await treeChildren(pathKey, showHidden);
      const collator = getCollator(locale);
      const sorted = [...children].sort((a, b) => collator.compare(a.name, b.name));

      set((state) => {
        const entry = state.nodesByPath[pathKey];
        if (!entry?.expanded) {
          return state;
        }
        return {
          nodesByPath: {
            ...state.nodesByPath,
            [pathKey]: {
              children: sorted,
              loading: false,
              expanded: true,
            },
          },
        };
      });
      triggerSessionSave();
    } catch (err) {
      set((state) => ({
        nodesByPath: {
          ...state.nodesByPath,
          [pathKey]: {
            children: [],
            loading: false,
            expanded: true,
            error: String(err),
          },
        },
      }));
    }
  },

  expandLevel: async (node: TreeNode, showHidden: boolean, locale: string) => {
    const state = get();
    const entry = state.nodesByPath[node.location.path];
    if (!entry?.expanded) {
      await state.toggleExpand(node, showHidden, locale);
    }
    const updated = get().nodesByPath[node.location.path];
    if (!updated?.children) return;
    for (const child of updated.children) {
      if (!child.isLink && child.hasChildren !== 'no') {
        const childEntry = get().nodesByPath[child.location.path];
        if (!childEntry?.expanded) {
          await get().toggleExpand(child, showHidden, locale);
        }
      }
    }
  },

  revealPath: async (targetPath: string, showHidden: boolean, locale: string) => {
    const { followActiveTab, roots } = get();
    if (!followActiveTab || !targetPath) return;

    set({ focusedPath: targetPath });

    const normalizedTarget = targetPath.replace(/\\/g, '/').toLowerCase();
    let bestRoot: TreeNode | undefined;
    for (const r of roots) {
      const normRoot = r.location.path.replace(/\\/g, '/').toLowerCase();
      if (normalizedTarget.startsWith(normRoot)) {
        if (!bestRoot || normRoot.length > bestRoot.location.path.length) {
          bestRoot = r;
        }
      }
    }
    if (!bestRoot) return;

    const rootPath = bestRoot.location.path;
    if (rootPath.replace(/\\/g, '/').toLowerCase() === normalizedTarget) {
      return;
    }

    const isSftp = targetPath.startsWith('sftp://');
    const isWin = !isSftp && /^[a-zA-Z]:/.test(targetPath);
    const sep = isWin ? '\\' : '/';
    const rel = targetPath.slice(rootPath.length).replace(/^[\\/]+/, '');
    const parts = rel.split(/[\\/]+/).filter(Boolean);

    let currPath = rootPath.replace(/[\\/]+$/, '');
    if (isSftp) {
      currPath = rootPath.endsWith('/') ? rootPath : `${rootPath}/`;
    } else if (isWin && /^[a-zA-Z]:$/.test(currPath)) {
      currPath += '\\';
    } else if (!isWin && currPath === '') {
      currPath = '/';
    }

    const chain: string[] = [currPath];
    for (let i = 0; i < parts.length - 1; i++) {
      currPath = currPath.endsWith(sep)
        ? `${currPath}${parts[i]}`
        : `${currPath}${sep}${parts[i]}`;
      chain.push(currPath);
    }

    const collator = getCollator(locale);
    for (const ancestorPath of chain) {
      const existing = get().nodesByPath[ancestorPath];
      if (existing?.expanded && existing.children) {
        continue;
      }
      try {
        const children = await treeChildren(ancestorPath, showHidden);
        const sorted = [...children].sort((a, b) => collator.compare(a.name, b.name));
        set((state) => ({
          nodesByPath: {
            ...state.nodesByPath,
            [ancestorPath]: {
              children: sorted,
              loading: false,
              expanded: true,
            },
          },
        }));
      } catch {
        break;
      }
    }
  },

  hydrateSidebar: async (
    saved,
    showHidden = false,
    locale = 'pt-BR',
    initialDrives = [],
    initialFavorites = [],
    initialRecent = [],
    initialSavedNetworkDrives = []
  ) => {
    set({
      drives: initialDrives,
      favorites: initialFavorites,
      recent: initialRecent,
      savedNetworkDrives: initialSavedNetworkDrives,
    });
    await get().loadRoots();
    if (!saved) return;

    set({
      visible: saved.visible ?? true,
      width: saved.width || DEFAULT_SIDEBAR_WIDTH,
      followActiveTab: saved.followActiveTab ?? true,
    });

    if (Array.isArray(saved.expandedPaths) && saved.expandedPaths.length > 0) {
      const collator = getCollator(locale);
      for (const p of saved.expandedPaths) {
        try {
          const children = await treeChildren(p, showHidden);
          const sorted = [...children].sort((a, b) => collator.compare(a.name, b.name));
          set((state) => ({
            nodesByPath: {
              ...state.nodesByPath,
              [p]: {
                children: sorted,
                loading: false,
                expanded: true,
              },
            },
          }));
        } catch {
          // Ignora pastas que deixaram de existir entre sessões
        }
      }
    }
  },
}));

registerSidebarStateGetter(() => {
  const s = useFolderTreeStore.getState();
  const expandedPaths = Object.entries(s.nodesByPath)
    .filter(([, val]) => val.expanded)
    .map(([k]) => k);
  return {
    visible: s.visible,
    width: s.width,
    followActiveTab: s.followActiveTab,
    expandedPaths,
  };
});

export function buildFlatTree(
  roots: TreeNode[],
  nodesByPath: Record<string, NodeCacheEntry>
): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];

  function walk(node: TreeNode, depth: number, parentPath: string | null) {
    const entry = nodesByPath[node.location.path];
    const expanded = !!entry?.expanded;
    const loading = !!entry?.loading;

    result.push({
      node,
      depth,
      expanded,
      loading,
      parentPath,
    });

    if (expanded && entry?.children) {
      for (const child of entry.children) {
        walk(child, depth + 1, node.location.path);
      }
    }
  }

  for (const root of roots) {
    walk(root, 1, null);
  }
  return result;
}
