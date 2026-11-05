import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Pin, Copy, RotateCcw, Folder } from 'lucide-react';
import { useBrowserStore, getTabLabel } from '../browser/store';

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
      style={styles.tabBar}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) {
          newTab();
        }
      }}
      onClick={closeMenu}
    >
      <div style={styles.tabList} role="tablist">
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

      {contextMenu && (
        <div
          style={{
            ...styles.contextMenu,
            left: contextMenu.x,
            top: contextMenu.y,
          }}
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
    height: 36,
    padding: '0 8px',
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none',
    overflowX: 'auto',
  },
  tabList: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: '100%',
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

