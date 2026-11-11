import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  X,
  Database,
  Trash2,
  Play,
  Square,
  BookmarkPlus,
  Bookmark,
  Copy,
  FileCode2,
  Edit3,
  CheckSquare,
} from 'lucide-react';
import { FileTypeIcon } from '../../ui/FileTypeIcon';
import { SoftSelect } from '../../ui/SoftSelect';
import { useSearchStore } from './store';
import { useBrowserStore } from '../browser/store';
import { useOperationsStore } from '../operations/store';
import { useProductivityStore } from '../productivity/store';
import { useEditorStore } from '../editor/store';
import {
  subscribeEvent,
  SearchBatchEvent,
  SearchDoneEvent,
  openPath,
} from '../../lib/wails';
import { formatBytes, formatDate } from '../../i18n/format';

const QUICK_TYPE_PRESETS: Array<{ label: string; ext: string; kind?: string }> = [
  { label: 'Todos', ext: '', kind: '' },
  { label: 'Código', ext: 'ts,tsx,js,jsx,go,py,rs,java,c,cpp,cs,html,css,sql', kind: 'file' },
  { label: 'Documentos', ext: 'md,txt,pdf,doc,docx,odt,csv,xls,xlsx,ods,ppt,pptx,ppsx,potx,odp,otp,fodp', kind: 'file' },
  { label: 'Configs', ext: 'json,yaml,yml,toml,env,ini,xml', kind: 'file' },
  { label: 'Imagens', ext: 'png,jpg,jpeg,webp,svg,gif,bmp', kind: 'file' },
  { label: 'Mídia', ext: 'mp4,webm,mov,mp3,wav,flac', kind: 'file' },
  { label: 'Compactados', ext: 'zip,tar,gz,7z,rar', kind: 'file' },
  { label: 'Pastas', ext: '', kind: 'dir' },
];

