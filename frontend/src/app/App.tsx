import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabBar } from '../features/tabs/TabBar';
import { AddressBar } from '../features/address-bar/AddressBar';
import { OperationsToolbar } from '../features/operations/OperationsToolbar';
import { OperationsPanel } from '../features/operations/OperationsPanel';
import { Sidebar } from '../features/sidebar/Sidebar';
import { DetailsView } from '../features/browser/DetailsView';
import { SecondaryPane } from '../features/panes/SecondaryPane';
import { TerminalPanel } from '../features/terminal/TerminalPanel';
import { StatusBar } from '../features/browser/StatusBar';
import { useBrowserStore } from '../features/browser/store';
import { useFolderTreeStore } from '../features/sidebar/folder-tree/store';
import { useOperationsStore } from '../features/operations/store';
import { useDualPaneStore } from '../features/panes/store';
import { useTerminalStore } from '../features/terminal/store';
import { getInitialState, enqueueOperation } from '../lib/wails';
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
  const [theme, setTheme] = useState<string>('dark');
  const workspaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanupBrowser = initListener();
    const cleanupOps = initOpsListeners();
    const cleanupSecondary = initSecondaryListeners();

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

  // Atalhos globais de teclado e botões laterais do mouse (0.1.0 a 0.5.0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      const isInputFocused =
        targetEl?.tagName === 'INPUT' ||
        targetEl?.tagName === 'TEXTAREA' ||
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

      // Focar barra de endereço: Ctrl+L ou Alt+D (exceto quando no input do terminal)
      if (!isInputFocused && ((mod && key === 'l') || (e.altKey && key === 'd'))) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pulsares:focus-address-bar'));
        return;
      }

      if (isInputFocused) return;

      // Teclas diretas sem modificador Ctrl/Cmd
      if (!mod && !e.altKey) {
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
          requestRenameSelection();
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
          clearSelection();
          return;
        }
      }

      // Navegação Alt+Setas
      if (e.altKey && !mod) {
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
      if (Array.isArray(paths) && paths.length > 0) {
        const kind = e.shiftKey ? 'move' : 'copy';
        useOperationsStore.getState().setPanelOpen(true);
        await enqueueOperation(
          kind,
          paths,
          currentPath,
          'ask',
          useOperationsStore.getState().verifyHash
        );
        refresh();
      }
    } catch {
      // Ignorar payload inválido
    }
  };

  return (
    <div style={styles.appRoot}>
      <TabBar />
      <AddressBar currentTheme={theme} onThemeChange={handleThemeChange} />
      <OperationsToolbar />
      <div style={styles.mainContent}>
        <Sidebar />
        <div style={styles.rightColumn}>
          <div
            ref={workspaceRef}
            style={{
              ...styles.panesContainer,
              flexDirection: layoutMode === 'split-v' ? 'column' : 'row',
            }}
          >
            <div
              onClick={() => setFocusedPane('primary')}
              draggable={selectedPaths.size > 0}
              onDragStart={(e) => {
                if (selectedPaths.size > 0) {
                  e.dataTransfer.setData(
                    'application/x-pulsares-paths',
                    JSON.stringify(Array.from(selectedPaths))
                  );
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handlePrimaryDrop}
              style={{
                ...styles.primaryPaneWrapper,
                flex: layoutMode === 'single' ? 1 : `0 0 ${Math.round(splitRatio * 100)}%`,
              }}
            >
              <DetailsView />
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
          <TerminalPanel />
        </div>
      </div>
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
