import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBrowserStore } from '../browser/store';
import { usePreviewStore, GroupByOption } from './store';
import { Entry, openPath, listDirectorySnapshot } from '../../lib/wails';
import { formatBytes, formatDate, getCollator } from '../../i18n/format';
import { FileTypeIcon, getFileTypeVisual } from '../../ui/FileTypeIcon';
import { isDatabaseFile, useDBStudioStore } from '../db-studio/store';

function isImageEntry(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
}

function getEntryGroupLabel(
  entry: Entry,
  groupBy: GroupByOption,
  t: (k: string) => string
): string {
  if (groupBy === 'type') {
    if (entry.kind === 'dir') return t('types.folder');
    return getFileTypeVisual(entry.name, entry.kind).typeLabel;
  }
  if (groupBy === 'size') {
    if (entry.kind === 'dir') return t('types.folder');
    if (entry.size < 100 * 1024) return '< 100 KB';
    if (entry.size < 10 * 1024 * 1024) return '100 KB – 10 MB';
    return '> 10 MB';
  }
  if (groupBy === 'date') {
    const d = new Date(entry.modTime);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toISOString().slice(0, 10);
  }
  return '';
}

function renderEntryIcon(entry: Entry, size = 18) {
  return <FileTypeIcon name={entry.name} kind={entry.kind} size={size} />;
}

