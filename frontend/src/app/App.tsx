import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabBar } from '../features/tabs/TabBar';
import { AddressBar } from '../features/address-bar/AddressBar';
import { OperationsToolbar } from '../features/operations/OperationsToolbar';
import { OperationsPanel } from '../features/operations/OperationsPanel';
import { Sidebar } from '../features/sidebar/Sidebar';
import { DetailsView } from '../features/browser/DetailsView';
import { AlternativeViews } from '../features/preview/AlternativeViews';
import { PreviewPanel } from '../features/preview/PreviewPanel';
import { SearchDrawer } from '../features/search/SearchDrawer';
import { ProductivityModals } from '../features/productivity/ProductivityModals';
import { SecondaryPane } from '../features/panes/SecondaryPane';
import { TerminalPanel } from '../features/terminal/TerminalPanel';
import { StatusBar } from '../features/browser/StatusBar';
import { useBrowserStore } from '../features/browser/store';
import { useFolderTreeStore } from '../features/sidebar/folder-tree/store';
import { useOperationsStore } from '../features/operations/store';
import { useDualPaneStore } from '../features/panes/store';
import { useTerminalStore } from '../features/terminal/store';
import { usePreviewStore } from '../features/preview/store';
import { useSearchStore } from '../features/search/store';
import { useProductivityStore } from '../features/productivity/store';
import { useEditorStore, isStandaloneStudioWindow } from '../features/editor/store';
import { CodeEditorModal } from '../features/editor/CodeEditorModal';
import {
  useDBStudioStore,
  isStandaloneDBStudioWindow,
  setDedicatedDBStudioWindow,
  isDatabaseFile,
} from '../features/db-studio/store';
import { DBStudioModal } from '../features/db-studio/DBStudioModal';
import { DBCreatorModal } from '../features/db-creator/DBCreatorModal';
import {
  FileContextMenu,
  ContextMenuTarget,
} from '../features/context-menu/FileContextMenu';
import { Entry, getInitialState, enqueueOperation, openPath } from '../lib/wails';
import { resolveLanguage } from '../i18n/config';

