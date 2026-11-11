import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Table2,
  LayoutList,
  LayoutGrid,
  Columns3,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  usePreviewStore,
  FOLDER_ZOOM_STEPS,
  resolveZoomStepIndex,
  FolderZoomStep,
} from './store';

export const FolderZoomControl: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    viewMode,
    density,
    gridSize,
    setViewMode,
    applyFolderZoomStep,
    zoomFolderIn,
    zoomFolderOut,
    resetFolderZoom,
  } = usePreviewStore();

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const stepIndex = resolveZoomStepIndex(viewMode, density, gridSize);
  const currentStep = FOLDER_ZOOM_STEPS[stepIndex] || FOLDER_ZOOM_STEPS[1];
  const isColumnsMode = viewMode === 'columns';

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const renderStepIcon = (step: FolderZoomStep) => {
    if (step.viewMode === 'details') return <Table2 size={13} />;
    if (step.viewMode === 'list') return <LayoutList size={13} />;
    return <LayoutGrid size={13} />;
  };

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <div style={styles.segmented}>
        <button
          type="button"
          style={stepIndex <= 0 && !isColumnsMode ? styles.segBtnDisabled : styles.segBtn}
          disabled={stepIndex <= 0 && !isColumnsMode}
          onClick={() => zoomFolderOut(true)}
          title={t('folderZoom.zoomOutTooltip')}
          aria-label={t('folderZoom.zoomOutTooltip')}
        >
          <ZoomOut size={12} />
        </button>

        <button
          type="button"
          style={{
            ...styles.centerBtn,
            ...(open ? { color: 'var(--accent)', backgroundColor: 'var(--bg-selected)' } : {}),
          }}
          onClick={() => setOpen((v) => !v)}
          title={t('folderZoom.buttonTooltip')}
          aria-label={t('folderZoom.buttonTooltip')}
          aria-expanded={open}
        >
          {isColumnsMode ? (
            <Columns3 size={12} style={{ color: 'var(--accent)' }} />
          ) : (
            renderStepIcon(currentStep)
          )}
          <span style={styles.pctText}>
            {isColumnsMode ? t('folderZoom.shortColumns') : `${currentStep.pct}%`}
          </span>
          <ChevronDown
            size={10}
            style={{
              opacity: 0.75,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </button>

        <button
          type="button"
          style={
            stepIndex >= FOLDER_ZOOM_STEPS.length - 1 ? styles.segBtnDisabled : styles.segBtn
          }
          disabled={stepIndex >= FOLDER_ZOOM_STEPS.length - 1}
          onClick={() => zoomFolderIn(true)}
          title={t('folderZoom.zoomInTooltip')}
          aria-label={t('folderZoom.zoomInTooltip')}
        >
          <ZoomIn size={12} />
        </button>
      </div>

      {open && (
        <div
          className="pulsares-dropdown-menu"
          style={styles.popover}
          role="dialog"
          data-folder-zoom-popover="true"
          aria-label={t('folderZoom.popoverTitle')}
        >
          <div style={styles.popHeader}>
            <span style={styles.popTitle}>{t('folderZoom.popoverTitle')}</span>
            <button
              type="button"
              style={styles.resetBtn}
              onClick={() => {
                resetFolderZoom(false);
              }}
              title={t('folderZoom.resetTooltip')}
            >
              <RotateCcw size={11} />
              <span>100%</span>
            </button>
          </div>

          <div style={styles.sliderRow}>
            <button
              type="button"
              style={styles.miniStepBtn}
              disabled={stepIndex <= 0 && !isColumnsMode}
              onClick={() => zoomFolderOut(false)}
              title={t('folderZoom.zoomOutTooltip')}
            >
              <ZoomOut size={13} />
            </button>
            <input
              type="range"
              min={0}
              max={FOLDER_ZOOM_STEPS.length - 1}
              step={1}
              value={stepIndex}
              onChange={(e) => applyFolderZoomStep(Number(e.target.value), false)}
              aria-label={t('folderZoom.popoverTitle')}
              style={styles.slider}
            />
            <button
              type="button"
              style={styles.miniStepBtn}
              disabled={stepIndex >= FOLDER_ZOOM_STEPS.length - 1}
              onClick={() => zoomFolderIn(false)}
              title={t('folderZoom.zoomInTooltip')}
            >
              <ZoomIn size={13} />
            </button>
          </div>

          <div style={styles.stepList}>
            {FOLDER_ZOOM_STEPS.map((step) => {
              const active = !isColumnsMode && stepIndex === step.index;
              return (
                <button
                  key={step.id}
                  type="button"
                  className="pulsares-dropdown-item"
                  style={{
                    ...styles.stepRow,
                    ...(active ? styles.stepRowActive : {}),
                  }}
                  onClick={() => {
                    applyFolderZoomStep(step.index, false);
                    setOpen(false);
                  }}
                >
                  <span style={styles.stepIcon}>{renderStepIcon(step)}</span>
                  <span style={styles.stepLabel}>{t(step.labelKey)}</span>
                  <span style={styles.stepPct}>{step.pct}%</span>
                  <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
                    {active && <Check size={12} style={{ color: 'var(--accent)' }} />}
                  </span>
                </button>
              );
            })}

            <div style={styles.divider} />

            <button
              type="button"
              className="pulsares-dropdown-item"
              style={{
                ...styles.stepRow,
                ...(isColumnsMode ? styles.stepRowActive : {}),
              }}
              onClick={() => {
                setViewMode('columns');
                setOpen(false);
              }}
            >
              <span style={styles.stepIcon}>
                <Columns3 size={13} />
              </span>
              <span style={styles.stepLabel}>{t('views.columns')}</span>
              <span style={styles.stepPct}>—</span>
              <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
                {isColumnsMode && <Check size={12} style={{ color: 'var(--accent)' }} />}
              </span>
            </button>
          </div>

          <div style={styles.shortcutHint}>{t('folderZoom.shortcutHint')}</div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
  segmented: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 26,
    borderRadius: 7,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-app)',
    overflow: 'hidden',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  },
  segBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'default',
    padding: 0,
  },
  segBtnDisabled: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    opacity: 0.4,
    cursor: 'default',
    padding: 0,
  },
  centerBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: '100%',
    padding: '0 6px',
    border: 'none',
    borderLeft: '1px solid var(--border-subtle)',
    borderRight: '1px solid var(--border-subtle)',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'default',
  },
  pctText: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    minWidth: 30,
    textAlign: 'center',
  },
  popover: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    width: 256,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.38)',
    padding: 10,
    zIndex: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    userSelect: 'none',
  },
  popHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottom: '1px solid var(--border-subtle)',
  },
  popTitle: {
    fontSize: 11.5,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  resetBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 7px',
    fontSize: 10.5,
    fontWeight: 600,
    borderRadius: 4,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-secondary)',
    cursor: 'default',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 0',
  },
  miniStepBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 5,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-secondary)',
    cursor: 'default',
    flexShrink: 0,
  },
  slider: {
    flex: 1,
    accentColor: 'var(--accent)',
    cursor: 'default',
  },
  stepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '5px 8px',
    borderRadius: 5,
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 11.5,
    textAlign: 'left',
    cursor: 'default',
  },
  stepRowActive: {
    backgroundColor: 'var(--bg-selected, rgba(59, 130, 246, 0.16))',
    color: 'var(--accent)',
    fontWeight: 600,
  },
  stepIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'inherit',
    opacity: 0.9,
  },
  stepLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stepPct: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10.5,
    color: 'var(--text-muted)',
  },
  divider: {
    height: 1,
    backgroundColor: 'var(--border-subtle)',
    margin: '3px 0',
  },
  shortcutHint: {
    fontSize: 10,
    color: 'var(--text-muted)',
    textAlign: 'center',
    paddingTop: 4,
    borderTop: '1px solid var(--border-subtle)',
  },
};
