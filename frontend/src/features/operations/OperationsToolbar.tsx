import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderPlus,
  FilePlus,
  Copy,
  Scissors,
  ClipboardPaste,
  Edit3,
  Trash2,
  Undo2,
  Redo2,
  ListTodo,
  ShieldCheck,
  Columns,
  Rows,
  Square,
  Star,
  ArrowRightLeft,
  TerminalSquare,
  LayoutList,
  LayoutGrid,
  Table2,
  Columns3,
  Eye,
  Minimize2,
  SlidersHorizontal,
  Search,
  Filter,
  Info,
  Command,
  FileCode2,
  Database,
  X,
} from 'lucide-react';
import { useOperationsStore } from './store';
import { useBrowserStore, getTabLabel } from '../browser/store';
import { useDualPaneStore } from '../panes/store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { useTerminalStore } from '../terminal/store';
import { usePreviewStore, GroupByOption, GridThumbSize } from '../preview/store';
import { useSearchStore } from '../search/store';
import { useProductivityStore } from '../productivity/store';
import { useEditorStore } from '../editor/store';
import { useDBStudioStore, isDatabaseFile } from '../db-studio/store';
import { openPath } from '../../lib/wails';

export const OperationsToolbar: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    selectedPaths,
    currentPath,
    filterQuery,
    setFilterQuery,
    stepSelection,
    navigateTo,
  } = useBrowserStore();
  const {
    clipboard,
    jobs,
    panelOpen,
    verifyHash,
    setPanelOpen,
    toggleVerifyHash,
    openPrompt,
    openProperties,
    copySelection,
    cutSelection,
    pasteIntoCurrent,
    trashSelection,
    requestRenameSelection,
    undo,
    redo,
  } = useOperationsStore();
  const {
    layoutMode,
    setLayoutMode,
    copyToOppositePane,
    moveToOppositePane,
  } = useDualPaneStore();
  const { favorites, toggleFavorite } = useFolderTreeStore();
  const { visible: terminalVisible, togglePanel: toggleTerminal } = useTerminalStore();
  const {
    viewMode,
    gridSize,
    groupBy,
    density,
    previewPanelOpen,
    setViewMode,
    setGridSize,
    setGroupBy,
    toggleDensity,
    togglePreviewPanel,
  } = usePreviewStore();
  const { drawerOpen: searchOpen, toggleDrawer: toggleSearch } = useSearchStore();
  const { paletteOpen, togglePalette } = useProductivityStore();
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [viewBarOpen, setViewBarOpen] = React.useState(false);

  useEffect(() => {
    const onFocusFilter = (evt: Event) => {
      const customEvt = evt as CustomEvent<{ appendChar?: string }>;
      const ch = customEvt.detail?.appendChar;
      if (ch) {
        const nextQuery = `${useBrowserStore.getState().filterQuery}${ch}`;
        setFilterQuery(nextQuery);
        requestAnimationFrame(() => {
          const inp = filterInputRef.current;
          if (inp) {
            inp.focus();
            inp.setSelectionRange(nextQuery.length, nextQuery.length);
          }
          // Seleciona automaticamente o primeiro item filtrado para navegação imediata
          const filtered = useBrowserStore.getState().entries;
          if (filtered.length > 0) {
            useBrowserStore.getState().selectItem(filtered[0].location.path, false, false);
          }
        });
      } else {
        filterInputRef.current?.focus();
        filterInputRef.current?.select();
      }
    };
    window.addEventListener('pulsares:focus-instant-filter', onFocusFilter);
    return () => window.removeEventListener('pulsares:focus-instant-filter', onFocusFilter);
  }, [setFilterQuery]);

  const hasSelection = selectedPaths.size > 0;
  const hasSingleSelection = selectedPaths.size === 1;
  const isCurrentFavorite = favorites.some((f) => f.path === currentPath);
  const activeJobsCount = jobs.filter(
    (j) => j.status === 'running' || j.status === 'planning' || j.status === 'conflict'
  ).length;

  return (
    <div style={styles.toolbar}>
      <div style={styles.group}>
        <button
          type="button"
          style={styles.btn}
          onClick={() => openPrompt('newFolder')}
          title={t('ops.newFolder')}
          aria-label={t('ops.newFolder')}
        >
          <FolderPlus size={14} />
        </button>

        <button
          type="button"
          style={styles.btn}
          onClick={() => openPrompt('newFile')}
          title={t('ops.newFile')}
          aria-label={t('ops.newFile')}
        >
          <FilePlus size={14} />
        </button>

        <button
          type="button"
          style={isCurrentFavorite ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={() => toggleFavorite(currentPath, getTabLabel(currentPath))}
          title={isCurrentFavorite ? t('sidebar.removeFavorite') : t('sidebar.addFavorite')}
        >
          <Star size={14} />
        </button>

        <span style={styles.divider} />

        <button
          type="button"
          style={hasSelection ? styles.btn : styles.disabledBtn}
          disabled={!hasSelection}
          onClick={copySelection}
          title={t('ops.copy')}
        >
          <Copy size={14} />
        </button>

        <button
          type="button"
          style={hasSelection ? styles.btn : styles.disabledBtn}
          disabled={!hasSelection}
          onClick={cutSelection}
          title={t('ops.cut')}
        >
          <Scissors size={14} />
        </button>

        <button
          type="button"
          style={clipboard ? styles.btn : styles.disabledBtn}
          disabled={!clipboard}
          onClick={pasteIntoCurrent}
          title={t('ops.paste')}
        >
          <ClipboardPaste size={14} />
        </button>

        <button
          type="button"
          style={hasSingleSelection ? styles.btn : styles.disabledBtn}
          disabled={!hasSingleSelection}
          onClick={requestRenameSelection}
          title={t('ops.rename')}
        >
          <Edit3 size={14} />
        </button>

        <button
          type="button"
          style={hasSelection ? styles.btn : styles.disabledBtn}
          disabled={!hasSelection}
          onClick={trashSelection}
          title={t('ops.trash')}
        >
          <Trash2 size={14} />
        </button>

        <span style={styles.divider} />

        <button type="button" style={styles.btn} onClick={undo} title={t('ops.undo')}>
          <Undo2 size={14} />
        </button>

        <button type="button" style={styles.btn} onClick={redo} title={t('ops.redo')}>
          <Redo2 size={14} />
        </button>

        <button
          type="button"
          style={styles.btn}
          onClick={() => void openProperties()}
          title={t('os.propertiesShortcut')}
          aria-label={t('os.propertiesShortcut')}
        >
          <Info size={14} />
        </button>

        <button
          type="button"
          style={styles.btn}
          onClick={() => {
            const firstSelected = Array.from(selectedPaths)[0];
            const entry = useBrowserStore
              .getState()
              .entries.find((e) => e.location.path === firstSelected);
            if (entry && entry.kind !== 'dir') {
              void useEditorStore.getState().openFileInEditor(entry.location.path);
            } else {
              useEditorStore.getState().openNewUntitledTab(currentPath, 'markdown');
            }
          }}
          title="Pulsares Studio Editor (Ctrl+E)"
          aria-label="Pulsares Studio Editor (Ctrl+E)"
        >
          <FileCode2 size={14} />
        </button>

        <button
          type="button"
          style={styles.btn}
          onClick={() => {
            const entries = useBrowserStore.getState().entries;
            const firstSelected = Array.from(selectedPaths)[0];
            const selectedEntry = entries.find((e) => e.location.path === firstSelected);
            if (selectedEntry && selectedEntry.kind !== 'dir' && isDatabaseFile(selectedEntry.name)) {
              void useDBStudioStore.getState().openDatabase(selectedEntry.location.path);
              return;
            }
            const firstDbInFolder = entries.find((e) => e.kind !== 'dir' && isDatabaseFile(e.name));
            if (firstDbInFolder) {
              void useDBStudioStore.getState().openDatabase(firstDbInFolder.location.path);
              return;
            }
            void useDBStudioStore.getState().openDatabase('', { forceInline: true });
          }}
          title="Pulsares DB Studio (Visualizador e Console SQLite)"
          aria-label="Pulsares DB Studio"
        >
          <Database size={14} />
        </button>

        {layoutMode !== 'single' && (
          <>
            <span style={styles.divider} />
            <button
              type="button"
              style={hasSelection ? styles.btn : styles.disabledBtn}
              disabled={!hasSelection}
              onClick={copyToOppositePane}
              title={t('panes.copyToOther')}
            >
              <ArrowRightLeft size={13} />
              <span>F5</span>
            </button>
            <button
              type="button"
              style={hasSelection ? styles.btn : styles.disabledBtn}
              disabled={!hasSelection}
              onClick={moveToOppositePane}
              title={t('panes.moveToOther')}
            >
              <ArrowRightLeft size={13} />
              <span>F6</span>
            </button>
          </>
        )}
      </div>

      <div style={styles.group}>
        {/* Filtro instantâneo na pasta atual (Ctrl+F) + Busca Recursiva (Ctrl+Shift+S) */}
        <div style={styles.filterBox}>
          <Filter size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={filterInputRef}
            type="text"
            value={filterQuery}
            onChange={(e) => {
              const val = e.target.value;
              setFilterQuery(val);
              requestAnimationFrame(() => {
                const filtered = useBrowserStore.getState().entries;
                if (val.trim() && filtered.length > 0) {
                  useBrowserStore.getState().selectItem(filtered[0].location.path, false, false);
                }
              });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilterQuery('');
                filterInputRef.current?.blur();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                stepSelection(1, e.shiftKey);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                stepSelection(-1, e.shiftKey);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const sel = Array.from(useBrowserStore.getState().selectedPaths)[0];
                const entry = useBrowserStore
                  .getState()
                  .entries.find((it) => it.location.path === sel);
                if (entry) {
                  filterInputRef.current?.blur();
                  if (entry.kind === 'dir') {
                    navigateTo(entry.location.path);
                  } else {
                    void openPath(entry.location.path);
                  }
                }
              }
            }}
            placeholder={t('search.instantFilterPlaceholder')}
            aria-label={t('search.instantFilterPlaceholder')}
            style={styles.filterInput}
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              style={styles.clearFilterBtn}
              title={t('ops.cancel')}
            >
              <X size={11} />
            </button>
          )}
        </div>

        <button
          type="button"
          style={searchOpen ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={toggleSearch}
          title={t('search.toggleAdvanced')}
        >
          <Search size={13} />
        </button>

        <button
          type="button"
          style={paletteOpen ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={togglePalette}
          title={t('productivity.paletteTitle')}
          aria-label={t('productivity.paletteTitle')}
        >
          <Command size={13} />
        </button>

        <span style={styles.divider} />

        {/* Alternador da Barra de Visualização (desativada por padrão na inicialização) */}
        <button
          type="button"
          style={viewBarOpen ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={() => setViewBarOpen((v) => !v)}
          title={t('views.toggleViewBar')}
          aria-label={t('views.toggleViewBar')}
        >
          <SlidersHorizontal size={13} />
        </button>

        {viewBarOpen && (
          <>
            {/* Modos de Visualização (0.6.0): Detalhes, Lista Compacta, Grade de Miniaturas, Colunas (Miller) */}
            <button
              type="button"
              style={viewMode === 'details' ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
              onClick={() => setViewMode('details')}
              title={t('views.details')}
            >
              <Table2 size={13} />
            </button>
            <button
              type="button"
              style={viewMode === 'list' ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
              onClick={() => setViewMode('list')}
              title={t('views.list')}
            >
              <LayoutList size={13} />
            </button>
            <button
              type="button"
              style={viewMode === 'grid' ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
              onClick={() => setViewMode('grid')}
              title={t('views.grid')}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              type="button"
              style={viewMode === 'columns' ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
              onClick={() => setViewMode('columns')}
              title={t('views.columns')}
            >
              <Columns3 size={13} />
            </button>

            {viewMode === 'grid' && (
              <select
                value={gridSize}
                onChange={(e) => setGridSize(e.target.value as GridThumbSize)}
                aria-label={t('views.gridSize')}
                title={t('views.gridSize')}
                style={styles.select}
              >
                <option value="small">{t('views.sizeSmall')}</option>
                <option value="medium">{t('views.sizeMedium')}</option>
                <option value="large">{t('views.sizeLarge')}</option>
              </select>
            )}

            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
              aria-label={t('views.groupBy')}
              title={t('views.groupBy')}
              style={styles.select}
            >
              <option value="none">{t('views.groupNone')}</option>
              <option value="type">{t('views.groupType')}</option>
              <option value="date">{t('views.groupDate')}</option>
              <option value="size">{t('views.groupSize')}</option>
            </select>

            <button
              type="button"
              style={density === 'compact' ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
              onClick={toggleDensity}
              title={t('views.toggleDensity')}
            >
              <Minimize2 size={13} />
            </button>
          </>
        )}

        <button
          type="button"
          style={previewPanelOpen ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={togglePreviewPanel}
          title={t('preview.togglePanel')}
        >
          <Eye size={14} />
        </button>

        <span style={styles.divider} />

        {/* Alternador do Terminal Integrado (Ctrl+`) */}
        <button
          type="button"
          style={terminalVisible ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={() => void toggleTerminal(currentPath || '/')}
          title={t('terminal.togglePanel')}
          aria-label={t('terminal.togglePanel')}
        >
          <TerminalSquare size={14} />
        </button>

        <span style={styles.divider} />

        {/* Alternadores de Layout (Painel Único / Duplo Horizontal / Duplo Vertical) */}
        <button
          type="button"
          style={layoutMode === 'single' ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={() => setLayoutMode('single')}
          title={t('panes.single')}
        >
          <Square size={13} />
        </button>
        <button
          type="button"
          style={layoutMode === 'split-h' ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={() => setLayoutMode('split-h')}
          title={t('panes.splitHorizontal')}
        >
          <Columns size={13} />
        </button>
        <button
          type="button"
          style={layoutMode === 'split-v' ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={() => setLayoutMode('split-v')}
          title={t('panes.splitVertical')}
        >
          <Rows size={13} />
        </button>

        <span style={styles.divider} />

        <button
          type="button"
          style={verifyHash ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={toggleVerifyHash}
          title={t('ops.verifyHash')}
        >
          <ShieldCheck size={14} />
        </button>

        <button
          type="button"
          style={panelOpen ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={() => setPanelOpen(!panelOpen)}
          title={t('ops.queue')}
          aria-label={t('ops.queue')}
        >
          <ListTodo size={14} />
          {activeJobsCount > 0 && <span style={styles.badge}>{activeJobsCount}</span>}
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 34,
    padding: '0 8px',
    gap: 6,
    backgroundColor: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  filterBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 24,
    padding: '0 6px',
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
    flexShrink: 0,
  },
  filterInput: {
    width: 110,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 11,
  },
  clearFilterBtn: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 26,
    padding: '0 6px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  disabledBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 26,
    padding: '0 6px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-muted)',
    opacity: 0.4,
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  select: {
    height: 24,
    fontSize: 11,
    padding: '0 6px',
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-secondary)',
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: 'var(--border-subtle)',
    margin: '0 4px',
  },
  badge: {
    backgroundColor: 'var(--accent)',
    color: '#fff',
    borderRadius: 10,
    padding: '1px 6px',
    fontSize: 10,
    fontWeight: 600,
  },
};