export const App: React.FC = () => {
  const { i18n } = useTranslation();
  const {
    hydrateSession,
    initListener,
    newTab,
    closeTab,
    reopenClosedTab,
    nextTab,
    switchTab,
    activeTabId,
    tabs,
    currentPath,
    selectedPaths,
    filterQuery,
    entries,
    rawEntries,
    setFilterQuery,
    goBack,
    goForward,
    goUp,
    refresh,
    selectAll,
    clearSelection,
  } = useBrowserStore();
  const { hydrateSidebar, toggleSidebar, refreshSidebarMeta } = useFolderTreeStore();
  const {
    initOpsListeners,
    copySelection,
    cutSelection,
    pasteIntoCurrent,
    trashSelection,
    requestPermanentDelete,
    requestRenameSelection,
    openPrompt,
    openProperties,
    undo,
    redo,
  } = useOperationsStore();
  const {
    layoutMode,
    splitRatio,
    setSplitRatio,
    setFocusedPane,
    initSecondaryListeners,
    copyToOppositePane,
    moveToOppositePane,
  } = useDualPaneStore();
  const {
    togglePanel: toggleTerminalPanel,
    createSession: createTerminalSession,
    visible: terminalVisible,
    setSearchOpen: setTerminalSearchOpen,
  } = useTerminalStore();
  const {
    viewMode,
    quickLookOpen,
    toggleQuickLook,
    closeQuickLook,
    density,
  } = usePreviewStore();
  const { toggleDrawer: toggleSearchDrawer } = useSearchStore();
  const { togglePalette, openBatchRename, loadTags } = useProductivityStore();
  const [theme, setTheme] = useState<string>('dark');
  const [isStudioMode, setIsStudioMode] = useState<boolean>(() => isStandaloneStudioWindow());
  const [isDBStudioMode, setIsDBStudioMode] = useState<boolean>(() => isStandaloneDBStudioWindow());
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Bloqueia o menu de contexto padrão do navegador/WebView2 globalmente
  useEffect(() => {
    const suppressNativeBrowserMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', suppressNativeBrowserMenu);
    return () => window.removeEventListener('contextmenu', suppressNativeBrowserMenu);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    const cleanupBrowser = initListener();
    const cleanupOps = initOpsListeners();
    const cleanupSecondary = initSecondaryListeners();
    void loadTags();

    getInitialState().then((state) => {
      // 1. Resolver e aplicar idioma
      const lang = resolveLanguage(state.systemLanguage, state.language);
      i18n.changeLanguage(lang);

      // 2. Aplicar tema
      let initialTheme = state.theme;
      if (initialTheme === 'system' || !initialTheme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        initialTheme = prefersDark ? 'dark' : 'light';
      }
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);

      // 3. Reidratar sessão (abas + painel lateral + favoritos + unidades + recentes)
      const initialPath = state.homeDir || (state.drives.length > 0 ? state.drives[0].path : '/');
      if (state.dbStudioMode || isStandaloneDBStudioWindow()) {
        setDedicatedDBStudioWindow(true);
        setIsDBStudioMode(true);
        document.title = 'Pulsares DB Studio';
        if (state.dbStudioTarget) {
          void useDBStudioStore.getState().openDatabase(state.dbStudioTarget, { forceInline: true });
        }
        return;
      }
      if (state.studioMode || isStandaloneStudioWindow()) {
        setIsStudioMode(true);
        document.title = 'Pulsares Studio Editor';
        void useEditorStore.getState().hydrateStudioFromStorage(state.studioTarget, initialPath);
        return;
      }
      const savedSidebar = hydrateSession(state.sessionData, initialPath);
      hydrateSidebar(
        savedSidebar,
        false,
        lang,
        state.drives,
        state.favorites || [],
        state.recent || []
      );
    });

    return () => {
      cleanupBrowser();
      cleanupOps();
      cleanupSecondary();
    };
  }, [hydrateSession, hydrateSidebar, initListener, initOpsListeners, initSecondaryListeners, i18n]);

  // Atualizar lista de recentes sempre que a pasta ativa mudar
  useEffect(() => {
    if (currentPath) {
      refreshSidebarMeta();
    }
  }, [currentPath, refreshSidebarMeta]);

  // Atalhos globais de teclado e botões laterais do mouse (0.1.0 a 0.7.0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      const isInputFocused =
        targetEl?.tagName === 'INPUT' ||
        targetEl?.tagName === 'TEXTAREA' ||
        targetEl?.tagName === 'SELECT' ||
        targetEl?.isContentEditable;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Atalhos do Terminal Integrado funcionam mesmo com foco no input do terminal (Ctrl+` / Ctrl+Shift+`)
      if (mod && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        if (e.shiftKey) {
          void createTerminalSession(currentPath || '/');
        } else {
          void toggleTerminalPanel(currentPath || '/');
        }
        return;
      }

      if (mod && e.shiftKey && key === 'f' && terminalVisible) {
        e.preventDefault();
        setTerminalSearchOpen(true);
        return;
      }

      if (mod && e.shiftKey && key === 's') {
        e.preventDefault();
        toggleSearchDrawer();
        return;
      }

      if (mod && e.shiftKey && key === 'p') {
        e.preventDefault();
        togglePalette();
        return;
      }

      // Focar filtro instantâneo na pasta: Ctrl+F
      if (mod && !e.shiftKey && key === 'f' && !isInputFocused) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pulsares:focus-instant-filter'));
        return;
      }

      // Focar barra de endereço: Ctrl+L ou Alt+D (exceto quando no input do terminal)
      if (!isInputFocused && ((mod && key === 'l') || (e.altKey && key === 'd'))) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pulsares:focus-address-bar'));
        return;
      }

      if (isInputFocused) return;

      // Teclas diretas sem modificador Ctrl/Cmd
      if (!mod && !e.altKey) {
        if (e.code === 'Space' && selectedPaths.size > 0) {
          e.preventDefault();
          toggleQuickLook();
          return;
        }
        if (e.key === 'F5') {
          e.preventDefault();
          if (layoutMode !== 'single' && selectedPaths.size > 0) {
            copyToOppositePane();
          } else {
            refresh();
          }
          return;
        }
        if (e.key === 'F6' && layoutMode !== 'single') {
          e.preventDefault();
          moveToOppositePane();
          return;
        }
        if (e.key === 'F2') {
          e.preventDefault();
          if (selectedPaths.size > 1) {
            void openBatchRename(Array.from(selectedPaths));
          } else {
            requestRenameSelection();
          }
          return;
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          if (e.shiftKey) {
            requestPermanentDelete();
          } else {
            trashSelection();
          }
          return;
        }
        if (e.key === 'Escape') {
          if (quickLookOpen) {
            closeQuickLook();
          } else if (useBrowserStore.getState().filterQuery) {
            useBrowserStore.getState().setFilterQuery('');
          } else {
            clearSelection();
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          useBrowserStore.getState().stepSelection(1, e.shiftKey);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          useBrowserStore.getState().stepSelection(-1, e.shiftKey);
          return;
        }
        if (e.key === 'Enter' && selectedPaths.size > 0) {
          e.preventDefault();
          const firstPath = Array.from(selectedPaths)[0];
          const entry = useBrowserStore
            .getState()
            .entries.find((it) => it.location.path === firstPath);
          if (entry) {
            if (entry.kind === 'dir') {
              useBrowserStore.getState().navigateTo(entry.location.path);
            } else if (isDatabaseFile(entry.name)) {
              void useDBStudioStore.getState().openDatabase(entry.location.path);
            } else {
              void openPath(entry.location.path);
            }
          }
          return;
        }
        if (e.key === 'Backspace') {
          const fq = useBrowserStore.getState().filterQuery;
          if (fq) {
            e.preventDefault();
            useBrowserStore.getState().setFilterQuery(fq.slice(0, -1));
            return;
          }
          e.preventDefault();
          goUp();
          return;
        }

        // Busca intuitiva nativa ao digitar caracteres diretamente dentro da pasta (Type-to-Search)
        const hasModalOpen =
          useSearchStore.getState().drawerOpen ||
          useProductivityStore.getState().paletteOpen ||
          useProductivityStore.getState().batchRenameOpen ||
          useProductivityStore.getState().compareOpen ||
          useProductivityStore.getState().hashOpen ||
          useProductivityStore.getState().shortcutsOpen ||
          useProductivityStore.getState().archiveOpen ||
          useProductivityStore.getState().remoteOpen ||
          useOperationsStore.getState().promptKind !== null ||
          useOperationsStore.getState().propertiesData !== null ||
          (useEditorStore.getState().isOpen && !useEditorStore.getState().isMinimized) ||
          (useDBStudioStore.getState().isOpen && !useDBStudioStore.getState().isMinimized);

        if (
          !hasModalOpen &&
          e.key.length === 1 &&
          e.code !== 'Space' &&
          /^[\p{L}\p{N}._-]$/u.test(e.key)
        ) {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent('pulsares:focus-instant-filter', {
              detail: { appendChar: e.key },
            })
          );
          return;
        }
      }

      // Navegação Alt+Setas e Propriedades (Alt+Enter)
      if (e.altKey && !mod) {
        if (e.key === 'Enter') {
          e.preventDefault();
          void openProperties();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goBack();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          goForward();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          goUp();
          return;
        }
      }

      if (!mod) return;

      if (key === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (key === 'e') {
        e.preventDefault();
        const firstSelected = Array.from(selectedPaths)[0];
        const entry = useBrowserStore
          .getState()
          .entries.find((it) => it.location.path === firstSelected);
        if (entry && entry.kind !== 'dir') {
          void useEditorStore.getState().openFileInEditor(entry.location.path);
        } else {
          useEditorStore.getState().openNewUntitledTab(currentPath, 'markdown');
        }
      } else if (key === 'r') {
        e.preventDefault();
        refresh();
      } else if (key === 'a') {
        e.preventDefault();
        selectAll();
      } else if (key === 'c') {
        e.preventDefault();
        copySelection();
      } else if (key === 'x') {
        e.preventDefault();
        cutSelection();
      } else if (key === 'v') {
        e.preventDefault();
        pasteIntoCurrent();
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (key === 'n' && e.shiftKey) {
        e.preventDefault();
        openPrompt('newFolder');
      } else if (key === 't' && !e.shiftKey) {
        e.preventDefault();
        newTab();
      } else if (key === 't' && e.shiftKey) {
        e.preventDefault();
        reopenClosedTab();
      } else if (key === 'w') {
        e.preventDefault();
        closeTab(activeTabId);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        nextTab(e.shiftKey);
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const num = parseInt(e.key, 10);
        const target = num === 9 ? tabs[tabs.length - 1] : tabs[num - 1];
        if (target) {
          switchTab(target.id);
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    currentPath,
    terminalVisible,
    toggleTerminalPanel,
    createTerminalSession,
    setTerminalSearchOpen,
    toggleSearchDrawer,
    quickLookOpen,
    toggleQuickLook,
    closeQuickLook,
    layoutMode,
    selectedPaths,
    copyToOppositePane,
    moveToOppositePane,
    toggleSidebar,
    newTab,
    reopenClosedTab,
    closeTab,
    nextTab,
    switchTab,
    activeTabId,
    tabs,
    goBack,
    goForward,
    goUp,
    refresh,
    selectAll,
    clearSelection,
    copySelection,
    cutSelection,
    pasteIntoCurrent,
    trashSelection,
    requestPermanentDelete,
    requestRenameSelection,
    openPrompt,
    undo,
    redo,
  ]);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleSplitDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = workspaceRef.current;
    if (!container) return;

    const onMove = (moveEvt: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      if (layoutMode === 'split-h') {
        const ratio = (moveEvt.clientX - rect.left) / rect.width;
        setSplitRatio(ratio);
      } else if (layoutMode === 'split-v') {
        const ratio = (moveEvt.clientY - rect.top) / rect.height;
        setSplitRatio(ratio);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handlePrimaryDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-pulsares-paths');
    if (!raw || !currentPath) return;
    try {
      const paths = JSON.parse(raw) as string[];
      if (!Array.isArray(paths) || paths.length === 0) return;

      const normDest = currentPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      // Filtrar arquivos que já estejam nesta pasta para evitar operações redundantes e congelamentos
      const validPaths = paths.filter((p) => {
        const normParent = p.replace(/\\/g, '/').replace(/\/[^/]+$/, '').toLowerCase();
        return normParent !== normDest;
      });

      if (validPaths.length === 0) return;

      const kind = e.ctrlKey ? 'copy' : 'move';
      useOperationsStore.getState().setPanelOpen(true);
      await enqueueOperation(
        kind,
        validPaths,
        currentPath,
        'ask',
        useOperationsStore.getState().verifyHash
      );
      refresh();
    } catch {
      // Ignorar payload inválido
    }
  };

  const handlePrimaryMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (!e.shiftKey && !e.ctrlKey && !e.metaKey)) return;
    if (viewMode !== 'details') return;

    const { entries: currentEntries, selectItem } = useBrowserStore.getState();
    const byPath = new Map<string, Entry>();
    const byName = new Map<string, Entry>();
    for (const item of currentEntries) {
      byPath.set(item.location.path, item);
      byName.set(item.name, item);
    }

    let matched: Entry | null = null;
    let node = e.target as HTMLElement | null;
    const stopNode = e.currentTarget;

    while (node && node !== stopNode) {
      const attrPath = node.getAttribute('data-entry-path');
      if (attrPath && byPath.has(attrPath)) {
        matched = byPath.get(attrPath)!;
        break;
      }

      if (node.children.length <= 6) {
        const directText = node.textContent?.trim();
        if (directText && byName.has(directText)) {
          matched = byName.get(directText)!;
          break;
        }
        for (let i = 0; i < node.children.length; i++) {
          const childText = node.children[i]?.textContent?.trim();
          if (childText && byName.has(childText)) {
            matched = byName.get(childText)!;
            break;
          }
        }
        if (matched) break;
      }
      node = node.parentElement;
    }

    if (matched && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      selectItem(matched.location.path, e.ctrlKey || e.metaKey, true);
    }
  };

  const handlePrimaryClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode === 'details' && e.shiftKey) {
      e.stopPropagation();
    }
  };

  const handlePrimaryContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setFocusedPane('primary');

    const { entries: currentEntries, selectedPaths: currentSel, selectItem } =
      useBrowserStore.getState();
    const byPath = new Map<string, Entry>();
    const byName = new Map<string, Entry>();
    for (const item of currentEntries) {
      byPath.set(item.location.path, item);
      byName.set(item.name, item);
    }

    let matched: Entry | null = null;
    let node = e.target as HTMLElement | null;
    const stopNode = e.currentTarget;

    while (node && node !== stopNode) {
      const attrPath = node.getAttribute('data-entry-path');
      if (attrPath && byPath.has(attrPath)) {
        matched = byPath.get(attrPath)!;
        break;
      }

      if (node.children.length <= 6) {
        const directText = node.textContent?.trim();
        if (directText && byName.has(directText)) {
          matched = byName.get(directText)!;
          break;
        }
        for (let i = 0; i < node.children.length; i++) {
          const childText = node.children[i]?.textContent?.trim();
          if (childText && byName.has(childText)) {
            matched = byName.get(childText)!;
            break;
          }
        }
        if (matched) break;
      }
      node = node.parentElement;
    }

    if (matched && !currentSel.has(matched.location.path)) {
      selectItem(matched.location.path, false);
    }

    setContextMenuTarget({
      x: e.clientX,
      y: e.clientY,
      entry: matched,
    });
  };

  if (isDBStudioMode) {
    return (
      <div style={styles.appRoot}>
        <DBStudioModal standalone />
      </div>
    );
  }

  if (isStudioMode) {
    return (
      <div style={styles.appRoot}>
        <CodeEditorModal standalone />
      </div>
    );
  }

  return (
    <div style={styles.appRoot}>
      <TabBar />
      <AddressBar currentTheme={theme} onThemeChange={handleThemeChange} />
      <OperationsToolbar />
      <div style={styles.mainContent}>
        <Sidebar />
        <div style={styles.rightColumn}>
          <div style={styles.upperRow}>
            <div
              ref={workspaceRef}
              style={{
                ...styles.panesContainer,
                flexDirection: layoutMode === 'split-v' ? 'column' : 'row',
              }}
            >
              <div
                onClick={() => setFocusedPane('primary')}
                onMouseDownCapture={handlePrimaryMouseDownCapture}
                onClickCapture={handlePrimaryClickCapture}
                onContextMenu={handlePrimaryContextMenu}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
                }}
                onDrop={handlePrimaryDrop}
                style={{
                  ...styles.primaryPaneWrapper,
                  position: 'relative',
                  flex: layoutMode === 'single' ? 1 : `0 0 ${Math.round(splitRatio * 100)}%`,
                }}
              >
                {viewMode === 'details' ? <DetailsView /> : <AlternativeViews />}

                {/* HUD flutuante de busca rápida nativa ao digitar na pasta */}
                {filterQuery && (
                  <div
                    style={{
                      position: 'absolute',
                      right: '16px',
                      bottom: '14px',
                      zIndex: 80,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      borderRadius: '999px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--accent-primary)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      Filtro: &ldquo;{filterQuery}&rdquo;
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      ({entries.length} de {rawEntries.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const q = filterQuery;
                        useSearchStore.getState().setQuery(q);
                        useSearchStore.getState().setDrawerOpen(true);
                        void useSearchStore.getState().runSearch(currentPath || '/', useBrowserStore.getState().showHidden);
                      }}
                      title="Expandir para Busca Avançada Recursiva (Ctrl+Shift+S)"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        backgroundColor: 'var(--accent-primary)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Busca Avançada
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterQuery('')}
                      title="Limpar filtro (Esc)"
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        padding: '0 4px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {layoutMode !== 'single' && (
                <>
                  <div
                    role="separator"
                    style={
                      layoutMode === 'split-h' ? styles.verticalSplitter : styles.horizontalSplitter
                    }
                    onMouseDown={handleSplitDragStart}
                    onDoubleClick={() => setSplitRatio(0.5)}
                  />
                  <SecondaryPane />
                </>
              )}
            </div>
            <PreviewPanel />
          </div>
          <TerminalPanel />
        </div>
      </div>
      <SearchDrawer />
      <ProductivityModals />
      {!useEditorStore.getState().preferSeparateWindow && <CodeEditorModal />}
      {!useDBStudioStore.getState().preferSeparateWindow && <DBStudioModal />}
      <DBCreatorModal />
      <FileContextMenu
        target={contextMenuTarget}
        onClose={() => setContextMenuTarget(null)}
      />
      <OperationsPanel />
      <StatusBar />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  appRoot: {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
  },
  rightColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  upperRow: {
    flex: 1,
    display: 'flex',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  panesContainer: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  primaryPaneWrapper: {
    display: 'flex',
    overflow: 'hidden',
    minWidth: 180,
    minHeight: 120,
  },
  verticalSplitter: {
    width: 5,
    height: '100%',
    cursor: 'col-resize',
    backgroundColor: 'var(--border-subtle)',
    flexShrink: 0,
  },
  horizontalSplitter: {
    height: 5,
    width: '100%',
    cursor: 'row-resize',
    backgroundColor: 'var(--border-subtle)',
    flexShrink: 0,
  },
};
