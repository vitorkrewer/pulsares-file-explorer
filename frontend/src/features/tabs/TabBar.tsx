import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  X,
  Pin,
  Copy,
  RotateCcw,
  Folder,
  Minus,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
} from 'lucide-react';
import { useBrowserStore, getTabLabel, MAX_OPEN_TABS } from '../browser/store';
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
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [closeHovered, setCloseHovered] = useState(false);
  const [minHovered, setMinHovered] = useState(false);
  const [maxHovered, setMaxHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);

  // Estado de overflow horizontal e menu dropdown de todas as abas
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const allTabsMenuRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [allTabsOpen, setAllTabsOpen] = useState(false);
  const [allTabsFilter, setAllTabsFilter] = useState('');

  const updateScrollButtons = useCallback(() => {
    const el = tabListRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(maxScroll - el.scrollLeft > 2);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const onResize = () => updateScrollButtons();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [tabs.length, updateScrollButtons]);

  // Rola automaticamente para manter a aba ativa visível
  useEffect(() => {
    const activeEl = tabItemRefs.current[activeTabId];
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    const timer = setTimeout(updateScrollButtons, 180);
    return () => clearTimeout(timer);
  }, [activeTabId, tabs.length, updateScrollButtons]);

  // Fecha o popover de todas as abas ao clicar fora
  useEffect(() => {
    if (!allTabsOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (allTabsMenuRef.current && !allTabsMenuRef.current.contains(e.target as Node)) {
        setAllTabsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [allTabsOpen]);

  const scrollTabsBy = (delta: number) => {
    const el = tabListRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
    setTimeout(updateScrollButtons, 180);
  };

  const handleWheelScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = tabListRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
      el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
      updateScrollButtons();
    }
  };

  const handleAuxClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setAllTabsOpen(false);
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setContextMenu(null);

  const isCrowded = tabs.length > 6;
  const reachedTabLimit = tabs.length >= MAX_OPEN_TABS;
  const hasOverflow = canScrollLeft || canScrollRight;

  const filteredTabsForMenu = useMemo(() => {
    const q = allTabsFilter.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter((tab) => {
      const p = (tab.id === activeTabId ? currentPath || tab.path : tab.path) || '';
      const lbl = getTabLabel(p).toLowerCase();
      return lbl.includes(q) || p.toLowerCase().includes(q);
    });
  }, [tabs, activeTabId, currentPath, allTabsFilter]);

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

      {/* Botão de rolagem para a esquerda quando há muitas abas */}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => scrollTabsBy(-180)}
          disabled={!canScrollLeft}
          title="Rolar abas para a esquerda"
          style={{
            ...styles.scrollArrowBtn,
            opacity: canScrollLeft ? 1 : 0.3,
            cursor: canScrollLeft ? 'pointer' : 'default',
            '--wails-draggable': 'no-drag',
          } as React.CSSProperties}
        >
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Faixa de abas com compressão elástica e sem barra de scroll visível */}
      <div
        ref={tabListRef}
        className="no-scrollbar"
        onScroll={updateScrollButtons}
        onWheel={handleWheelScroll}
        style={{
          ...styles.tabList,
          '--wails-draggable': 'no-drag',
        } as React.CSSProperties}
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isHovered = hoveredTabId === tab.id;
          const displayPath = isActive ? currentPath || tab.path : tab.path;
          const label = getTabLabel(displayPath);
          const showCloseBtn =
            tabs.length > 1 && !tab.pinned && (!isCrowded || isActive || isHovered);

          return (
            <div
              key={tab.id}
              ref={(el) => {
                tabItemRefs.current[tab.id] = el;
              }}
              role="tab"
              aria-selected={isActive}
              draggable
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId((prev) => (prev === tab.id ? null : prev))}
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
              title={`${label} — ${displayPath}`}
              style={{
                ...styles.tab,
                ...(isActive ? styles.activeTab : styles.inactiveTab),
                ...(tab.pinned ? styles.pinnedTab : {}),
              }}
            >
              {tab.pinned ? (
                <Pin size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              ) : (
                <Folder
                  size={12}
                  style={{
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                />
              )}
              {(!tab.pinned || !isCrowded) && <span style={styles.tabLabel}>{label}</span>}
              {showCloseBtn && (
                <button
                  type="button"
                  style={styles.closeBtn}
                  title={t('tabs.closeTab')}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Botão de rolagem para a direita quando há muitas abas */}
      {hasOverflow && (
        <button
          type="button"
          onClick={() => scrollTabsBy(180)}
          disabled={!canScrollRight}
          title="Rolar abas para a direita"
          style={{
            ...styles.scrollArrowBtn,
            opacity: canScrollRight ? 1 : 0.3,
            cursor: canScrollRight ? 'pointer' : 'default',
            '--wails-draggable': 'no-drag',
          } as React.CSSProperties}
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* Ações Fixas da Barra de Abas (+ Nova Aba, Reabrir e Menu de Todas as Abas) */}
      <div
        ref={allTabsMenuRef}
        style={{
          ...styles.fixedTabActions,
          '--wails-draggable': 'no-drag',
        } as React.CSSProperties}
      >
        <button
          type="button"
          style={{
            ...styles.iconBtn,
            opacity: reachedTabLimit ? 0.38 : 1,
            cursor: reachedTabLimit ? 'not-allowed' : 'pointer',
          }}
          disabled={reachedTabLimit}
          onClick={() => newTab()}
          title={
            reachedTabLimit
              ? `Limite máximo de ${MAX_OPEN_TABS} abas atingido`
              : `${t('tabs.newTab')} (${tabs.length}/${MAX_OPEN_TABS})`
          }
          aria-label={t('tabs.newTab')}
        >
          <Plus size={15} />
        </button>

        {closedTabs.length > 0 && !reachedTabLimit && (
          <button
            type="button"
            style={styles.iconBtn}
            onClick={reopenClosedTab}
            title={t('tabs.reopenClosed')}
            aria-label={t('tabs.reopenClosed')}
          >
            <RotateCcw size={13} />
          </button>
        )}

        {tabs.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setAllTabsOpen((v) => !v);
              setAllTabsFilter('');
            }}
            title={`Listar todas as abas abertas (${tabs.length}/${MAX_OPEN_TABS})`}
            style={{
              ...styles.allTabsTriggerBtn,
              backgroundColor: allTabsOpen ? 'var(--bg-surface)' : 'transparent',
              borderColor: allTabsOpen ? 'var(--border-subtle)' : 'transparent',
            }}
          >
            <span style={styles.tabCountBadge}>{tabs.length}</span>
            <ChevronDown size={12} />
          </button>
        )}

        {/* Popover Dropdown: Todas as Abas Abertas */}
        {allTabsOpen && (
          <div style={styles.allTabsPopover} onClick={(e) => e.stopPropagation()}>
            <div style={styles.allTabsHeader}>
              <span style={{ fontWeight: 700, fontSize: 11 }}>
                Abas Abertas ({tabs.length}/{MAX_OPEN_TABS})
              </span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    closeOtherTabs(activeTabId);
                    setAllTabsOpen(false);
                  }}
                  style={styles.closeOthersLink}
                >
                  Fechar outras
                </button>
              )}
            </div>

            {tabs.length > 4 && (
              <div style={styles.allTabsSearchWrap}>
                <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={allTabsFilter}
                  onChange={(e) => setAllTabsFilter(e.target.value)}
                  placeholder="Filtrar abas abertas..."
                  autoFocus
                  style={styles.allTabsSearchInput}
                />
              </div>
            )}

            <div style={styles.allTabsList}>
              {filteredTabsForMenu.map((tab, idx) => {
                const isAct = tab.id === activeTabId;
                const pathStr = isAct ? currentPath || tab.path : tab.path;
                const lbl = getTabLabel(pathStr);
                return (
                  <div
                    key={tab.id}
                    onClick={() => {
                      switchTab(tab.id);
                      setAllTabsOpen(false);
                    }}
                    style={{
                      ...styles.allTabsItem,
                      backgroundColor: isAct ? 'var(--bg-selected)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 16 }}>
                        {idx + 1}.
                      </span>
                      {tab.pinned ? (
                        <Pin size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      ) : (
                        <Folder
                          size={13}
                          style={{
                            color: isAct ? 'var(--accent)' : 'var(--text-secondary)',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: isAct ? 700 : 500,
                            color: isAct ? 'var(--accent)' : 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {lbl}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {pathStr}
                        </div>
                      </div>
                    </div>

                    {tabs.length > 1 && !tab.pinned && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(tab.id);
                        }}
                        title={t('tabs.closeTab')}
                        style={styles.closeBtn}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
            disabled={reachedTabLimit}
            style={{
              ...styles.menuItem,
              opacity: reachedTabLimit ? 0.45 : 1,
            }}
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
    overflow: 'visible',
    position: 'relative',
    zIndex: 120,
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
    margin: '0 6px',
    flexShrink: 0,
  },
  scrollArrowBtn: {
    width: 22,
    height: 26,
    borderRadius: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  tabList: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    height: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    minWidth: 0,
    flex: '0 1 auto',
    maxWidth: 'calc(100vw - 260px)',
  },
  fixedTabActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 4,
    flexShrink: 0,
    position: 'relative',
  },
  allTabsTriggerBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    height: 26,
    padding: '0 6px',
    borderRadius: 5,
    border: '1px solid transparent',
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabCountBadge: {
    fontSize: 10.5,
    fontWeight: 700,
    color: 'var(--accent)',
  },
  allTabsPopover: {
    position: 'absolute',
    top: 34,
    right: 0,
    width: 300,
    maxHeight: 380,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.42)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 1500,
  },
  allTabsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-subtle)',
    color: 'var(--text-secondary)',
  },
  closeOthersLink: {
    fontSize: 11,
    color: 'var(--accent)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  allTabsSearchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
  },
  allTabsSearchInput: {
    flex: 1,
    fontSize: 11.5,
    color: 'var(--text-primary)',
    background: 'transparent',
    border: 'none',
    outline: 'none',
  },
  allTabsList: {
    flex: 1,
    overflowY: 'auto',
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  allTabsItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 5,
    cursor: 'pointer',
  },
  dragSpacer: {
    flex: '1 1 32px',
    height: '100%',
    minWidth: 28,
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
    gap: 5,
    height: 28,
    flex: '1 1 148px',
    minWidth: 74,
    maxWidth: 184,
    padding: '0 7px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    border: '1px solid transparent',
    transition: 'background 0.12s, border-color 0.12s, min-width 0.12s',
  },
  pinnedTab: {
    flex: '0 0 auto',
    minWidth: 44,
    maxWidth: 96,
  },
  activeTab: {
    backgroundColor: 'var(--bg-surface)',
    borderColor: 'var(--border-subtle)',
    color: 'var(--text-primary)',
    fontWeight: 600,
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
    width: 17,
    height: 17,
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
    zIndex: 1600,
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
