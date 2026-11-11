import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, Loader2 } from 'lucide-react';
import { useBrowserStore } from './store';
import { useOperationsStore } from '../operations/store';
import { usePreviewStore } from '../preview/store';
import { Entry, openPath, enqueueOperation } from '../../lib/wails';
import { formatBytes, formatDateTime, getCollator } from '../../i18n/format';
import { FileTypeIcon, getFileTypeVisual } from '../../ui/FileTypeIcon';
import { isDatabaseFile, useDBStudioStore } from '../db-studio/store';

export const DetailsView: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    entries,
    isLoading,
    error,
    showHidden,
    sortField,
    sortDirection,
    selectedPaths,
    setSort,
    selectItem,
    navigateTo,
    refresh,
  } = useBrowserStore();

  const [dragTargetFolder, setDragTargetFolder] = useState<string | null>(null);
  const { density } = usePreviewStore();
  const rowHeight = density === 'compact' ? 23 : 29;
  const iconSize = density === 'compact' ? 13 : 16;
  const rowFontSize = density === 'compact' ? 11.5 : 12.5;

  const locale = i18n.language || 'pt-BR';
  const collator = useMemo(() => getCollator(locale), [locale]);

  // Filtragem e ordenação natural (pastas sempre primeiro)
  const sortedEntries = useMemo(() => {
    let list = entries;
    if (!showHidden) {
      list = list.filter((e) => !e.attrs.hidden);
    }

    return [...list].sort((a, b) => {
      // Pastas primeiro
      const aIsDir = a.kind === 'dir';
      const bIsDir = b.kind === 'dir';
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

      let res = 0;
      switch (sortField) {
        case 'name':
          res = collator.compare(a.name, b.name);
          break;
        case 'size':
          res = a.size - b.size;
          break;
        case 'type':
          res = collator.compare(
            getFileTypeVisual(a.name, a.kind).typeLabel,
            getFileTypeVisual(b.name, b.kind).typeLabel
          );
          break;
        case 'modTime':
          res = new Date(a.modTime).getTime() - new Date(b.modTime).getTime();
          break;
      }
      return sortDirection === 'asc' ? res : -res;
    });
  }, [entries, showHidden, sortField, sortDirection, collator]);

  const rowVirtualizer = useVirtualizer({
    count: sortedEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeight, rowVirtualizer]);

  const handleItemClick = (e: React.MouseEvent, entry: Entry) => {
    selectItem(entry.location.path, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const handleItemDoubleClick = (entry: Entry) => {
    if (entry.kind === 'dir') {
      navigateTo(entry.location.path);
    } else if (isDatabaseFile(entry.name)) {
      void useDBStudioStore.getState().openDatabase(entry.location.path);
    } else {
      openPath(entry.location.path);
    }
  };

  const getIcon = (entry: Entry) => {
    return <FileTypeIcon name={entry.name} kind={entry.kind} size={iconSize} />;
  };

  const getTypeName = (entry: Entry) => {
    if (entry.kind === 'dir') return t('types.folder');
    if (entry.kind === 'symlink') return t('types.symlink');
    return getFileTypeVisual(entry.name, entry.kind).typeLabel;
  };

  return (
    <div style={styles.container}>
      {/* Cabeçalho da Tabela */}
      <div style={styles.header}>
        <div style={{ ...styles.colName, ...styles.th }} onClick={() => setSort('name')}>
          <span>{t('columns.name')}</span>
          {sortField === 'name' && <ArrowUpDown size={12} style={{ opacity: 0.8 }} />}
        </div>
        <div style={{ ...styles.colSize, ...styles.th }} onClick={() => setSort('size')}>
          <span>{t('columns.size')}</span>
          {sortField === 'size' && <ArrowUpDown size={12} style={{ opacity: 0.8 }} />}
        </div>
        <div style={{ ...styles.colType, ...styles.th }} onClick={() => setSort('type')}>
          <span>{t('columns.type')}</span>
          {sortField === 'type' && <ArrowUpDown size={12} style={{ opacity: 0.8 }} />}
        </div>
        <div style={{ ...styles.colMod, ...styles.th }} onClick={() => setSort('modTime')}>
          <span>{t('columns.modified')}</span>
          {sortField === 'modTime' && <ArrowUpDown size={12} style={{ opacity: 0.8 }} />}
        </div>
      </div>

      {/* Conteúdo Virtualizado */}
      <div ref={parentRef} style={styles.list}>
        {isLoading && sortedEntries.length > 0 && (
          <div style={styles.floatingLoader}>
            <Loader2 size={13} className="spin-animation" style={{ color: 'var(--accent)' }} />
            <span>{t('status.loading')}</span>
          </div>
        )}
        {error ? (
          <div style={styles.centerMessage}>{t('errors.generic')}</div>
        ) : sortedEntries.length === 0 ? (
          <div style={styles.centerMessage}>
            {isLoading ? (
              <div style={styles.centerLoading}>
                <Loader2 size={24} className="spin-animation" style={{ color: 'var(--accent)', marginBottom: 8 }} />
                <span>{t('status.loading')}</span>
              </div>
            ) : (
              t('status.empty')
            )}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = sortedEntries[virtualRow.index];
              const isSelected = selectedPaths.has(item.location.path);

              return (
                <div
                  key={item.location.path}
                  data-entry-path={item.location.path}
                  draggable={true}
                  onDragStart={(e) => {
                    let pathsToDrag = Array.from(selectedPaths);
                    if (!selectedPaths.has(item.location.path)) {
                      selectItem(item.location.path, false, false);
                      pathsToDrag = [item.location.path];
                    }
                    e.dataTransfer.setData(
                      'application/x-pulsares-paths',
                      JSON.stringify(pathsToDrag)
                    );
                    e.dataTransfer.setData('text/plain', pathsToDrag.join('\n'));
                    e.dataTransfer.effectAllowed = 'copyMove';
                  }}
                  onDragOver={(e) => {
                    if (item.kind !== 'dir') return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
                    if (dragTargetFolder !== item.location.path) {
                      setDragTargetFolder(item.location.path);
                    }
                  }}
                  onDragLeave={() => {
                    if (item.kind !== 'dir') return;
                    if (dragTargetFolder === item.location.path) {
                      setDragTargetFolder(null);
                    }
                  }}
                  onDrop={async (e) => {
                    if (item.kind !== 'dir') return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragTargetFolder(null);

                    const raw = e.dataTransfer.getData('application/x-pulsares-paths');
                    if (!raw) return;
                    try {
                      const paths = JSON.parse(raw) as string[];
                      if (!Array.isArray(paths) || paths.length === 0) return;

                      const destDir = item.location.path;
                      const normDest = destDir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

                      // Validação estrita: não pode soltar uma pasta dentro de si mesma ou de suas subpastas
                      const validPaths = paths.filter((p) => {
                        const normSrc = p.replace(/\\/g, '/').toLowerCase();
                        if (normSrc === normDest) return false;
                        if (normDest.startsWith(normSrc + '/')) return false;
                        const normParent = normSrc.replace(/\/[^/]+$/, '');
                        if (normParent === normDest) return false;
                        return true;
                      });

                      if (validPaths.length === 0) return;

                      const kind = e.ctrlKey ? 'copy' : 'move';
                      useOperationsStore.getState().setPanelOpen(true);
                      await enqueueOperation(
                        kind,
                        validPaths,
                        destDir,
                        'ask',
                        useOperationsStore.getState().verifyHash
                      );
                      refresh();
                    } catch {
                      // Ignorar payload inválido
                    }
                  }}
                  onClick={(e) => handleItemClick(e, item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  style={{
                    ...styles.row,
                    top: `${virtualRow.start}px`,
                    height: `${virtualRow.size}px`,
                    fontSize: rowFontSize,
                    backgroundColor: dragTargetFolder === item.location.path
                      ? 'var(--bg-selected, rgba(59, 130, 246, 0.25))'
                      : isSelected
                      ? 'var(--accent-subtle)'
                      : virtualRow.index % 2 === 0
                      ? 'transparent'
                      : 'rgba(0,0,0,0.015)',
                    color: isSelected ? 'var(--accent-text)' : 'inherit',
                    opacity: item.attrs.hidden ? 0.6 : 1,
                    outline: dragTargetFolder === item.location.path
                      ? '2px dashed var(--accent)'
                      : 'none',
                    outlineOffset: '-2px',
                    cursor: 'default',
                  }}
                >
                  <div style={{ ...styles.colName, ...styles.cell }}>
                    {getIcon(item)}
                    <span style={styles.nameText} title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div style={{ ...styles.colSize, ...styles.cell }}>
                    {item.kind === 'dir' ? '' : formatBytes(item.size, locale)}
                  </div>
                  <div style={{ ...styles.colType, ...styles.cell }}>{getTypeName(item)}</div>
                  <div style={{ ...styles.colMod, ...styles.cell }}>
                    {formatDateTime(item.modTime, locale)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-surface)',
  },
  header: {
    display: 'flex',
    height: 'var(--header-height)',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 500,
  },
  th: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 8px',
    cursor: 'default',
    userSelect: 'none',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  row: {
    position: 'absolute',
    left: 0,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    cursor: 'default',
  },
  cell: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  colName: {
    flex: 3,
    minWidth: 200,
    gap: 8,
  },
  colSize: {
    flex: 1,
    minWidth: 90,
    justifyContent: 'flex-end',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
  },
  colType: {
    flex: 1.5,
    minWidth: 120,
    color: 'var(--text-muted)',
    fontSize: 11,
  },
  colMod: {
    flex: 1.5,
    minWidth: 140,
    color: 'var(--text-muted)',
    fontSize: 11,
  },
  nameText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  centerMessage: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  floatingLoader: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '4px 10px',
    fontSize: 11.5,
    backgroundColor: 'var(--bg-selected)',
    color: 'var(--accent)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  centerLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
