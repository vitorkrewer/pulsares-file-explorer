import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabBar } from '../features/tabs/TabBar';
import { AddressBar } from '../features/address-bar/AddressBar';
import { Sidebar } from '../features/sidebar/Sidebar';
import { DetailsView } from '../features/browser/DetailsView';
import { StatusBar } from '../features/browser/StatusBar';
import { useBrowserStore } from '../features/browser/store';
import { useFolderTreeStore } from '../features/sidebar/folder-tree/store';
import { getInitialState } from '../lib/wails';
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
    goBack,
    goForward,
    goUp,
    refresh,
  } = useBrowserStore();
  const { hydrateSidebar, toggleSidebar } = useFolderTreeStore();
  const [theme, setTheme] = useState<string>('dark');

  useEffect(() => {
    const cleanup = initListener();

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

      // 3. Reidratar sessão (abas + painel lateral) ou abrir diretório inicial
      const initialPath = state.homeDir || (state.drives.length > 0 ? state.drives[0].path : '/');
      const savedSidebar = hydrateSession(state.sessionData, initialPath);
      hydrateSidebar(savedSidebar, false, lang);
    });

    return () => cleanup();
  }, [hydrateSession, hydrateSidebar, initListener, i18n]);

  // Atalhos globais de teclado e botões laterais do mouse (0.1.0 + 0.2.0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      const isInputFocused =
        targetEl?.tagName === 'INPUT' ||
        targetEl?.tagName === 'TEXTAREA' ||
        targetEl?.isContentEditable;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Focar barra de endereço: Ctrl+L ou Alt+D
      if ((mod && key === 'l') || (e.altKey && key === 'd')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pulsares:focus-address-bar'));
        return;
      }

      // Navegação Alt+Setas e F5
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

      if (!isInputFocused && e.key === 'F5') {
        e.preventDefault();
        refresh();
        return;
      }

      if (!mod) return;

      if (key === 'b') {
        e.preventDefault();
        toggleSidebar();
      } else if (key === 'r') {
        e.preventDefault();
        refresh();
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
  ]);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div style={styles.appRoot}>
      <TabBar />
      <AddressBar currentTheme={theme} onThemeChange={handleThemeChange} />
      <div style={styles.mainContent}>
        <Sidebar />
        <DetailsView />
      </div>
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
};
