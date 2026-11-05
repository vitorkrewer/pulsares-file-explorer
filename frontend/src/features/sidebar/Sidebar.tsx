import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Crosshair, RotateCw } from 'lucide-react';
import { useFolderTreeStore } from './folder-tree/store';
import { FolderTree } from './folder-tree/FolderTree';

export const Sidebar: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    visible,
    width,
    followActiveTab,
    setSidebarWidth,
    toggleFollowActiveTab,
    loadRoots,
  } = useFolderTreeStore();

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
            onClick={loadRoots}
            title={t('tree.refresh')}
            aria-label={t('tree.refresh')}
          >
            <RotateCw size={13} />
          </button>
        </div>
      </div>

      <FolderTree />

      <div
        role="separator"
        aria-orientation="vertical"
        style={styles.resizer}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => setSidebarWidth(240)}
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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 30,
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

