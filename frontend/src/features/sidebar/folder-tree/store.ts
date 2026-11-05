import { create } from 'zustand';
import { TreeNode, treeRoots, treeChildren } from '../../../lib/wails';
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
  nodesByPath: Record<string, NodeCacheEntry>;
  focusedPath: string | null;

  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleFollowActiveTab: () => void;
  setFocusedPath: (path: string | null) => void;
  loadRoots: () => Promise<void>;
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
    locale?: string
  ) => Promise<void>;
}

const DEFAULT_SIDEBAR_WIDTH = 240;

export const useFolderTreeStore = create<FolderTreeState>((set, get) => ({
  visible: true,
  width: DEFAULT_SIDEBAR_WIDTH,
  followActiveTab: true,
  roots: [],
  nodesByPath: {},
  focusedPath: null,

  toggleSidebar: () => {
    set((s) => ({ visible: !s.visible }));
    triggerSessionSave();
  },

  setSidebarWidth: (width: number) => {
    const clamped = Math.max(160, Math.min(520, width));
    set({ width: clamped });
    triggerSessionSave();
  },

  toggleFollowActiveTab: () => {
    set((s) => ({ followActiveTab: !s.followActiveTab }));
    triggerSessionSave();
  },

  setFocusedPath: (path: string | null) => {
    set({ focusedPath: path });
  },

  loadRoots: async () => {
    const roots = await treeRoots();
    set({ roots });
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

    // Symlinks não são expandidos recursivamente de forma automática se já houver ciclo,
    // mas clique explícito do usuário no nó carrega 1 nível se ainda não carregado.
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
          // Descarta se o nó foi recolhido antes da resposta
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

    // Encontrar raiz correspondente mais específica
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

    // Construir lista de ancestrais entre rootPath e targetPath
    const isWin = /^[a-zA-Z]:/.test(targetPath);
    const sep = isWin ? '\\' : '/';
    const rel = targetPath
      .slice(rootPath.length)
      .replace(/^[\\/]+/, '');
    const parts = rel.split(/[\\/]+/).filter(Boolean);

    let currPath = rootPath.replace(/[\\/]+$/, '');
    if (isWin && /^[a-zA-Z]:$/.test(currPath)) {
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

  hydrateSidebar: async (saved, showHidden = false, locale = 'pt-BR') => {
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

// Registrar getter da árvore para ser persistido junto à sessão
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

    // Não expandir symlinks recursivamente além do nível aberto manualmente
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

