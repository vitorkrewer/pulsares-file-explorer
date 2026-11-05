import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, X, AlertTriangle } from 'lucide-react';
import { useOperationsStore } from './store';
import { formatBytes, formatDateTime } from '../../i18n/format';
import { ConflictPolicy } from '../../lib/wails';

export const OperationsPanel: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const {
    jobs,
    panelOpen,
    setPanelOpen,
    promptKind,
    promptInitialValue,
    closePrompt,
    submitPrompt,
    pause,
    resume,
    cancel,
    resolveConflict,
  } = useOperationsStore();

  const [inputVal, setInputVal] = useState('');
  const [applyToAll, setApplyToAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (promptKind) {
      setInputVal(promptInitialValue);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const dotIdx = promptInitialValue.lastIndexOf('.');
          if (promptKind === 'rename' && dotIdx > 0) {
            inputRef.current.setSelectionRange(0, dotIdx);
          } else {
            inputRef.current.select();
          }
        }
      }, 20);
    }
  }, [promptKind, promptInitialValue]);

  const conflictJob = jobs.find((j) => j.status === 'conflict' && j.conflict);

  const handleResolve = (policy: ConflictPolicy) => {
    if (!conflictJob) return;
    resolveConflict(conflictJob.id, policy, applyToAll);
    setApplyToAll(false);
  };

  return (
    <>
      {/* Modal de Prompt (Nova Pasta / Novo Arquivo / Renomear / Exclusão Permanente) */}
      {promptKind && (
        <div style={styles.backdrop} onClick={closePrompt}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              {promptKind === 'newFolder' && t('ops.newFolder')}
              {promptKind === 'newFile' && t('ops.newFile')}
              {promptKind === 'rename' && t('ops.rename')}
              {promptKind === 'confirmPermanentDelete' && t('ops.deletePermanent')}
            </div>

            {promptKind === 'confirmPermanentDelete' ? (
              <p style={styles.confirmText}>{t('ops.confirmPermanentDelete')}</p>
            ) : (
              <input
                ref={inputRef}
                type="text"
                style={styles.input}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={t('ops.namePlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitPrompt(inputVal);
                  } else if (e.key === 'Escape') {
                    closePrompt();
                  }
                }}
              />
            )}

            <div style={styles.modalActions}>
              <button type="button" style={styles.secondaryBtn} onClick={closePrompt}>
                {t('ops.cancel')}
              </button>
              <button
                type="button"
                style={styles.primaryBtn}
                onClick={() => submitPrompt(inputVal)}
              >
                {t('ops.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rico de Conflito */}
      {conflictJob && conflictJob.conflict && (
        <div style={styles.backdrop}>
          <div style={{ ...styles.modal, width: 460 }}>
            <div style={styles.modalHeader}>
              <AlertTriangle size={16} style={{ color: '#f59e0b', marginRight: 6 }} />
              {t('ops.conflictTitle')}
            </div>

            <div style={styles.conflictBox}>
              <div style={styles.conflictRow}>
                <strong>{t('ops.conflictSource')}:</strong>
                <div style={styles.conflictPath}>{conflictJob.conflict.srcPath}</div>
                <div style={styles.conflictMeta}>
                  {formatBytes(conflictJob.conflict.srcSize, i18n.language)} •{' '}
                  {formatDateTime(conflictJob.conflict.srcModTime, i18n.language)}
                </div>
              </div>
              <div style={styles.conflictRow}>
                <strong>{t('ops.conflictDest')}:</strong>
                <div style={styles.conflictPath}>{conflictJob.conflict.dstPath}</div>
                <div style={styles.conflictMeta}>
                  {formatBytes(conflictJob.conflict.dstSize, i18n.language)} •{' '}
                  {formatDateTime(conflictJob.conflict.dstModTime, i18n.language)}
                </div>
              </div>
            </div>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
              />
              <span>{t('ops.applyToAll')}</span>
            </label>

            <div style={styles.conflictButtons}>
              <button
                type="button"
                style={styles.primaryBtn}
                onClick={() => handleResolve('overwrite')}
              >
                {t('ops.policyOverwrite')}
              </button>
              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() => handleResolve('rename')}
              >
                {t('ops.policyRename')}
              </button>
              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() => handleResolve('keepNewer')}
              >
                {t('ops.policyKeepNewer')}
              </button>
              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() => handleResolve('skip')}
              >
                {t('ops.policySkip')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel Flutuante da Fila de Jobs */}
      {panelOpen && (
        <div style={styles.drawer}>
          <div style={styles.drawerHeader}>
            <span style={styles.drawerTitle}>{t('ops.queue')}</span>
            <button
              type="button"
              style={styles.iconBtn}
              onClick={() => setPanelOpen(false)}
              title={t('ops.cancel')}
            >
              <X size={14} />
            </button>
          </div>

          <div style={styles.jobList}>
            {jobs.length === 0 ? (
              <div style={styles.emptyText}>{t('ops.noJobs')}</div>
            ) : (
              jobs.map((job) => {
                const pct =
                  job.totalBytes > 0
                    ? Math.min(100, Math.round((job.doneBytes / job.totalBytes) * 100))
                    : job.totalItems > 0
                      ? Math.min(100, Math.round((job.doneItems / job.totalItems) * 100))
                      : 0;

                return (
                  <div key={job.id} style={styles.jobCard}>
                    <div style={styles.jobTop}>
                      <span style={styles.jobKind}>{job.kind.toUpperCase()}</span>
                      <span style={styles.jobStatus}>{t(`ops.status.${job.status}`)}</span>
                      <div style={styles.jobControls}>
                        {job.status === 'running' && (
                          <button
                            type="button"
                            style={styles.iconBtn}
                            onClick={() => pause(job.id)}
                            title={t('ops.pause')}
                          >
                            <Pause size={12} />
                          </button>
                        )}
                        {job.status === 'paused' && (
                          <button
                            type="button"
                            style={styles.iconBtn}
                            onClick={() => resume(job.id)}
                            title={t('ops.resume')}
                          >
                            <Play size={12} />
                          </button>
                        )}
                        {(job.status === 'running' ||
                          job.status === 'paused' ||
                          job.status === 'planning' ||
                          job.status === 'conflict') && (
                          <button
                            type="button"
                            style={styles.iconBtn}
                            onClick={() => cancel(job.id)}
                            title={t('ops.cancel')}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {job.currentItem && (
                      <div style={styles.jobItem} title={job.currentItem}>
                        {job.currentItem}
                      </div>
                    )}

                    <div style={styles.progressTrack}>
                      <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                    </div>

                    <div style={styles.jobMeta}>
                      <span>
                        {job.doneItems}/{job.totalItems} •{' '}
                        {formatBytes(job.doneBytes, i18n.language)} /{' '}
                        {formatBytes(job.totalBytes, i18n.language)}
                      </span>
                      {job.status === 'running' && job.speedBps > 0 && (
                        <span>
                          {formatBytes(job.speedBps, i18n.language)}/s • ETA {job.etaSeconds}s
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    width: 360,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  confirmText: {
    fontSize: 12,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
    margin: 0,
  },
  input: {
    width: '100%',
    height: 32,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    fontSize: 13,
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  primaryBtn: {
    padding: '6px 12px',
    borderRadius: 5,
    backgroundColor: 'var(--accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '6px 12px',
    borderRadius: 5,
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    fontSize: 12,
    cursor: 'pointer',
  },
  conflictBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    borderRadius: 6,
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-subtle)',
    fontSize: 12,
  },
  conflictRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  conflictPath: {
    color: 'var(--text-primary)',
    wordBreak: 'break-all',
  },
  conflictMeta: {
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
  conflictButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  drawer: {
    position: 'fixed',
    right: 16,
    bottom: 34,
    width: 340,
    maxHeight: 320,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    zIndex: 1500,
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  drawerTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  jobList: {
    padding: 10,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: '16px 0',
  },
  jobCard: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  jobTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
  },
  jobKind: {
    fontWeight: 700,
    color: 'var(--accent)',
  },
  jobStatus: {
    color: 'var(--text-secondary)',
  },
  jobControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  jobItem: {
    fontSize: 11,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'var(--border-subtle)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'var(--accent)',
    transition: 'width 0.15s ease',
  },
  jobMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: 'var(--text-secondary)',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 4,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
};
