import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
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
} from 'lucide-react';
import { useFolderTreeStore } from './folder-tree/store';
import { FolderTree } from './folder-tree/FolderTree';
import { useBrowserStore, getTabLabel } from '../browser/store';
import { useProductivityStore } from '../productivity/store';
import { formatBytes } from '../../i18n/format';
import { ejectDrive } from '../../lib/wails';

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

  useEffect(() => {
    void loadRemoteState();
  }, [loadRemoteState]);

  const draggingRef = useRef(false);

  if (!visible) {
    return null;
  }

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
      {favOpen && (
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
                onClick={() => navigateTo(fav.path)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    newTab(fav.path);
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
      )}

      {/* 2. Seção: Árvore de Pastas */}
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
        </div>
      </div>

      <FolderTree />

      {/* 3. Seção: Locais Recentes */}
      <div style={styles.sectionHeader} onClick={() => setRecentOpen(!recentOpen)}>
        <div style={styles.sectionTitleRow}>
          {recentOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Clock size={12} style={{ color: 'var(--text-secondary)' }} />
          <span style={styles.title}>{t('sidebar.recent')}</span>
        </div>
      </div>
      {recentOpen && (
        <div style={{ ...styles.sectionBody, maxHeight: 130, overflowY: 'auto' }}>
          {recent.length === 0 ? (
            <div style={styles.emptyHint}>{t('sidebar.noRecent')}</div>
          ) : (
            recent.map((r) => (
              <div
                key={r.path}
                style={styles.itemRow}
                onClick={() => navigateTo(r.path)}
                title={r.path}
              >
                <Clock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={styles.itemText}>{getTabLabel(r.path)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. Seção: Unidades / Volumes com espaço livre (abaixo de Recentes e colapsada por padrão) */}
      <div style={styles.sectionHeader} onClick={() => setDrivesOpen(!drivesOpen)}>
        <div style={styles.sectionTitleRow}>
          {drivesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <HardDrive size={12} style={{ color: 'var(--accent)' }} />
          <span style={styles.title}>{t('sidebar.drives')}</span>
        </div>
      </div>
      {drivesOpen && (
        <div style={{ ...styles.sectionBody, maxHeight: 160, overflowY: 'auto' }}>
          {drives.map((d) => {
            const total = d.totalBytes || 0;
            const free = d.freeBytes || 0;
            const usedPct =
              total > 0 ? Math.min(100, Math.round(((total - free) / total) * 100)) : 0;

            return (
              <div
                key={d.path}
                style={styles.driveCard}
                onClick={() => navigateTo(d.path)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    newTab(d.path);
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
      )}

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
      {sshOpen && (
        <div style={{ ...styles.sectionBody, maxHeight: 150, overflowY: 'auto' }}>
          {remoteProfiles.length === 0 ? (
            <div
              style={{ ...styles.emptyHint, cursor: 'pointer', color: 'var(--accent)' }}
              onClick={() => void openRemoteModal()}
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
      )}

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
  sidebar: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--bg-surface)',
    borderRight: '1px solid var(--border-subtle)',
    flexShrink: 0,
    userSelect: 'none',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    padding: '0 8px',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'pointer',
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
    cursor: 'pointer',
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
    cursor: 'pointer',
  },
  driveCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '5px 6px',
    borderRadius: 5,
    cursor: 'pointer',
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
