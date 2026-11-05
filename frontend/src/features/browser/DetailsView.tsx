import React, { useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Folder, FileText, ArrowUpDown, CornerDownRight } from 'lucide-react';
import { useBrowserStore } from './store';
import { Entry, openPath } from '../../lib/wails';
import { formatBytes, formatDateTime, getCollator } from '../../i18n/format';

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
  } = useBrowserStore();

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
          res = collator.compare(a.kind, b.kind);
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
    estimateSize: () => 28,
    overscan: 20,
  });

  const handleItemClick = (e: React.MouseEvent, entry: Entry) => {
    selectItem(entry.location.path, e.ctrlKey || e.metaKey);
  };

  const handleItemDoubleClick = (entry: Entry) => {
    if (entry.kind === 'dir') {
      navigateTo(entry.location.path);
    } else {
      openPath(entry.location.path);
    }
  };

  const getIcon = (entry: Entry) => {
    if (entry.kind === 'dir') {
      return <Folder size={15} style={{ color: '#38bdf8', minWidth: 15 }} />;
    }
    if (entry.kind === 'symlink') {
      return <CornerDownRight size={15} style={{ color: '#a78bfa', minWidth: 15 }} />;
    }
    return <FileText size={15} style={{ color: 'var(--text-muted)', minWidth: 15 }} />;
  };

  const getTypeName = (entry: Entry) => {
    if (entry.kind === 'dir') return t('types.folder');
    if (entry.kind === 'symlink') return t('types.symlink');
    const dotIndex = entry.name.lastIndexOf('.');
    if (dotIndex > 0) {
      return entry.name.slice(dotIndex + 1).toUpperCase() + ' ' + t('types.file');
    }
    return t('types.file');
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
        {error ? (
          <div style={styles.centerMessage}>{t('errors.generic')}</div>
        ) : sortedEntries.length === 0 ? (
          <div style={styles.centerMessage}>
            {isLoading ? t('status.loading') : t('status.empty')}
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
                  onClick={(e) => handleItemClick(e, item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  style={{
                    ...styles.row,
                    top: `${virtualRow.start}px`,
                    height: `${virtualRow.size}px`,
                    backgroundColor: isSelected
                      ? 'var(--accent-subtle)'
                      : virtualRow.index % 2 === 0
                      ? 'transparent'
                      : 'rgba(0,0,0,0.015)',
                    color: isSelected ? 'var(--accent-text)' : 'inherit',
                    opacity: item.attrs.hidden ? 0.6 : 1,
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
    cursor: 'pointer',
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
};

