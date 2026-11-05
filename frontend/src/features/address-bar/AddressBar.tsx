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
  PanelLeft,
  Folder,
} from 'lucide-react';
import { useBrowserStore } from '../browser/store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { saveSetting, expandPath, autocompletePath } from '../../lib/wails';

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
  const { visible: sidebarVisible, toggleSidebar } = useFolderTreeStore();

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentPath);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(currentPath);
  }, [currentPath]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    } else {
      setSuggestions([]);
      setSelectedSuggestionIdx(-1);
    }
  }, [isEditing]);

  // Ouvir evento global de foco na barra de endereço (Ctrl+L / Alt+D)
  useEffect(() => {
    const onFocusAddress = () => {
      setIsEditing(true);
    };
    window.addEventListener('pulsares:focus-address-bar', onFocusAddress);
    return () => window.removeEventListener('pulsares:focus-address-bar', onFocusAddress);
  }, []);

  const handleInputChange = async (value: string) => {
    setInputValue(value);
    setSelectedSuggestionIdx(-1);
    if (value.trim().length > 0) {
      const items = await autocompletePath(value, showHidden);
      setSuggestions(items);
    } else {
      setSuggestions([]);
    }
  };

  const commitNavigation = async (rawPath: string) => {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      setIsEditing(false);
      return;
    }
    const resolved = await expandPath(trimmed);
    setSuggestions([]);
    setIsEditing(false);
    navigateTo(resolved || trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      const chosen = suggestions[selectedSuggestionIdx >= 0 ? selectedSuggestionIdx : 0];
      if (chosen) {
        setInputValue(chosen);
        handleInputChange(chosen);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target =
        selectedSuggestionIdx >= 0 && suggestions[selectedSuggestionIdx]
          ? suggestions[selectedSuggestionIdx]
          : inputValue;
      commitNavigation(target);
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
          style={sidebarVisible ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={toggleSidebar}
          title={t('nav.toggleSidebar')}
          aria-label={t('nav.toggleSidebar')}
        >
          <PanelLeft size={16} />
        </button>
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

      {/* Barra de Endereço / Breadcrumbs + Autocompletar */}
      <div style={styles.addressWrapper}>
        <div style={styles.addressBox}>
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              style={styles.addressInput}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                // Pequeno atraso para permitir clique em sugestão
                setTimeout(() => setIsEditing(false), 150);
              }}
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

        {isEditing && suggestions.length > 0 && (
          <div style={styles.suggestionsPopup} role="listbox">
            {suggestions.map((item, idx) => (
              <div
                key={item}
                role="option"
                aria-selected={idx === selectedSuggestionIdx}
                style={{
                  ...styles.suggestionItem,
                  ...(idx === selectedSuggestionIdx ? styles.suggestionItemActive : {}),
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitNavigation(item);
                }}
              >
                <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={styles.suggestionText}>{item}</span>
              </div>
            ))}
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
  addressWrapper: {
    position: 'relative',
    flex: 1,
    height: 30,
  },
  addressBox: {
    width: '100%',
    height: '100%',
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
  suggestionsPopup: {
    position: 'absolute',
    top: 34,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    padding: 4,
    maxHeight: 260,
    overflowY: 'auto',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
  },
  suggestionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 8px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  suggestionItemActive: {
    backgroundColor: 'var(--bg-selected, rgba(59, 130, 246, 0.2))',
  },
  suggestionText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
