import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Table2,
  LayoutList,
  LayoutGrid,
  Columns3,
  Minus,
  Plus,
} from 'lucide-react';
import { useBrowserStore } from './store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import {
  usePreviewStore,
  FOLDER_ZOOM_STEPS,
  resolveZoomStepIndex,
} from '../preview/store';
import { formatBytes } from '../../i18n/format';

export const StatusBar: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const { entries, selectedPaths, showHidden, currentPath, isLoading } = useBrowserStore();
  const { drives } = useFolderTreeStore();
  const {
    viewMode,
    density,
    gridSize,
    setViewMode,
    zoomFolderIn,
    zoomFolderOut,
    resetFolderZoom,
  } = usePreviewStore();

  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.attrs.hidden);
  const totalCount = visibleEntries.length;
  const selectedCount = selectedPaths.size;

  const activeDrive = drives.find((d) =>
    currentPath.toLowerCase().startsWith(d.path.toLowerCase())
  );

  const stepIndex = resolveZoomStepIndex(viewMode, density, gridSize);
  const currentStep = FOLDER_ZOOM_STEPS[stepIndex] || FOLDER_ZOOM_STEPS[1];

  return (
    <div style={styles.statusBar}>
      <div style={styles.section}>
        {isLoading ? (
          <span style={styles.loadingBadge}>
            <Loader2 size={12} className="spin-animation" style={{ color: 'var(--accent)' }} />
            <span>{t('status.loading')}</span>
          </span>
        ) : (
          <span>
            {totalCount === 1
              ? t('status.items', { count: totalCount })
              : t('status.items_plural', { count: totalCount })}
          </span>
        )}
        {selectedCount > 0 && (
          <>
            <span style={styles.divider}>•</span>
            <span>
              {selectedCount === 1
                ? t('status.selected', { count: selectedCount })
                : t('status.selected_plural', { count: selectedCount })}
            </span>
          </>
        )}
      </div>

      <div style={styles.rightSection}>
        {activeDrive && activeDrive.freeBytes !== undefined && activeDrive.freeBytes > 0 && (
          <>
            <span>
              {t('status.freeSpace', {
                free: formatBytes(activeDrive.freeBytes, i18n.language),
              })}
            </span>
            <span style={styles.divider}>•</span>
          </>
        )}

        {/* Alternadores rápidos de visualização estilo Explorer */}
        <div style={styles.viewIcons}>
          <button
            type="button"
            style={viewMode === 'details' ? styles.iconBtnActive : styles.iconBtn}
            onClick={() => setViewMode('details')}
            title={t('views.details')}
          >
            <Table2 size={12} />
          </button>
          <button
            type="button"
            style={viewMode === 'list' ? styles.iconBtnActive : styles.iconBtn}
            onClick={() => setViewMode('list')}
            title={t('views.list')}
          >
            <LayoutList size={12} />
          </button>
          <button
            type="button"
            style={viewMode === 'grid' ? styles.iconBtnActive : styles.iconBtn}
            onClick={() => setViewMode('grid')}
            title={t('views.grid')}
          >
            <LayoutGrid size={12} />
          </button>
          <button
            type="button"
            style={viewMode === 'columns' ? styles.iconBtnActive : styles.iconBtn}
            onClick={() => setViewMode('columns')}
            title={t('views.columns')}
          >
            <Columns3 size={12} />
          </button>
        </div>

        <span style={styles.divider}>•</span>

        {/* Controle rápido de Zoom nas Pastas (- 100% +) */}
        <div style={styles.zoomBar}>
          <button
            type="button"
            style={stepIndex <= 0 && viewMode !== 'columns' ? styles.zoomBtnDisabled : styles.zoomBtn}
            disabled={stepIndex <= 0 && viewMode !== 'columns'}
            onClick={() => zoomFolderOut(true)}
            title={t('folderZoom.zoomOutTooltip')}
          >
            <Minus size={11} />
          </button>
          <button
            type="button"
            style={styles.zoomPctBtn}
            onClick={() => resetFolderZoom(true)}
            title={t('folderZoom.resetTooltip')}
          >
            {currentStep.pct}%
          </button>
          <button
            type="button"
            style={
              stepIndex >= FOLDER_ZOOM_STEPS.length - 1 ? styles.zoomBtnDisabled : styles.zoomBtn
            }
            disabled={stepIndex >= FOLDER_ZOOM_STEPS.length - 1}
            onClick={() => zoomFolderIn(true)}
            title={t('folderZoom.zoomInTooltip')}
          >
            <Plus size={11} />
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  statusBar: {
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    backgroundColor: 'var(--bg-app)',
    borderTop: '1px solid var(--border-subtle)',
    fontSize: 11,
    color: 'var(--text-secondary)',
    userSelect: 'none',
  },
  section: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  viewIcons: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    border: 'none',
    borderRadius: 3,
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'default',
    padding: 0,
  },
  iconBtnActive: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    border: 'none',
    borderRadius: 3,
    backgroundColor: 'var(--bg-selected, rgba(59, 130, 246, 0.16))',
    color: 'var(--accent)',
    cursor: 'default',
    padding: 0,
  },
  zoomBar: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
  },
  zoomBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    border: 'none',
    borderRadius: 3,
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'default',
    padding: 0,
  },
  zoomBtnDisabled: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    border: 'none',
    borderRadius: 3,
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    opacity: 0.35,
    cursor: 'default',
    padding: 0,
  },
  zoomPctBtn: {
    border: 'none',
    borderRadius: 3,
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    padding: '0 4px',
    minWidth: 34,
    textAlign: 'center',
    cursor: 'default',
  },
  loadingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    color: 'var(--accent)',
    fontWeight: 500,
  },
  divider: {
    color: 'var(--border-strong)',
  },
};
