import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Folder, File, Database, Trash2, Play, Square } from 'lucide-react';
import { useSearchStore } from './store';
import { useBrowserStore } from '../browser/store';
import {
  subscribeEvent,
  SearchBatchEvent,
  SearchDoneEvent,
  openPath,
} from '../../lib/wails';
import { formatBytes, formatDate } from '../../i18n/format';

export const SearchDrawer: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const { currentPath, showHidden, navigateTo, newTab } = useBrowserStore();
  const {
    drawerOpen,
    query,
    useRegex,
    extensionsText,
    kindFilter,
    minSizeKB,
    maxSizeKB,
    modifiedAfter,
    modifiedBefore,
    contentQuery,
    useIndex,
    isSearching,
    results,
    error,
    indexedRoots,
    indexingRoot,
    setDrawerOpen,
    setQuery,
    setUseRegex,
    setExtensionsText,
    setKindFilter,
    setMinSizeKB,
    setMaxSizeKB,
    setModifiedAfter,
    setModifiedBefore,
    setContentQuery,
    setUseIndex,
    resetFilters,
    runSearch,
    stopSearch,
    appendBatch,
    finishSearch,
    refreshIndexedRoots,
    indexCurrentRoot,
    deleteIndexedRoot,
  } = useSearchStore();

  useEffect(() => {
    const unsubBatch = subscribeEvent<SearchBatchEvent>('search:batch', (ev) => {
      appendBatch(ev.requestId, ev.results);
    });
    const unsubDone = subscribeEvent<SearchDoneEvent>('search:done', (ev) => {
      finishSearch(ev.requestId, ev.error);
    });
    return () => {
      unsubBatch();
      unsubDone();
    };
  }, [appendBatch, finishSearch]);

  useEffect(() => {
    if (drawerOpen) {
      void refreshIndexedRoots();
    }
  }, [drawerOpen, refreshIndexedRoots]);

  if (!drawerOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(currentPath || '/', showHidden);
  };

  const openParentFolder = (fullPath: string) => {
    const norm = fullPath.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    if (idx > 0) {
      const parent = fullPath.slice(0, idx) || '/';
      navigateTo(parent);
    }
  };

  return (
    <div style={styles.backdrop} onClick={() => setDrawerOpen(false)}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Cabeçalho */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={15} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: 13 }}>{t('search.title')}</strong>
            <span style={styles.rootBadge}>{currentPath}</span>
          </div>
          <button
            type="button"
            style={styles.iconBtn}
            onClick={() => setDrawerOpen(false)}
            title={t('ops.cancel')}
          >
            <X size={15} />
          </button>
        </div>

        {/* Formulário de filtros */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.row}>
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.queryPlaceholder')}
              style={{ ...styles.input, flex: 2 }}
            />
            <input
              type="text"
              value={contentQuery}
              onChange={(e) => setContentQuery(e.target.value)}
              placeholder={t('search.contentPlaceholder')}
              style={{ ...styles.input, flex: 2 }}
            />
            {isSearching ? (
              <button
                type="button"
                style={styles.stopBtn}
                onClick={() => void stopSearch()}
              >
                <Square size={12} />
                <span>{t('ops.cancel')}</span>
              </button>
            ) : (
              <button type="submit" style={styles.primaryBtn}>
                <Play size={12} />
                <span>{t('search.start')}</span>
              </button>
            )}
          </div>

          <div style={styles.row}>
            <input
              type="text"
              value={extensionsText}
              onChange={(e) => setExtensionsText(e.target.value)}
              placeholder={t('search.extensionsPlaceholder')}
              style={{ ...styles.input, flex: 1 }}
            />

            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              aria-label={t('search.kindAll')}
              style={styles.select}
            >
              <option value="">{t('search.kindAll')}</option>
              <option value="file">{t('search.kindFiles')}</option>
              <option value="dir">{t('search.kindFolders')}</option>
            </select>

            <input
              type="number"
              min="0"
              value={minSizeKB}
              onChange={(e) => setMinSizeKB(e.target.value)}
              placeholder={t('search.minSizeKB')}
              style={{ ...styles.input, width: 110 }}
            />
            <input
              type="number"
              min="0"
              value={maxSizeKB}
              onChange={(e) => setMaxSizeKB(e.target.value)}
              placeholder={t('search.maxSizeKB')}
              style={{ ...styles.input, width: 110 }}
            />

            <input
              type="date"
              value={modifiedAfter}
              onChange={(e) => setModifiedAfter(e.target.value)}
              title={t('search.modifiedAfter')}
              style={styles.dateInput}
            />
            <input
              type="date"
              value={modifiedBefore}
              onChange={(e) => setModifiedBefore(e.target.value)}
              title={t('search.modifiedBefore')}
              style={styles.dateInput}
            />
          </div>

          <div style={{ ...styles.row, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(e) => setUseRegex(e.target.checked)}
                />
                <span>{t('search.useRegex')}</span>
              </label>

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={useIndex}
                  onChange={(e) => setUseIndex(e.target.checked)}
                />
                <span>{t('search.useIndex')}</span>
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                style={styles.secondaryBtn}
                disabled={indexingRoot}
                onClick={() => void indexCurrentRoot(currentPath)}
              >
                <Database size={12} />
                <span>
                  {indexingRoot ? t('tree.loading') : t('search.indexCurrentFolder')}
                </span>
              </button>
              <button type="button" style={styles.secondaryBtn} onClick={resetFilters}>
                {t('search.clearFilters')}
              </button>
            </div>
          </div>
        </form>

        {/* Raízes indexadas */}
        {indexedRoots.length > 0 && (
          <div style={styles.indexBar}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {t('search.indexedFolders')}:
            </span>
            {indexedRoots.map((ir) => (
              <span key={ir.rootPath} style={styles.indexChip}>
                <span>
                  {ir.rootPath} ({ir.itemCount})
                </span>
                <button
                  type="button"
                  style={styles.chipDelBtn}
                  onClick={() => void deleteIndexedRoot(ir.rootPath)}
                  title={t('ops.deletePermanent')}
                >
                  <Trash2 size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Lista de resultados em streaming */}
        <div style={styles.resultsArea}>
          {error && <div style={styles.errorBox}>{error}</div>}
          {results.length === 0 && !isSearching ? (
            <div style={styles.emptyBox}>{t('search.noResults')}</div>
          ) : (
            results.map((r) => (
              <div
                key={r.path}
                style={styles.resultRow}
                onDoubleClick={() => {
                  if (r.kind === 'dir') {
                    navigateTo(r.path);
                    setDrawerOpen(false);
                  } else {
                    void openPath(r.path);
                  }
                }}
              >
                <div style={styles.resultMain}>
                  {r.kind === 'dir' ? (
                    <Folder size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  ) : (
                    <File size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={styles.resultName}>{r.name}</div>
                    <div style={styles.resultPath}>{r.relPath}</div>
                    {r.snippet && (
                      <div style={styles.snippetBox}>
                        L{r.lineNumber}: {r.snippet}
                      </div>
                    )}
                  </div>
                </div>
                <div style={styles.resultRight}>
                  {r.kind !== 'dir' && (
                    <span style={styles.metaText}>{formatBytes(r.size, i18n.language)}</span>
                  )}
                  <span style={styles.metaText}>{formatDate(r.modTime, i18n.language)}</span>
                  <button
                    type="button"
                    style={styles.smallBtn}
                    onClick={() => {
                      if (r.kind === 'dir') {
                        newTab(r.path);
                      } else {
                        openParentFolder(r.path);
                      }
                      setDrawerOpen(false);
                    }}
                  >
                    {t('search.revealInExplorer')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={styles.footer}>
          <span>
            {t('search.resultsCount', { count: results.length })}
            {isSearching ? ` · ${t('tree.loading')}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 280,
  },
  modal: {
    width: '82vw',
    maxWidth: 940,
    height: '80vh',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.45)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  rootBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-secondary)',
  },
  form: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    backgroundColor: 'var(--bg-base)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  input: {
    height: 28,
    padding: '0 8px',
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontSize: 12,
  },
  select: {
    height: 28,
    padding: '0 8px',
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontSize: 12,
  },
  dateInput: {
    height: 28,
    padding: '0 6px',
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-secondary)',
    fontSize: 11,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 28,
    padding: '0 14px',
    borderRadius: 4,
    backgroundColor: 'var(--accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  stopBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 28,
    padding: '0 14px',
    borderRadius: 4,
    backgroundColor: 'var(--danger)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    height: 26,
    padding: '0 10px',
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontSize: 11,
    cursor: 'pointer',
  },
  indexBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderBottom: '1px solid var(--border-subtle)',
    flexWrap: 'wrap',
  },
  indexChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    borderRadius: 12,
    backgroundColor: 'var(--bg-elevated)',
    fontSize: 11,
    color: 'var(--text-primary)',
  },
  chipDelBtn: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  resultsArea: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    borderRadius: 5,
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    gap: 12,
  },
  resultMain: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  resultName: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  resultPath: {
    fontSize: 11,
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  snippetBox: {
    marginTop: 3,
    padding: '2px 6px',
    borderRadius: 3,
    backgroundColor: 'var(--bg-base)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--accent)',
  },
  resultRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  metaText: {
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  smallBtn: {
    padding: '3px 8px',
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-elevated)',
    fontSize: 11,
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  emptyBox: {
    padding: 36,
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  errorBox: {
    padding: 10,
    color: 'var(--danger)',
    fontSize: 12,
  },
  footer: {
    padding: '6px 14px',
    borderTop: '1px solid var(--border-subtle)',
    fontSize: 11,
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-base)',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },
};

