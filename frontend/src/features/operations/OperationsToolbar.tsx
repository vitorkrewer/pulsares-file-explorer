import React from 'react';
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
} from 'lucide-react';
import { useOperationsStore } from './store';
import { useBrowserStore, getTabLabel } from '../browser/store';
import { useDualPaneStore } from '../panes/store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { useTerminalStore } from '../terminal/store';

export const OperationsToolbar: React.FC = () => {
  const { t } = useTranslation('common');
  const { selectedPaths, currentPath } = useBrowserStore();
  const {
    clipboard,
    jobs,
    panelOpen,
    verifyHash,
    setPanelOpen,
    toggleVerifyHash,
    openPrompt,
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
        >
          <FolderPlus size={14} />
          <span>{t('nav.newFolder')}</span>
        </button>

        <button
          type="button"
          style={styles.btn}
          onClick={() => openPrompt('newFile')}
          title={t('ops.newFile')}
        >
          <FilePlus size={14} />
          <span>{t('ops.newFile')}</span>
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
        {/* Alternador do Terminal Integrado (Ctrl+`) */}
        <button
          type="button"
          style={terminalVisible ? { ...styles.btn, color: 'var(--accent)' } : styles.btn}
          onClick={() => void toggleTerminal(currentPath || '/')}
          title={t('terminal.togglePanel')}
        >
          <TerminalSquare size={14} />
          <span>{t('terminal.title')}</span>
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
        >
          <ListTodo size={14} />
          <span>{t('ops.queue')}</span>
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
    padding: '0 12px',
    backgroundColor: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none',
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    height: 26,
    padding: '0 8px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  disabledBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    height: 26,
    padding: '0 8px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-muted)',
    opacity: 0.4,
    cursor: 'not-allowed',
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