export const AlternativeViews: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const {
    entries,
    currentPath,
    showHidden,
    selectedPaths,
    sortField,
    sortDirection,
    selectItem,
    navigateTo,
  } = useBrowserStore();
  const {
    viewMode,
    gridSize,
    groupBy,
    density,
    thumbnails,
    ensureThumbnail,
  } = usePreviewStore();

  const sortedEntries = useMemo(() => {
    const visible = showHidden ? entries : entries.filter((e) => !e.attrs.hidden);
    const collator = getCollator(i18n.language);
    return [...visible].sort((a, b) => {
      if (a.kind === 'dir' && b.kind !== 'dir') return -1;
      if (a.kind !== 'dir' && b.kind === 'dir') return 1;

      let cmp = 0;
      if (sortField === 'name') {
        cmp = collator.compare(a.name, b.name);
      } else if (sortField === 'size') {
        cmp = a.size - b.size;
      } else if (sortField === 'modTime') {
        cmp = new Date(a.modTime).getTime() - new Date(b.modTime).getTime();
      } else {
        cmp = collator.compare(a.name, b.name);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [entries, showHidden, sortField, sortDirection, i18n.language]);

  const groupedEntries = useMemo(() => {
    if (groupBy === 'none') {
      return [{ groupTitle: '', items: sortedEntries }];
    }
    const map = new Map<string, Entry[]>();
    for (const item of sortedEntries) {
      const g = getEntryGroupLabel(item, groupBy, t);
      const list = map.get(g) || [];
      list.push(item);
      map.set(g, list);
    }
    return Array.from(map.entries()).map(([groupTitle, items]) => ({ groupTitle, items }));
  }, [sortedEntries, groupBy, t]);

  // Solicitar miniaturas das primeiras imagens visíveis no modo grade
  useEffect(() => {
    if (viewMode !== 'grid') return;
    const dim = gridSize === 'small' ? 96 : gridSize === 'large' ? 180 : 136;
    const images = sortedEntries
      .filter((e) => e.kind === 'file' && isImageEntry(e.name))
      .slice(0, 60);
    for (const img of images) {
      void ensureThumbnail(img.location.path, dim);
    }
  }, [viewMode, gridSize, sortedEntries, ensureThumbnail]);

  // Estado para o modo Colunas (Miller Columns)
  const [parentEntries, setParentEntries] = useState<Entry[]>([]);
  const [childEntries, setChildEntries] = useState<Entry[]>([]);

  const selectedSinglePath = useMemo(() => {
    const arr = Array.from(selectedPaths);
    return arr.length === 1 ? arr[0] : null;
  }, [selectedPaths]);

  const selectedSingleEntry = useMemo(
    () => sortedEntries.find((e) => e.location.path === selectedSinglePath) || null,
    [sortedEntries, selectedSinglePath]
  );

  useEffect(() => {
    if (viewMode !== 'columns' || !currentPath) return;
    const normalized = currentPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash > 0) {
      const parentPath = currentPath.slice(0, lastSlash) || '/';
      void listDirectorySnapshot(parentPath, showHidden).then(setParentEntries);
    } else {
      setParentEntries([]);
    }
  }, [viewMode, currentPath, showHidden]);

  useEffect(() => {
    if (viewMode !== 'columns' || !selectedSingleEntry || selectedSingleEntry.kind !== 'dir') {
      setChildEntries([]);
      return;
    }
    void listDirectorySnapshot(selectedSingleEntry.location.path, showHidden).then(
      setChildEntries
    );
  }, [viewMode, selectedSingleEntry, showHidden]);

  const handleOpen = (entry: Entry) => {
    if (entry.kind === 'dir') {
      navigateTo(entry.location.path);
    } else if (isDatabaseFile(entry.name)) {
      void useDBStudioStore.getState().openDatabase(entry.location.path);
    } else {
      void openPath(entry.location.path);
    }
  };

  if (viewMode === 'list') {
    const rowPadding = density === 'compact' ? '4px 8px' : '7px 10px';
    return (
      <div style={styles.scrollContainer}>
        {groupedEntries.map((group) => (
          <div key={group.groupTitle || 'all'} style={{ marginBottom: 12 }}>
            {group.groupTitle && <div style={styles.groupHeader}>{group.groupTitle}</div>}
            <div style={styles.compactListGrid}>
              {group.items.map((entry) => {
                const isSelected = selectedPaths.has(entry.location.path);
                return (
                  <div
                    key={entry.location.path}
                    data-entry-path={entry.location.path}
                    onClick={(e) =>
                      selectItem(entry.location.path, e.ctrlKey || e.metaKey, e.shiftKey)
                    }
                    onDoubleClick={() => handleOpen(entry)}
                    style={{
                      ...styles.compactListItem,
                      padding: rowPadding,
                      backgroundColor: isSelected ? 'var(--bg-selected)' : 'transparent',
                    }}
                    title={entry.name}
                  >
                    {renderEntryIcon(entry, 15)}
                    <span style={styles.itemName}>{entry.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'grid') {
    const cardWidth = gridSize === 'small' ? 104 : gridSize === 'large' ? 184 : 140;
    const thumbHeight = gridSize === 'small' ? 68 : gridSize === 'large' ? 128 : 94;
    const dim = gridSize === 'small' ? 96 : gridSize === 'large' ? 180 : 136;

    return (
      <div style={styles.scrollContainer}>
        {groupedEntries.map((group) => (
          <div key={group.groupTitle || 'all'} style={{ marginBottom: 16 }}>
            {group.groupTitle && <div style={styles.groupHeader}>{group.groupTitle}</div>}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
                gap: density === 'compact' ? 8 : 12,
              }}
            >
              {group.items.map((entry) => {
                const isSelected = selectedPaths.has(entry.location.path);
                const thumbKey = `${entry.location.path}:${dim}`;
                const thumbUri = thumbnails[thumbKey];

                return (
                  <div
                    key={entry.location.path}
                    data-entry-path={entry.location.path}
                    onClick={(e) =>
                      selectItem(entry.location.path, e.ctrlKey || e.metaKey, e.shiftKey)
                    }
                    onDoubleClick={() => handleOpen(entry)}
                    style={{
                      ...styles.gridCard,
                      backgroundColor: isSelected ? 'var(--bg-selected)' : 'var(--bg-surface)',
                      borderColor: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
                    }}
                    title={`${entry.name}\n${formatDate(entry.modTime, i18n.language)}`}
                  >
                    <div style={{ ...styles.thumbBox, height: thumbHeight }}>
                      {thumbUri ? (
                        <img
                          src={thumbUri}
                          alt={entry.name}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            borderRadius: 4,
                          }}
                        />
                      ) : (
                        renderEntryIcon(entry, gridSize === 'small' ? 28 : 40)
                      )}
                    </div>
                    <span style={styles.gridCardTitle}>{entry.name}</span>
                    {entry.kind !== 'dir' && (
                      <span style={styles.gridCardMeta}>
                        {formatBytes(entry.size, i18n.language)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Modo Colunas (Miller Columns)
  return (
    <div style={styles.millerContainer}>
      {parentEntries.length > 0 && (
        <div style={styles.millerColumn}>
          <div style={styles.millerHeader}>..</div>
          <div style={styles.millerList}>
            {parentEntries
              .filter((e) => e.kind === 'dir')
              .map((entry) => {
                const isCurrent = entry.location.path === currentPath;
                return (
                  <div
                    key={entry.location.path}
                    onClick={() => navigateTo(entry.location.path)}
                    style={{
                      ...styles.millerRow,
                      backgroundColor: isCurrent ? 'var(--bg-selected)' : 'transparent',
                    }}
                  >
                    {renderEntryIcon(entry, 14)}
                    <span style={styles.itemName}>{entry.name}</span>
                    <span style={styles.chevron}>›</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Coluna da pasta atual */}
      <div style={styles.millerColumn}>
        <div style={styles.millerHeader}>{currentPath}</div>
        <div style={styles.millerList}>
          {sortedEntries.map((entry) => {
            const isSelected = selectedPaths.has(entry.location.path);
            return (
              <div
                key={entry.location.path}
                data-entry-path={entry.location.path}
                onClick={(e) =>
                  selectItem(entry.location.path, e.ctrlKey || e.metaKey, e.shiftKey)
                }
                onDoubleClick={() => handleOpen(entry)}
                style={{
                  ...styles.millerRow,
                  backgroundColor: isSelected ? 'var(--bg-selected)' : 'transparent',
                }}
              >
                {renderEntryIcon(entry, 14)}
                <span style={styles.itemName}>{entry.name}</span>
                {entry.kind === 'dir' && <span style={styles.chevron}>›</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Coluna da subpasta selecionada */}
      {selectedSingleEntry && selectedSingleEntry.kind === 'dir' && (
        <div style={styles.millerColumn}>
          <div style={styles.millerHeader}>{selectedSingleEntry.name}</div>
          <div style={styles.millerList}>
            {childEntries.length === 0 ? (
              <div style={styles.millerEmpty}>{t('status.empty')}</div>
            ) : (
              childEntries.map((sub) => (
                <div
                  key={sub.location.path}
                  onClick={() => {
                    if (sub.kind === 'dir') {
                      navigateTo(sub.location.path);
                    } else {
                      void openPath(sub.location.path);
                    }
                  }}
                  style={styles.millerRow}
                >
                  {renderEntryIcon(sub, 14)}
                  <span style={styles.itemName}>{sub.name}</span>
                  {sub.kind === 'dir' && <span style={styles.chevron}>›</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  scrollContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: 12,
    userSelect: 'none',
  },
  groupHeader: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-muted)',
    padding: '4px 6px',
    marginBottom: 6,
    borderBottom: '1px solid var(--border-subtle)',
  },
  compactListGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 4,
  },
  compactListItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  itemName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  gridCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    gap: 6,
  },
  thumbBox: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-base)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridCardTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  gridCardMeta: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  millerContainer: {
    flex: 1,
    display: 'flex',
    overflowX: 'auto',
    overflowY: 'hidden',
    height: '100%',
    userSelect: 'none',
  },
  millerColumn: {
    width: 260,
    minWidth: 220,
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  millerHeader: {
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  millerList: {
    flex: 1,
    overflowY: 'auto',
    padding: 4,
  },
  millerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  },
  chevron: {
    color: 'var(--text-muted)',
    fontSize: 14,
  },
  millerEmpty: {
    padding: 16,
    fontSize: 12,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
};

