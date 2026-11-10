import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderTree as FolderTreeIcon,
  Crosshair,
  ChevronsDownUp,
  RotateCw,
  Star,
  HardDrive,
  Clock,
  ChevronDown,
  ChevronRight,
  Unplug,
  Server,
  TerminalSquare,
  Plus,
  X,
  PanelLeftOpen,
  PanelLeftClose,
  Pin,
} from 'lucide-react';
import { useFolderTreeStore } from './folder-tree/store';
import { FolderTree } from './folder-tree/FolderTree';
import { useBrowserStore, getTabLabel } from '../browser/store';
import { useProductivityStore } from '../productivity/store';
import { formatBytes } from '../../i18n/format';
import { ejectDrive } from '../../lib/wails';

type SidebarSection = 'tree' | 'favorites' | 'recent' | 'drives' | 'ssh';

export const Sidebar: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const {
    visible,
    width,
    followActiveTab,
    drives,
    favorites,
    recent,
    setSidebarWidth,
    toggleSidebar,
    toggleFollowActiveTab,
    collapseAll,
    loadRoots,
    refreshSidebarMeta,
    toggleFavorite,
  } = useFolderTreeStore();
  const { navigateTo, newTab, currentPath } = useBrowserStore();
  const {
    remoteProfiles,
    activeSftpIds,
    loadRemoteState,
    openRemoteModal,
    disconnectSFTP,
    openSshTerminalSession,
  } = useProductivityStore();

  const [favOpen, setFavOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(false);
  const [drivesOpen, setDrivesOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(true);

  // Estado para o modo recolhido (Activity Bar tipo VS Code)
  const [activeFlyout, setActiveFlyout] = useState<SidebarSection | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const activityBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadRemoteState();
  }, [loadRemoteState]);

  // Auto-ocultar do flyout ao clicar fora ou pressionar Escape
  useEffect(() => {
    if (!activeFlyout) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(target) &&
        activityBarRef.current &&
        !activityBarRef.current.contains(target)
      ) {
        setActiveFlyout(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveFlyout(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeFlyout]);

  const draggingRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current) return;
      setSidebarWidth(moveEvent.clientX);
    };

    const onMouseUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handlePinOpen = () => {
    setActiveFlyout(null);
    toggleSidebar();
  };

  // --- Sub-renderers de seções reutilizáveis entre painel fixo e flyout ---

  const renderFavorites = (onItemClick?: () => void) => (
    <div style={styles.sectionBody}>
      {favorites.length === 0 ? (
        <div style={styles.emptyHint}>{t('sidebar.noFavorites')}</div>
      ) : (
        favorites.map((fav) => (
          <div
            key={fav.path}
            style={{
              ...styles.itemRow,
              ...(fav.path === currentPath ? styles.itemActive : {}),
            }}
            onClick={() => {
              navigateTo(fav.path);
              onItemClick?.();
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                newTab(fav.path);
                onItemClick?.();
              }
            }}
            title={fav.path}
          >
            <Star size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={styles.itemText}>{fav.label}</span>
            <button
              type="button"
              style={styles.removeBtn}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(fav.path);
              }}
              title={t('sidebar.removeFavorite')}
            >
              <X size={11} />
            </button>
          </div>
        ))
      )}
    </div>
  );

  const renderTree = (onItemClick?: () => void) => (
    <div style={styles.treeSectionWrapper}>
      <div style={styles.header}>
        <span style={styles.title}>{t('tree.title')}</span>
        <div style={styles.headerActions}>
          <button
            type="button"
            style={{
              ...styles.iconBtn,
              color: followActiveTab ? 'var(--accent)' : 'var(--text-secondary)',
            }}
            onClick={toggleFollowActiveTab}
            title={t('tree.followActiveTab')}
            aria-label={t('tree.followActiveTab')}
          >
            <Crosshair size={13} />
          </button>
          <button
            type="button"
            style={styles.iconBtn}
            onClick={collapseAll}
            title={t('tree.collapseAll')}
            aria-label={t('tree.collapseAll')}
          >
            <ChevronsDownUp size={13} />
          </button>
          <button
            type="button"
            style={styles.iconBtn}
            onClick={loadRoots}
            title={t('tree.refresh')}
            aria-label={t('tree.refresh')}
          >
            <RotateCw size={13} />
          </button>
          {visible && (
            <button
              type="button"
              style={styles.iconBtn}
              onClick={toggleSidebar}
              title={t('nav.toggleSidebar')}
              aria-label={t('nav.toggleSidebar')}
            >
              <PanelLeftClose size={13} />
            </button>
          )}
        </div>
      </div>
      <div style={styles.treeContentWrapper}>
        <FolderTree onNavigate={onItemClick} />
      </div>
    </div>
  );

  const renderRecent = (onItemClick?: () => void) => (
    <div style={{ ...styles.sectionBody, maxHeight: 220, overflowY: 'auto' }}>
      {recent.length === 0 ? (
        <div style={styles.emptyHint}>{t('sidebar.noRecent')}</div>
      ) : (
        recent.map((r) => (
          <div
            key={r.path}
            style={styles.itemRow}
            onClick={() => {
              navigateTo(r.path);
              onItemClick?.();
            }}
            title={r.path}
          >
            <Clock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={styles.itemText}>{getTabLabel(r.path)}</span>
          </div>
        ))
      )}
    </div>
  );

  const renderDrives = (onItemClick?: () => void) => (
    <div style={{ ...styles.sectionBody, maxHeight: 240, overflowY: 'auto' }}>
      {drives.map((d) => {
        const total = d.totalBytes || 0;
        const free = d.freeBytes || 0;
        const usedPct =
          total > 0 ? Math.min(100, Math.round(((total - free) / total) * 100)) : 0;

        return (
          <div
            key={d.path}
            style={styles.driveCard}
            onClick={() => {
              navigateTo(d.path);
              onItemClick?.();
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                newTab(d.path);
                onItemClick?.();
              }
            }}
          >
            <div style={styles.driveTop}>
              <HardDrive size={13} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ ...styles.driveLabel, flex: 1 }}>{d.label || d.path}</span>
              {d.isRemovable && (
                <button
                  type="button"
                  style={styles.removeBtn}
                  title={t('os.ejectDrive')}
                  onClick={(e) => {
                    e.stopPropagation();
                    void ejectDrive(d.path).then(() => refreshSidebarMeta());
                  }}
                >
                  <Unplug size={11} />
                </button>
              )}
            </div>
            {total > 0 && (
              <>
                <div style={styles.driveBarTrack}>
                  <div style={{ ...styles.driveBarFill, width: `${usedPct}%` }} />
                </div>
                <div style={styles.driveMeta}>
                  {t('sidebar.freeOf', {
                    free: formatBytes(free, i18n.language),
                    total: formatBytes(total, i18n.language),
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderSsh = (onItemClick?: () => void) => (
    <div style={{ ...styles.sectionBody, maxHeight: 240, overflowY: 'auto' }}>
      {remoteProfiles.length === 0 ? (
        <div
          style={{ ...styles.emptyHint, cursor: 'default', color: 'var(--accent)' }}
          onClick={() => {
            void openRemoteModal();
            onItemClick?.();
          }}
        >
          + Nova conexão segura SSH / SFTP
        </div>
      ) : (
        remoteProfiles.map((p) => {
          const isConnected = activeSftpIds.includes(p.id);
          const sftpPrefix = `sftp://${p.id}`;
          const isCurrent = currentPath.startsWith(sftpPrefix);
          return (
            <div
              key={p.id}
              style={{
                ...styles.itemRow,
                ...(isCurrent ? styles.itemActive : {}),
              }}
              onClick={() => {
                if (isConnected) {
                  void navigateTo(`${sftpPrefix}${p.remotePath || '/'}`);
                } else {
                  void openRemoteModal();
                }
                onItemClick?.();
              }}
              title={`${p.username ? `${p.username}@` : ''}${p.host}:${p.port}${p.remotePath}`}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: isConnected ? '#10b981' : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              />
              <span style={styles.itemText}>{p.name}</span>
              <button
                type="button"
                style={styles.removeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  void openSshTerminalSession(p);
                  onItemClick?.();
                }}
                title="Abrir Terminal SSH Interativo"
              >
                <TerminalSquare size={11} />
              </button>
              {isConnected && (
                <button
                  type="button"
                  style={styles.removeBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    void disconnectSFTP(p.id);
                  }}
                  title="Desconectar SFTP"
                >
                  <Unplug size={11} />
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const getSectionInfo = (section: SidebarSection) => {
    switch (section) {
      case 'tree':
        return {
          title: t('tree.title'),
          icon: <FolderTreeIcon size={14} style={{ color: 'var(--accent)' }} />,
        };
      case 'favorites':
        return {
          title: t('sidebar.favorites'),
          icon: <Star size={14} style={{ color: 'var(--accent)' }} />,
        };
      case 'recent':
        return {
          title: t('sidebar.recent'),
          icon: <Clock size={14} style={{ color: 'var(--accent)' }} />,
        };
      case 'drives':
        return {
          title: t('sidebar.drives'),
          icon: <HardDrive size={14} style={{ color: 'var(--accent)' }} />,
        };
      case 'ssh':
        return {
          title: 'SSH / SFTP',
          icon: (
            <Server
              size={14}
              style={{ color: activeSftpIds.length > 0 ? '#10b981' : 'var(--accent)' }}
            />
          ),
        };
    }
  };

  // --- MODO RECOLHIDO: Activity Bar tipo VS Code com Flyout Auto-Ocultável ---
  if (!visible) {
    return (
      <div style={styles.activityBarContainer}>
        <aside ref={activityBarRef} style={styles.activityBar} aria-label="Activity Bar">
          <div style={styles.activityBarTop}>
            <button
              type="button"
              style={{
                ...styles.activityBtn,
                ...(activeFlyout === 'tree' ? styles.activityBtnActive : {}),
              }}
              onClick={() => setActiveFlyout(activeFlyout === 'tree' ? null : 'tree')}
              title={t('tree.title')}
              aria-label={t('tree.title')}
            >
              <FolderTreeIcon size={18} />
            </button>
            <button
              type="button"
              style={{
                ...styles.activityBtn,
                ...(activeFlyout === 'favorites' ? styles.activityBtnActive : {}),
              }}
              onClick={() => setActiveFlyout(activeFlyout === 'favorites' ? null : 'favorites')}
              title={t('sidebar.favorites')}
              aria-label={t('sidebar.favorites')}
            >
              <Star size={18} />
            </button>
            <button
              type="button"
              style={{
                ...styles.activityBtn,
                ...(activeFlyout === 'recent' ? styles.activityBtnActive : {}),
              }}
              onClick={() => setActiveFlyout(activeFlyout === 'recent' ? null : 'recent')}
              title={t('sidebar.recent')}
              aria-label={t('sidebar.recent')}
            >
              <Clock size={18} />
            </button>
            <button
              type="button"
              style={{
                ...styles.activityBtn,
                ...(activeFlyout === 'drives' ? styles.activityBtnActive : {}),
              }}
              onClick={() => setActiveFlyout(activeFlyout === 'drives' ? null : 'drives')}
              title={t('sidebar.drives')}
              aria-label={t('sidebar.drives')}
            >
              <HardDrive size={18} />
            </button>
            <button
              type="button"
              style={{
                ...styles.activityBtn,
                ...(activeFlyout === 'ssh' ? styles.activityBtnActive : {}),
              }}
              onClick={() => setActiveFlyout(activeFlyout === 'ssh' ? null : 'ssh')}
              title="SSH / SFTP"
              aria-label="SSH / SFTP"
            >
              <Server
                size={18}
                style={{ color: activeSftpIds.length > 0 ? '#10b981' : undefined }}
              />
            </button>
          </div>

          <div style={styles.activityBarBottom}>
            <button
              type="button"
              style={styles.activityBtn}
              onClick={toggleSidebar}
              title={`${t('nav.toggleSidebar')} (Fixar)`}
              aria-label={t('nav.toggleSidebar')}
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        </aside>

        {/* Flyout Popout Flutuante com Auto-Ocultar */}
        {activeFlyout && (
          <div
            ref={flyoutRef}
            style={styles.flyout}
            role="region"
            aria-label={getSectionInfo(activeFlyout).title}
          >
            <div style={styles.flyoutHeader}>
              <div style={styles.flyoutTitleRow}>
                {getSectionInfo(activeFlyout).icon}
                <span style={styles.flyoutTitle}>{getSectionInfo(activeFlyout).title}</span>
              </div>
              <div style={styles.flyoutActions}>
                {activeFlyout === 'ssh' && (
                  <button
                    type="button"
                    style={styles.iconBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      void openRemoteModal();
                      setActiveFlyout(null);
                    }}
                    title={t('remote.title')}
                    aria-label={t('remote.title')}
                  >
                    <Plus size={13} />
                  </button>
                )}
                <button
                  type="button"
                  style={styles.iconBtn}
                  onClick={handlePinOpen}
                  title={`${t('nav.toggleSidebar')} (Fixar painel definitivamente)`}
                  aria-label="Fixar painel"
                >
                  <Pin size={13} />
                </button>
                <button
                  type="button"
                  style={styles.iconBtn}
                  onClick={() => setActiveFlyout(null)}
                  title="Fechar (Esc)"
                  aria-label="Fechar"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            <div style={styles.flyoutBody}>
              {activeFlyout === 'tree' && renderTree(() => setActiveFlyout(null))}
              {activeFlyout === 'favorites' && renderFavorites(() => setActiveFlyout(null))}
              {activeFlyout === 'recent' && renderRecent(() => setActiveFlyout(null))}
              {activeFlyout === 'drives' && renderDrives(() => setActiveFlyout(null))}
              {activeFlyout === 'ssh' && renderSsh(() => setActiveFlyout(null))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- MODO FIXO DEFINITIVO: Painel Lateral Completo com Resizer ---
  return (
    <aside style={{ ...styles.sidebar, width }}>
      {/* 1. Seção: Favoritos */}
      <div style={styles.sectionHeader} onClick={() => setFavOpen(!favOpen)}>
        <div style={styles.sectionTitleRow}>
          {favOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Star size={12} style={{ color: 'var(--accent)' }} />
          <span style={styles.title}>{t('sidebar.favorites')}</span>
        </div>
      </div>
      {favOpen && renderFavorites()}

      {/* 2. Seção: Árvore de Pastas */}
      {renderTree()}

      {/* 3. Seção: Locais Recentes */}
      <div style={styles.sectionHeader} onClick={() => setRecentOpen(!recentOpen)}>
        <div style={styles.sectionTitleRow}>
          {recentOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Clock size={12} style={{ color: 'var(--text-secondary)' }} />
          <span style={styles.title}>{t('sidebar.recent')}</span>
        </div>
      </div>
      {recentOpen && renderRecent()}

      {/* 4. Seção: Unidades / Volumes */}
      <div style={styles.sectionHeader} onClick={() => setDrivesOpen(!drivesOpen)}>
        <div style={styles.sectionTitleRow}>
          {drivesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <HardDrive size={12} style={{ color: 'var(--accent)' }} />
          <span style={styles.title}>{t('sidebar.drives')}</span>
        </div>
      </div>
      {drivesOpen && renderDrives()}

      {/* 5. Seção: Conexões Seguras SSH / SFTP */}
      <div style={styles.sectionHeader} onClick={() => setSshOpen(!sshOpen)}>
        <div style={styles.sectionTitleRow}>
          {sshOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Server
            size={12}
            style={{ color: activeSftpIds.length > 0 ? '#10b981' : 'var(--accent)' }}
          />
          <span style={styles.title}>SSH / SFTP</span>
        </div>
        <button
          type="button"
          style={styles.iconBtn}
          onClick={(e) => {
            e.stopPropagation();
            void openRemoteModal();
          }}
          title={t('remote.title')}
          aria-label={t('remote.title')}
        >
          <Plus size={12} />
        </button>
      </div>
      {sshOpen && renderSsh()}

      <div
        role="separator"
        aria-orientation="vertical"
        style={styles.resizer}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => setSidebarWidth(250)}
      />
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  // Modo Painel Fixo
  sidebar: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--bg-surface)',
    borderRight: '1px solid var(--border-subtle)',
    flexShrink: 0,
    userSelect: 'none',
    overflow: 'hidden',
  },
  // Modo Activity Bar (VS Code)
  activityBarContainer: {
    position: 'relative',
    height: '100%',
    display: 'flex',
    flexShrink: 0,
    zIndex: 40,
  },
  activityBar: {
    width: 44,
    height: '100%',
    backgroundColor: 'var(--bg-surface)',
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    boxSizing: 'border-box',
    userSelect: 'none',
  },
  activityBarTop: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  activityBarBottom: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  activityBtn: {
    width: 36,
    height: 36,
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'default',
    transition: 'all 0.15s ease',
  },
  activityBtnActive: {
    backgroundColor: 'var(--bg-selected, rgba(59, 130, 246, 0.15))',
    color: 'var(--accent)',
    boxShadow: 'inset 2px 0 0 var(--accent)',
  },
  // Modo Flyout Flutuante com Auto-Ocultar
  flyout: {
    position: 'absolute',
    left: 44,
    top: 0,
    bottom: 0,
    width: 290,
    backgroundColor: 'var(--bg-surface)',
    borderRight: '1px solid var(--border-subtle)',
    boxShadow: '4px 0 24px rgba(0, 0, 0, 0.28)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 60,
    overflow: 'hidden',
    userSelect: 'none',
  },
  flyoutHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    padding: '0 10px',
    backgroundColor: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  flyoutTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  flyoutTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: '0.02em',
  },
  flyoutActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  flyoutBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  // Árvore e Seções
  treeSectionWrapper: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 140,
    overflow: 'hidden',
  },
  treeContentWrapper: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    padding: '0 8px',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'default',
    flexShrink: 0,
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    color: 'var(--text-secondary)',
  },
  sectionBody: {
    padding: '4px 6px',
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flexShrink: 0,
  },
  emptyHint: {
    fontSize: 11,
    color: 'var(--text-muted)',
    padding: '4px 6px',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'default',
  },
  itemActive: {
    backgroundColor: 'var(--bg-selected, rgba(59, 130, 246, 0.18))',
    fontWeight: 500,
  },
  itemText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  removeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    color: 'var(--text-muted)',
    cursor: 'default',
  },
  driveCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '5px 6px',
    borderRadius: 5,
    cursor: 'default',
  },
  driveTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  driveLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  driveBarTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'var(--border-subtle)',
    overflow: 'hidden',
  },
  driveBarFill: {
    height: '100%',
    backgroundColor: 'var(--accent)',
  },
  driveMeta: {
    fontSize: 10,
    color: 'var(--text-secondary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    padding: '0 10px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-secondary)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 4,
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'default',
  },
  resizer: {
    position: 'absolute',
    top: 0,
    right: -3,
    width: 6,
    height: '100%',
    cursor: 'col-resize',
    zIndex: 10,
  },
};
