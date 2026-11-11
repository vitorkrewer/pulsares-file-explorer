import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const POPOVER_WIDTH = 260;

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
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const stepIndex = resolveZoomStepIndex(viewMode, density, gridSize);
  const currentStep = FOLDER_ZOOM_STEPS[stepIndex] || FOLDER_ZOOM_STEPS[1];
  const isColumnsMode = viewMode === 'columns';

  const updatePopoverPosition = useCallback(() => {
    const el = wrapperRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const top = rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
    setPopoverPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
  }, [open, updatePopoverPosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };

    const handleScroll = (e: Event) => {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) {
        return;
      }
      updatePopoverPosition();
    };

    const handleResize = () => updatePopoverPosition();

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, updatePopoverPosition]);

  const renderStepIcon = (step: FolderZoomStep) => {
    if (step.viewMode === 'details') return <Table2 size={13} />;
    if (step.viewMode === 'list') return <LayoutList size={13} />;
    return <LayoutGrid size={13} />;
  };

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <div
        style={{
          ...styles.segmented,
          ...(open
            ? {
                borderColor: 'var(--accent)',
                boxShadow: '0 0 0 3px var(--ring-soft)',
              }
            : {}),
        }}
      >
        <button
          type="button"
          className="pulsares-zoom-seg-btn"
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
          className="pulsares-zoom-seg-btn"
          style={{
            ...styles.centerBtn,
            ...(open
              ? {
                  color: 'var(--accent)',
                  backgroundColor: 'var(--bg-selected)',
                }
              : {}),
          }}
          onClick={() => setOpen((v) => !v)}
          title={t('folderZoom.buttonTooltip')}
          aria-label={t('folderZoom.buttonTooltip')}
          aria-expanded={open}
          aria-haspopup="dialog"
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
          className="pulsares-zoom-seg-btn"
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

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            className="pulsares-dropdown-menu"
            style={{
              ...styles.popover,
              top: popoverPos.top,
              left: popoverPos.left,
            }}
            role="dialog"
            data-folder-zoom-popover="true"
            aria-label={t('folderZoom.popoverTitle')}
          >
            <div style={styles.popHeader}>
              <span style={styles.popTitle}>{t('folderZoom.popoverTitle')}</span>
              <button
                type="button"
                className="pulsares-dropdown-item"
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
                className="pulsares-zoom-seg-btn"
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
                className="pulsares-zoom-seg-btn"
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
          </div>,
          document.body
        )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
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
    width: 24,
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
    width: 24,
    height: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    opacity: 0.4,
    cursor: 'not-allowed',
    padding: 0,
  },
  centerBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: '100%',
    padding: '0 7px',
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
    position: 'fixed',
    width: POPOVER_WIDTH,
    backgroundColor: 'var(--bg-surface)',
    padding: 10,
    zIndex: 11000,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    userSelect: 'none',
  },
  popHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 5,
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
    padding: '2px 8px',
    fontSize: 10.5,
    fontWeight: 600,
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
    borderRadius: 6,
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
    paddingTop: 5,
    borderTop: '1px solid var(--border-subtle)',
  },
};