function renderHighlightedSnippet(snippet: string, term: string): React.ReactNode {
  const cleanTerm = term.trim();
  if (!cleanTerm) return snippet;
  const lowerSnippet = snippet.toLowerCase();
  const lowerTerm = cleanTerm.toLowerCase();
  const idx = lowerSnippet.indexOf(lowerTerm);
  if (idx < 0) return snippet;
  const before = snippet.slice(0, idx);
  const match = snippet.slice(idx, idx + cleanTerm.length);
  const after = snippet.slice(idx + cleanTerm.length);
  return (
    <>
      {before}
      <mark
        style={{
          backgroundColor: 'rgba(245, 158, 11, 0.28)',
          color: 'var(--text-primary)',
          padding: '0 3px',
          borderRadius: 3,
          fontWeight: 700,
        }}
      >
        {match}
      </mark>
      {after}
    </>
  );
}

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
    selectedResultPaths,
    savedSearches,
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
    selectResultItem,
    selectAllResults,
    clearResultSelection,
    loadSavedSearches,
    saveCurrentSearchPreset,
    applySavedSearchPreset,
    removeSavedSearchPreset,
    runSearch,
    stopSearch,
    appendBatch,
    finishSearch,
    refreshIndexedRoots,
    indexCurrentRoot,
    deleteIndexedRoot,
  } = useSearchStore();

  const [presetNameInput, setPresetNameInput] = useState('');
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);

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
      void loadSavedSearches();
    }
  }, [drawerOpen, refreshIndexedRoots, loadSavedSearches]);

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

            <SoftSelect
              size="sm"
              minMenuWidth={150}
              value={kindFilter}
              onChange={setKindFilter}
              ariaLabel={t('search.kindAll')}
              style={{ height: 28, fontSize: 12, backgroundColor: 'var(--bg-surface)' }}
              options={[
                { value: '', label: t('search.kindAll') },
                { value: 'file', label: t('search.kindFiles') },
                { value: 'dir', label: t('search.kindFolders') },
              ]}
            />

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                Filtros Rápidos:
              </span>
              {QUICK_TYPE_PRESETS.map((preset) => {
                const isActive =
                  extensionsText === preset.ext &&
                  (preset.kind === undefined || kindFilter === preset.kind);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setExtensionsText(preset.ext);
                      if (preset.kind !== undefined) setKindFilter(preset.kind);
                      setTimeout(() => {
                        void useSearchStore.getState().runSearch(currentPath || '/', showHidden);
                      }, 10);
                    }}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      cursor: 'default',
                      border: isActive
                        ? '1px solid var(--accent-primary)'
                        : '1px solid var(--border-subtle)',
                      backgroundColor: isActive ? 'var(--bg-selected)' : 'var(--bg-surface)',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
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
              {showSavePresetInput ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="text"
                    value={presetNameInput}
                    autoFocus
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    placeholder="Nome da busca..."
                    style={{ ...styles.input, width: 130, height: 26 }}
                  />
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={() => {
                      if (presetNameInput.trim()) {
                        void saveCurrentSearchPreset(presetNameInput.trim());
                        setPresetNameInput('');
                        setShowSavePresetInput(false);
                      }
                    }}
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => setShowSavePresetInput(true)}
                  title="Salvar combinação atual de filtros"
                >
                  <BookmarkPlus size={12} />
                  <span>Salvar Filtro</span>
                </button>
              )}

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

        {/* Buscas salvas pelo usuário */}
        {savedSearches.length > 0 && (
          <div style={styles.indexBar}>
            <Bookmark size={12} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
              Buscas Salvas:
            </span>
            {savedSearches.map((sv) => (
              <span
                key={sv.id}
                style={{ ...styles.indexChip, cursor: 'default' }}
                onClick={() => {
                  applySavedSearchPreset(sv);
                  setTimeout(() => {
                    void useSearchStore.getState().runSearch(currentPath || '/', showHidden);
                  }, 20);
                }}
              >
                <span>{sv.name}</span>
                <button
                  type="button"
                  style={styles.chipDelBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeSavedSearchPreset(sv.id);
                  }}
                  title="Remover busca salva"
                >
                  <Trash2 size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

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

        {/* Barra de ações em lote sobre múltiplos resultados selecionados (Shift+Clique / Ctrl+Clique) */}
        {results.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 14px',
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-subtle)',
              fontSize: 11,
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() =>
                  selectedResultPaths.size === results.length
                    ? clearResultSelection()
                    : selectAllResults()
                }
              >
                <CheckSquare size={12} />
                <span>
                  {selectedResultPaths.size === results.length
                    ? 'Desmarcar Todos'
                    : 'Selecionar Todos'}
                </span>
              </button>
              <span style={{ color: 'var(--text-muted)' }}>
                {selectedResultPaths.size > 0
                  ? `${selectedResultPaths.size} selecionado(s) (use Shift+Clique para intervalo sequencial)`
                  : 'Dica: Clique e segure Shift para selecionar vários resultados sequencialmente'}
              </span>
            </div>

            {selectedResultPaths.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => {
                    const paths = Array.from(selectedResultPaths);
                    for (const p of paths) {
                      void useEditorStore.getState().openFileInEditor(p);
                    }
                    setDrawerOpen(false);
                  }}
                >
                  <FileCode2 size={12} />
                  <span>Abrir no Studio ({selectedResultPaths.size})</span>
                </button>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => {
                    const paths = Array.from(selectedResultPaths);
                    setDrawerOpen(false);
                    void useProductivityStore.getState().openBatchRename(paths);
                  }}
                >
                  <Edit3 size={12} />
                  <span>Renomear em Lote</span>
                </button>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => {
                    const paths = Array.from(selectedResultPaths);
                    useOperationsStore.setState({
                      clipboard: { paths, mode: 'copy' },
                    });
                  }}
                >
                  <Copy size={12} />
                  <span>Copiar Seleção</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Lista de resultados em streaming */}
        <div style={styles.resultsArea}>
          {error && <div style={styles.errorBox}>{error}</div>}
          {results.length === 0 && !isSearching ? (
            <div style={styles.emptyBox}>{t('search.noResults')}</div>
          ) : (
            results.map((r) => {
              const isSelected = selectedResultPaths.has(r.path);
              return (
                <div
                  key={r.path}
                  onClick={(e) =>
                    selectResultItem(r.path, e.ctrlKey || e.metaKey, e.shiftKey)
                  }
                  style={{
                    ...styles.resultRow,
                    backgroundColor: isSelected ? 'var(--bg-selected)' : 'transparent',
                    borderLeft: isSelected
                      ? '3px solid var(--accent-primary)'
                      : '3px solid transparent',
                  }}
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
                    <FileTypeIcon name={r.name} kind={r.kind} size={15} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.resultName}>{r.name}</div>
                      <div style={styles.resultPath}>{r.relPath}</div>
                      {r.snippet && (
                        <div style={styles.snippetBox}>
                          <span
                            style={{
                              display: 'inline-block',
                              marginRight: 6,
                              padding: '0 4px',
                              borderRadius: 3,
                              backgroundColor: 'var(--bg-elevated)',
                              color: 'var(--text-secondary)',
                              fontWeight: 700,
                              fontSize: 10,
                            }}
                          >
                            L{r.lineNumber}
                          </span>
                          <span>{renderHighlightedSnippet(r.snippet, contentQuery)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={styles.resultRight}>
                    {r.kind !== 'dir' && (
                      <span style={styles.metaText}>{formatBytes(r.size, i18n.language)}</span>
                    )}
                    <span style={styles.metaText}>{formatDate(r.modTime, i18n.language)}</span>
                    {r.kind !== 'dir' && (
                      <button
                        type="button"
                        style={styles.smallBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          void useEditorStore.getState().openFileInEditor(r.path);
                          setDrawerOpen(false);
                        }}
                      >
                        Studio
                      </button>
                    )}
                    <button
                      type="button"
                      style={styles.smallBtn}
                      onClick={(e) => {
                        e.stopPropagation();
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
              );
            })
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
    cursor: 'default',
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
    cursor: 'default',
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
    cursor: 'default',
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
    cursor: 'default',
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
    cursor: 'default',
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
    cursor: 'default',
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
    cursor: 'default',
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
    cursor: 'default',
    color: 'var(--text-secondary)',
  },
};

