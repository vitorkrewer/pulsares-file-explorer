import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCw,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Globe,
} from 'lucide-react';
import { useBrowserStore } from '../browser/store';
import { saveSetting } from '../../lib/wails';

interface AddressBarProps {
  currentTheme: string;
  onThemeChange: (theme: string) => void;
}

export const AddressBar: React.FC<AddressBarProps> = ({ currentTheme, onThemeChange }) => {
  const { t, i18n } = useTranslation('common');
  const {
    currentPath,
    historyIndex,
    history,
    isLoading,
    showHidden,
    goBack,
    goForward,
    goUp,
    refresh,
    toggleHidden,
    navigateTo,
  } = useBrowserStore();

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(currentPath);
  }, [currentPath]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (inputValue.trim()) {
        navigateTo(inputValue.trim());
      }
      setIsEditing(false);
    } else if (e.key === 'Escape') {
      setInputValue(currentPath);
      setIsEditing(false);
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    saveSetting('language', lang);
  };

  const toggleTheme = () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    onThemeChange(next);
    saveSetting('theme', next);
  };

  // Breadcrumbs
  const normalized = currentPath.replace(/\\/g, '/');
  const isWindows = /^[a-zA-Z]:/.test(normalized);
  const parts = normalized.split('/').filter(Boolean);

  return (
    <div style={styles.container}>
      {/* Botões de Navegação */}
      <div style={styles.navButtons}>
        <button
          style={historyIndex <= 0 ? styles.disabledBtn : styles.btn}
          disabled={historyIndex <= 0}
          onClick={goBack}
          title={t('nav.back')}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          style={historyIndex >= history.length - 1 ? styles.disabledBtn : styles.btn}
          disabled={historyIndex >= history.length - 1}
          onClick={goForward}
          title={t('nav.forward')}
        >
          <ArrowRight size={16} />
        </button>
        <button style={styles.btn} onClick={goUp} title={t('nav.up')}>
          <ArrowUp size={16} />
        </button>
        <button
          style={isLoading ? { ...styles.btn, opacity: 0.5 } : styles.btn}
          onClick={refresh}
          title={t('nav.refresh')}
        >
          <RotateCw size={15} />
        </button>
      </div>

      {/* Barra de Endereço / Breadcrumbs */}
      <div style={styles.addressBox}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            style={styles.addressInput}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setIsEditing(false)}
            placeholder={t('nav.addressPlaceholder')}
          />
        ) : (
          <div style={styles.breadcrumbs} onClick={() => setIsEditing(true)}>
            {parts.map((part, index) => {
              const fullTillNow = isWindows
                ? index === 0
                  ? `${part}\\`
                  : parts.slice(0, index + 1).join('\\')
                : '/' + parts.slice(0, index + 1).join('/');

              return (
                <React.Fragment key={fullTillNow}>
                  <span
                    style={styles.crumb}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTo(fullTillNow);
                    }}
                  >
                    {part}
                  </span>
                  {index < parts.length - 1 && <span style={styles.separator}>›</span>}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Ações Rápidas (Ocultos, Idioma, Tema) */}
      <div style={styles.actions}>
        <button
          style={showHidden ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={toggleHidden}
          title={t('nav.toggleHidden')}
        >
          {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>

        {/* Seletor de Idioma */}
        <div style={styles.langSelector}>
          <Globe size={15} style={{ marginRight: 4, color: 'var(--text-secondary)' }} />
          <select
            style={styles.select}
            value={i18n.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            aria-label={t('settings.language')}
          >
            <option value="pt-BR">Português (BR)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>

        {/* Alternador de Tema */}
        <button style={styles.btn} onClick={toggleTheme} title={t('settings.theme')}>
          {currentTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    backgroundColor: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-subtle)',
    height: 44,
  },
  navButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 4,
    color: 'var(--text-secondary)',
    transition: 'background 0.15s, color 0.15s',
  },
  disabledBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 4,
    color: 'var(--text-muted)',
    cursor: 'not-allowed',
    opacity: 0.4,
  },
  addressBox: {
    flex: 1,
    height: 30,
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    overflow: 'hidden',
    cursor: 'text',
  },
  breadcrumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    width: '100%',
    fontSize: 12,
  },
  crumb: {
    padding: '2px 4px',
    borderRadius: 3,
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  separator: {
    color: 'var(--text-muted)',
    fontSize: 14,
  },
  addressInput: {
    width: '100%',
    height: '100%',
    fontSize: 12,
    color: 'var(--text-primary)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  langSelector: {
    display: 'flex',
    alignItems: 'center',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-app)',
  },
  select: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 11,
    cursor: 'pointer',
    outline: 'none',
  },
};

