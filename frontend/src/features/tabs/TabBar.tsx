import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Pin, Copy, RotateCcw, Folder, Minus, Square } from 'lucide-react';
import { useBrowserStore, getTabLabel } from '../browser/store';
import { windowMinimize, windowToggleMaximize, windowClose } from '../../lib/wails';

export const TabBar: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    tabs,
    activeTabId,
    closedTabs,
    currentPath,
    switchTab,
    newTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    duplicateTab,
    togglePinTab,
    reopenClosedTab,
    moveTab,
  } = useBrowserStore();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [closeHovered, setCloseHovered] = useState(false);
  const [minHovered, setMinHovered] = useState(false);
  const [maxHovered, setMaxHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);

  const handleAuxClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setContextMenu(null);

  return (
    <div
      style={{
        ...styles.tabBar,
        '--wails-draggable': 'drag',
      } as React.CSSProperties}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) {
          void windowToggleMaximize();
        }
      }}
      onClick={closeMenu}
    >
      {/* Emblema / Identidade da Titlebar Própria do Pulsares Explorer */}
      <div style={styles.brandBadge} title="Pulsares Explorer">
        <div style={styles.brandIconWrap}>
          <Folder size={12} color="#ffffff" />
        </div>
        <span style={styles.brandTitle}>Pulsares</span>
      </div>

      <div style={styles.brandDivider} />

      <div
        style={{
          ...styles.tabList,
          '--wails-draggable': 'no-drag',
        } as React.CSSProperties}
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const displayPath = isActive ? currentPath || tab.path : tab.path;
          const label = getTabLabel(displayPath);

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) {
                  moveTab(dragIndex, index);
                }
                setDragIndex(null);
              }}
              onClick={() => switchTab(tab.id)}
              onAuxClick={(e) => handleAuxClick(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              title={displayPath}
              style={{
                ...styles.tab,
                ...(isActive ? styles.activeTab : styles.inactiveTab),
                ...(tab.pinned ? styles.pinnedTab : {}),
              }}
            >
              {tab.pinned ? (
                <Pin size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              ) : (
                <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              )}
              <span style={styles.tabLabel}>{label}</span>
              {tabs.length > 1 && !tab.pinned && (
                <button
                  type="button"
                  style={styles.closeBtn}
                  title={t('tabs.closeTab')}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          style={styles.iconBtn}
          onClick={() => newTab()}
          title={t('tabs.newTab')}
          aria-label={t('tabs.newTab')}
        >
          <Plus size={15} />
        </button>

        {closedTabs.length > 0 && (
          <button
            type="button"
            style={styles.iconBtn}
            onClick={reopenClosedTab}
            title={t('tabs.reopenClosed')}
            aria-label={t('tabs.reopenClosed')}
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {/* Região de arrasto da janela (duplo clique maximiza/restaura) */}
      <div
        style={styles.dragSpacer}
        onDoubleClick={() => void windowToggleMaximize()}
      />

      {/* Controles nativos da Titlebar própria (Minimizar, Maximizar, Fechar) */}
      <div
        style={{
          ...styles.windowControls,
          '--wails-draggable': 'no-drag',
        } as React.CSSProperties}
      >
        <button
          type="button"
          title="Minimizar"
          aria-label="Minimizar"
          onClick={() => void windowMinimize()}
          onMouseEnter={() => setMinHovered(true)}
          onMouseLeave={() => setMinHovered(false)}
          style={{
            ...styles.winCtrlBtn,
            backgroundColor: minHovered ? 'var(--bg-hover)' : 'transparent',
          }}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          title="Maximizar / Restaurar"
          aria-label="Maximizar"
          onClick={() => void windowToggleMaximize()}
          onMouseEnter={() => setMaxHovered(true)}
          onMouseLeave={() => setMaxHovered(false)}
          style={{
            ...styles.winCtrlBtn,
            backgroundColor: maxHovered ? 'var(--bg-hover)' : 'transparent',
          }}
        >
          <Square size={12} />
        </button>
        <button
          type="button"
          title="Fechar"
          aria-label="Fechar"
          onClick={() => void windowClose()}
          onMouseEnter={() => setCloseHovered(true)}
          onMouseLeave={() => setCloseHovered(false)}
          style={{
            ...styles.winCtrlBtn,
            backgroundColor: closeHovered ? '#dc2626' : 'transparent',
            color: closeHovered ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          <X size={15} />
        </button>
      </div>

      {contextMenu && (
        <div
          style={{
            ...styles.contextMenu,
            left: contextMenu.x,
            top: contextMenu.y,
            '--wails-draggable': 'no-drag',
          } as React.CSSProperties}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            style={styles.menuItem}
            onClick={() => {
              duplicateTab(contextMenu.tabId);
              closeMenu();
            }}
          >
            <Copy size={13} />
            <span>{t('tabs.duplicateTab')}</span>
          </button>
          <button
            type="button"
            style={styles.menuItem}
            onClick={() => {
              togglePinTab(contextMenu.tabId);
              closeMenu();
            }}
          >
            <Pin size={13} />
            <span>
              {tabs.find((item) => item.id === contextMenu.tabId)?.pinned
                ? t('tabs.unpinTab')
                : t('tabs.pinTab')}
            </span>
          </button>
          <button
            type="button"
            style={styles.menuItem}
            onClick={() => {
              closeOtherTabs(contextMenu.tabId);
              closeMenu();
            }}
          >
            <span>{t('tabs.closeOthers')}</span>
          </button>
          <button
            type="button"
            style={styles.menuItem}
            onClick={() => {
              closeTabsToRight(contextMenu.tabId);
              closeMenu();
            }}
          >
            <span>{t('tabs.closeRight')}</span>
          </button>
          {tabs.length > 1 && (
            <button
              type="button"
              style={styles.menuItem}
              onClick={() => {
                closeTab(contextMenu.tabId);
                closeMenu();
              }}
            >
              <X size={13} />
              <span>{t('tabs.closeTab')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    height: 38,
    paddingLeft: 10,
    paddingRight: 0,
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none',
    overflow: 'hidden',
  },
  brandBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
    paddingRight: 4,
  },
  brandIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.35)',
  },
  brandTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: 'var(--text-primary)',
  },
  brandDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'var(--border-subtle)',
    margin: '0 8px',
    flexShrink: 0,
  },
  tabList: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: '100%',
    overflowX: 'auto',
    minWidth: 0,
  },
  dragSpacer: {
    flex: 1,
    height: '100%',
    minWidth: 24,
  },
  windowControls: {
    display: 'flex',
    alignItems: 'stretch',
    height: '100%',
    flexShrink: 0,
    marginLeft: 4,
  },
  winCtrlBtn: {
    width: 42,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'background-color 0.12s, color 0.12s',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 28,
    minWidth: 110,
    maxWidth: 200,
    padding: '0 8px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'background 0.12s, border-color 0.12s',
  },
  pinnedTab: {
    minWidth: 68,
    maxWidth: 110,
  },
  activeTab: {
    backgroundColor: 'var(--bg-surface)',
    borderColor: 'var(--border-subtle)',
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  inactiveTab: {
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
  },
  tabLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: 4,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 5,
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  contextMenu: {
    position: 'fixed',
    zIndex: 1000,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    padding: 4,
    minWidth: 170,
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-primary)',
    textAlign: 'left',
    width: '100%',
  },
};

