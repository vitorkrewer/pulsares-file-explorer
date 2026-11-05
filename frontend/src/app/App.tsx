import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddressBar } from '../features/address-bar/AddressBar';
import { DetailsView } from '../features/browser/DetailsView';
import { StatusBar } from '../features/browser/StatusBar';
import { useBrowserStore } from '../features/browser/store';
import { getInitialState } from '../lib/wails';
import { resolveLanguage } from '../i18n/config';

export const App: React.FC = () => {
  const { i18n } = useTranslation();
  const { navigateTo, initListener } = useBrowserStore();
  const [theme, setTheme] = useState<string>('dark');

  useEffect(() => {
    // Inicializar listener de eventos Wails
    const cleanup = initListener();

    // Carregar estado inicial da plataforma
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

      // 3. Navegar para o diretório inicial
      const initialPath = state.homeDir || (state.drives.length > 0 ? state.drives[0].path : '/');
      navigateTo(initialPath);
    });

    return () => cleanup();
  }, [navigateTo, initListener, i18n]);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div style={styles.appRoot}>
      <AddressBar currentTheme={theme} onThemeChange={handleThemeChange} />
      <div style={styles.mainContent}>
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

