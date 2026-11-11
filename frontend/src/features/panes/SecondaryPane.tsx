import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, RotateCw, ArrowLeftRight } from 'lucide-react';
import { useDualPaneStore } from './store';
import { useBrowserStore } from '../browser/store';
import { useOperationsStore } from '../operations/store';
import { usePreviewStore } from '../preview/store';
import { formatBytes, formatDateTime, getCollator } from '../../i18n/format';
import { openPath, enqueueOperation } from '../../lib/wails';
import { FileTypeIcon } from '../../ui/FileTypeIcon';
import { isDatabaseFile, useDBStudioStore } from '../db-studio/store';

export const SecondaryPane: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const {
    secondaryPath,
    secondaryEntries,
    secondarySelected,
    focusedPane,
    setFocusedPane,
    navigateSecondary,
    refreshSecondary,
    selectSecondaryItem,
  } = useDualPaneStore();
  const { showHidden, navigateTo, currentPath } = useBrowserStore();
  const [dragOver, setDragOver] = useState(false);
  const { density } = usePreviewStore();
  const rowHeight = density === 'compact' ? 23 : 28;

  const parentRef = useRef<HTMLDivElement>(null);

  const sortedEntries = useMemo(() => {
    const filtered = showHidden
      ? secondaryEntries
      : secondaryEntries.filter((e) => !e.attrs.hidden);
    const collator = getCollator(i18n.language);
    return [...filtered].sort((a, b) => {
      if (a.kind === 'dir' && b.kind !== 'dir') return -1;
      if (a.kind !== 'dir' && b.kind === 'dir') return 1;
      return collator.compare(a.name, b.name);
    });
  }, [secondaryEntries, showHidden, i18n.language]);

  const rowVirtualizer = useVirtualizer({
    count: sortedEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowVirtualizer]);

  const handleGoUp = () => {
    if (!secondaryPath) return;
    const normalized = secondaryPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      const isWin = /^[a-zA-Z]:/.test(normalized);
      const parent = isWin
        ? parts.length === 1
          ? `${parts[0]}\\`
          : parts.join('\\')
        : '/' + parts.join('/');
      navigateSecondary(parent);
    }
  };

  const handleSwapWithPrimary = () => {
    const prevPrimary = currentPath;
    if (secondaryPath) {
      navigateTo(secondaryPath);
    }
    if (prevPrimary) {
      navigateSecondary(prevPrimary);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData('application/x-pulsares-paths');
    if (!raw || !secondaryPath) return;
    try {
      const paths = JSON.parse(raw) as string[];
      if (Array.isArray(paths) && paths.length > 0) {
        const kind = e.shiftKey ? 'move' : 'copy';
        useOperationsStore.getState().setPanelOpen(true);
        await enqueueOperation(
          kind,
          paths,
          secondaryPath,
          'ask',
          useOperationsStore.getState().verifyHash
        );
        refreshSecondary();
      }
    } catch {
      // Ignorar payload inválido
    }
  };

  return (
    <div
      onClick={() => setFocusedPane('secondary')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{
        ...styles.pane,
        ...(focusedPane === 'secondary' ? styles.focusedPane : {}),
        ...(dragOver ? styles.dragOverPane : {}),
      }}
    >
      <div style={styles.header}>
        <div style={styles.navGroup}>
          <button type="button" style={styles.iconBtn} onClick={handleGoUp} title={t('nav.up')}>
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            style={styles.iconBtn}
            onClick={refreshSecondary}
            title={t('nav.refresh')}
          >
            <RotateCw size={13} />
          </button>
          <button
            type="button"
            style={styles.iconBtn}
            onClick={handleSwapWithPrimary}
            title={t('panes.activatePane')}
          >
            <ArrowLeftRight size={13} />
          </button>
        </div>
        <span style={styles.pathText} title={secondaryPath}>
          {secondaryPath}
        </span>
      </div>

      <div ref={parentRef} style={styles.listContainer}>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = sortedEntries[virtualRow.index];
            const path = entry.location.path;
            const isSelected = secondarySelected.has(path);

            return (
              <div
                key={path}
                draggable
                onDragStart={(e) => {
                  const paths = isSelected
                    ? Array.from(secondarySelected)
                    : [path];
                  e.dataTransfer.setData(
                    'application/x-pulsares-paths',
                    JSON.stringify(paths)
                  );
                }}
                onClick={(e) =>
                  selectSecondaryItem(
                    path,
                    e.ctrlKey || e.metaKey,
                    e.shiftKey,
                    sortedEntries.map((it) => it.location.path)
                  )
                }
                onDoubleClick={() => {
                  if (entry.kind === 'dir') {
                    navigateSecondary(path);
                  } else if (isDatabaseFile(entry.name)) {
                    void useDBStudioStore.getState().openDatabase(path);
                  } else {
                    openPath(path);
                  }
                }}
                style={{
                  ...styles.row,
                  ...(isSelected ? styles.selectedRow : {}),
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`,
                }}
              >
                <FileTypeIcon name={entry.name} kind={entry.kind} size={14} />
                <span style={styles.nameCell}>{entry.name}</span>
                <span style={styles.sizeCell}>
                  {entry.kind === 'dir' ? '' : formatBytes(entry.size, i18n.language)}
                </span>
                <span style={styles.dateCell}>
                  {formatDateTime(entry.modTime, i18n.language)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  pane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-app)',
    borderLeft: '1px solid var(--border-subtle)',
  },
  focusedPane: {
    boxShadow: 'inset 0 2px 0 var(--accent)',
  },
  dragOverPane: {
    outline: '2px dashed var(--accent)',
    outlineOffset: -4,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 32,
    padding: '0 10px',
    backgroundColor: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 12,
  },
  navGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 4,
    color: 'var(--text-secondary)',
    cursor: 'default',
  },
  pathText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  listContainer: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    userSelect: 'none',
  },
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px',
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'default',
    boxSizing: 'border-box',
  },
  selectedRow: {
    backgroundColor: 'var(--bg-selected, rgba(59, 130, 246, 0.22))',
  },
  nameCell: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sizeCell: {
    width: 80,
    textAlign: 'right',
    color: 'var(--text-secondary)',
    fontSize: 11,
  },
  dateCell: {
    width: 120,
    textAlign: 'right',
    color: 'var(--text-secondary)',
    fontSize: 11,
  },
};

