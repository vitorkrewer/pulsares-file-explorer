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
  Copy,
  Check,
  Server,
  ClipboardList,
} from 'lucide-react';
import { useBrowserStore } from '../browser/store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { useProductivityStore } from '../productivity/store';
import { useClipboardHistoryStore } from '../clipboard/store';
import { saveSetting, expandPath, autocompletePath, writeNativeClipboardText } from '../../lib/wails';
import { SoftSelect } from '../../ui/SoftSelect';

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
  const { remoteProfiles } = useProductivityStore();
  const {
    drawerOpen: clipboardOpen,
    items: clipboardItems,
    toggleDrawer: toggleClipboardDrawer,
  } = useClipboardHistoryStore();

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentPath);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(-1);
  const [copiedPath, setCopiedPath] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(currentPath);
    setOverflowMenuOpen(false);
  }, [currentPath]);

  useEffect(() => {
    if (!overflowMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setOverflowMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOverflowMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [overflowMenuOpen]);

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

  // Breadcrumbs (Local + SFTP)
  const normalized = currentPath.replace(/\\/g, '/');
  const sftpMatch = normalized.match(/^sftp:\/\/(\d+)(\/.*)?$/i);
  const isSFTP = Boolean(sftpMatch);
  const sftpProfileId = sftpMatch ? Number(sftpMatch[1]) : 0;
  const sftpProfile = isSFTP ? remoteProfiles.find((p) => p.id === sftpProfileId) : undefined;
  const sftpRemoteSub = sftpMatch ? (sftpMatch[2] || '/') : '';
  const smbMatch = !isSFTP ? normalized.match(/^(smb|cifs|nfs|afp):\/\/([^/]+)(\/.*)?$/i) : null;
  const isSMBUrl = Boolean(smbMatch);
  const isUNC = !isSFTP && !isSMBUrl && (currentPath.startsWith('\\\\') || currentPath.startsWith('//'));
  const isWindows = !isSFTP && !isSMBUrl && !isUNC && /^[a-zA-Z]:/.test(normalized);
  const parts = isSFTP
    ? sftpRemoteSub.split('/').filter(Boolean)
    : isSMBUrl
      ? [smbMatch![2], ...(smbMatch![3] || '').split('/').filter(Boolean)]
      : normalized.split('/').filter(Boolean);

  const buildCrumbTarget = (index: number) =>
    isSFTP
      ? `sftp://${sftpProfileId}/` + parts.slice(0, index + 1).join('/')
      : isWindows
        ? index === 0
          ? `${parts[0]}\\`
          : parts.slice(0, index + 1).join('\\')
        : isUNC
          ? '\\\\' + parts.slice(0, index + 1).join('\\')
          : isSMBUrl
            ? `${smbMatch![1].toLowerCase()}://` + parts.slice(0, index + 1).join('/')
            : '/' + parts.slice(0, index + 1).join('/');

  const shouldCollapseMiddle = parts.length > 4;
  const hiddenCrumbIndices = shouldCollapseMiddle
    ? Array.from({ length: parts.length - 4 }, (_, i) => i + 1)
    : [];
  const visibleCrumbIndices = shouldCollapseMiddle
    ? [0, parts.length - 3, parts.length - 2, parts.length - 1]
    : parts.map((_, i) => i);

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentPath) return;
    void writeNativeClipboardText(currentPath).catch(() => {
      void navigator.clipboard?.writeText(currentPath);
    });
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1600);
  };

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
              {isSFTP && (
                <>
                  <span
                    style={{
                      ...styles.crumb,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      color: 'var(--accent)',
                      fontWeight: 600,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTo(`sftp://${sftpProfileId}/`);
                    }}
                  >
                    <Server size={12} />
                    <span>
                      {sftpProfile
                        ? `${sftpProfile.name} (${sftpProfile.host})`
                        : `SFTP #${sftpProfileId}`}
                    </span>
                  </span>
                  <span style={styles.separator}>›</span>
                  {parts.length === 0 && (
                    <span style={{ ...styles.crumb, color: 'var(--text-secondary)' }}>/</span>
                  )}
                </>
              )}
              {(isUNC || isSMBUrl) && (
                <Globe size={12} style={{ color: 'var(--accent)', marginRight: 2, flexShrink: 0 }} />
              )}
              {visibleCrumbIndices.map((partIdx, renderPos) => {
                const part = parts[partIdx];
                const fullTillNow = buildCrumbTarget(partIdx);
                const isLast = partIdx === parts.length - 1;
                const isFirstCollapsed = shouldCollapseMiddle && renderPos === 0;

                return (
                  <React.Fragment key={fullTillNow}>
                    <span
                      style={{
                        ...styles.crumb,
                        ...(isLast ? styles.crumbCurrent : styles.crumbIntermediate),
                      }}
                      title={part}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateTo(fullTillNow);
                      }}
                    >
                      {part}
                    </span>
                    {isFirstCollapsed && (
                      <>
                        <span style={styles.separator}>›</span>
                        <button
                          type="button"
                          style={{
                            ...styles.collapseBtn,
                            ...(overflowMenuOpen ? styles.collapseBtnActive : {}),
                          }}
                          title={currentPath}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOverflowMenuOpen((prev) => !prev);
                          }}
                        >
                          …
                        </button>
                      </>
                    )}
                    {renderPos < visibleCrumbIndices.length - 1 && (
                      <span style={styles.separator}>›</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Ícone discreto no final da barra de endereço para copiar o caminho atual */}
          <button
            type="button"
            style={{
              ...styles.copyPathBtn,
              color: copiedPath ? '#10b981' : 'var(--text-muted)',
            }}
            onClick={handleCopyPath}
            onMouseDown={(e) => e.preventDefault()}
            title={copiedPath ? t('nav.pathCopied') : t('nav.copyPath')}
            aria-label={t('nav.copyPath')}
          >
            {copiedPath ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>

        {!isEditing && overflowMenuOpen && hiddenCrumbIndices.length > 0 && (
          <div
            ref={overflowMenuRef}
            className="pulsares-dropdown-menu"
            style={styles.overflowPopup}
            role="menu"
          >
            {hiddenCrumbIndices.map((idx) => {
              const target = buildCrumbTarget(idx);
              return (
                <button
                  key={target}
                  type="button"
                  className="pulsares-dropdown-item"
                  style={styles.overflowItem}
                  title={target}
                  onClick={() => {
                    setOverflowMenuOpen(false);
                    navigateTo(target);
                  }}
                >
                  <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={styles.suggestionText}>{parts[idx]}</span>
                </button>
              );
            })}
          </div>
        )}

        {isEditing && suggestions.length > 0 && (
          <div className="pulsares-dropdown-menu" style={styles.suggestionsPopup} role="listbox">
            {suggestions.map((item, idx) => (
              <div
                key={item}
                role="option"
                aria-selected={idx === selectedSuggestionIdx}
                className="pulsares-dropdown-item"
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
        <SoftSelect
          size="sm"
          align="right"
          minMenuWidth={160}
          icon={<Globe size={13} />}
          value={i18n.language}
          onChange={handleLanguageChange}
          ariaLabel={t('settings.language')}
          title={t('settings.language')}
          options={[
            { value: 'pt-BR', label: 'Português (BR)' },
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
            { value: 'de', label: 'Deutsch' },
            { value: 'fr', label: 'Français' },
            { value: 'it', label: 'Italiano' },
            { value: 'ja', label: '日本語' },
            { value: 'zh-CN', label: '简体中文' },
            { value: 'sv', label: 'Svenska' },
            { value: 'tr', label: 'Türkçe' },
          ]}
        />

        {/* Histórico da Área de Transferência (Win + V / Ctrl + Shift + V) */}
        <button
          style={{
            ...styles.btn,
            position: 'relative',
            ...(clipboardOpen
              ? {
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                }
              : {}),
          }}
          onClick={toggleClipboardDrawer}
          title={t('clipboardHistory.toggleTooltip')}
          aria-label={t('clipboardHistory.title')}
          data-testid="clipboard-history-toggle"
        >
          <ClipboardList size={16} />
          {clipboardItems.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                minWidth: 13,
                height: 13,
                padding: '0 3px',
                borderRadius: 999,
                backgroundColor: 'var(--accent)',
                color: '#ffffff',
                fontSize: 9,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {clipboardItems.length > 20 ? '20+' : clipboardItems.length}
            </span>
          )}
        </button>

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
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  navButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
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
    minWidth: 0,
    height: 30,
  },
  addressBox: {
    width: '100%',
    minWidth: 0,
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
    flex: 1,
    minWidth: 0,
    fontSize: 12,
  },
  crumb: {
    padding: '2px 4px',
    borderRadius: 3,
    color: 'var(--text-primary)',
    cursor: 'default',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  crumbIntermediate: {
    maxWidth: 160,
    flexShrink: 1,
    minWidth: 32,
  },
  crumbCurrent: {
    maxWidth: 260,
    fontWeight: 500,
    flexShrink: 1,
    minWidth: 56,
  },
  collapseBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-surface-hover)',
    flexShrink: 0,
    cursor: 'default',
  },
  collapseBtnActive: {
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-subtle)',
  },
  overflowPopup: {
    position: 'absolute',
    top: 34,
    left: 28,
    zIndex: 1050,
    minWidth: 200,
    maxWidth: 340,
    maxHeight: 240,
    overflowY: 'auto',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    padding: 4,
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  overflowItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 8px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-primary)',
    textAlign: 'left',
    width: '100%',
    cursor: 'default',
  },
  separator: {
    color: 'var(--text-muted)',
    fontSize: 14,
    flexShrink: 0,
  },
  addressInput: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    height: '100%',
    fontSize: 12,
    color: 'var(--text-primary)',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
  },
  copyPathBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 4,
    flexShrink: 0,
    marginLeft: 4,
    cursor: 'default',
    opacity: 0.78,
    transition: 'opacity 0.15s, color 0.15s, background-color 0.15s',
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
    cursor: 'default',
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
    flexShrink: 0,
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
    cursor: 'default',
    outline: 'none',
  },
};
