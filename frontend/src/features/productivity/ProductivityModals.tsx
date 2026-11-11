import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Command,
  Edit3,
  FolderGit2,
  Hash,
  Keyboard,
  Archive,
  Server,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Lock,
  TerminalSquare,
  Plug,
  Unplug,
  FolderOpen,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useProductivityStore } from './store';
import { useBrowserStore } from '../browser/store';
import { useOperationsStore } from '../operations/store';
import { useDualPaneStore } from '../panes/store';
import { useTerminalStore } from '../terminal/store';
import { useSearchStore } from '../search/store';
import { useClipboardHistoryStore } from '../clipboard/store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { usePreviewStore } from '../preview/store';
import { formatBytes } from '../../i18n/format';

export const ProductivityModals: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const {
    paletteOpen,
    closePalette,
    batchRenameOpen,
    batchOptions,
    batchPreview,
    batchError,
    openBatchRename,
    closeBatchRename,
    updateBatchOptions,
    applyBatchRename,
    compareOpen,
    compareLeftDir,
    compareRightDir,
    compareResults,
    compareLoading,
    openCompare,
    closeCompare,
    setCompareDirs,
    runCompare,
    hashOpen,
    hashLoading,
    hashData,
    expectedHash,
    openHashModal,
    closeHashModal,
    setExpectedHash,
    shortcutsOpen,
    shortcuts,
    openShortcutsModal,
    closeShortcutsModal,
    updateShortcut,
    resetShortcuts,
    assignTagToSelection,
    clearTagFromSelection,
    archiveOpen,
    archivePath,
    archiveEntries,
    archiveLoading,
    openArchiveModal,
    closeArchiveModal,
    compressSelection,
    extractCurrentArchive,
    remoteOpen,
    remoteProfiles,
    activeSftpIds,
    localSshKeys,
    sftpConnecting,
    sftpError,
    sftpTrustPrompt,
    openRemoteModal,
    closeRemoteModal,
    addRemoteProfile,
    removeRemoteProfile,
    connectSFTP,
    confirmSftpTrustAndConnect,
    cancelSftpTrustPrompt,
    disconnectSFTP,
    openSshTerminalSession,
  } = useProductivityStore();

  const [archiveNameInput, setArchiveNameInput] = useState('arquivo');
  const [archiveFormat, setArchiveFormat] = useState<'zip' | 'tar.gz'>('zip');
  const [remoteName, setRemoteName] = useState('');
  const [remoteProtocol, setRemoteProtocol] = useState<'sftp' | 'webdav'>('sftp');
  const [remoteHost, setRemoteHost] = useState('');
  const [remotePort, setRemotePort] = useState(22);
  const [remoteUser, setRemoteUser] = useState('');
  const [remotePath, setRemotePath] = useState('/');
  const [remoteAuthType, setRemoteAuthType] = useState<'key' | 'agent' | 'password'>('key');
  const [remoteKeyPath, setRemoteKeyPath] = useState('');
  const [remotePassword, setRemotePassword] = useState('');
  const [remotePassphrase, setRemotePassphrase] = useState('');
  const [inlinePromptProfileId, setInlinePromptProfileId] = useState<number | null>(null);
  const [inlineSecret, setInlineSecret] = useState('');

  const { currentPath, refresh, navigateTo } = useBrowserStore();
  const { openPrompt, openProperties, undo, redo } = useOperationsStore();
  const { layoutMode, setLayoutMode } = useDualPaneStore();
  const { togglePanel: toggleTerminal } = useTerminalStore();
  const { toggleDrawer: toggleSearch } = useSearchStore();

  const [paletteQuery, setPaletteQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setPaletteQuery('');
      setSelectedIdx(0);
      setTimeout(() => paletteInputRef.current?.focus(), 20);
    }
  }, [paletteOpen]);

  const commands = useMemo(
    () => [
      {
        id: 'folder-zoom-in',
        label: t('folderZoom.zoomInCommand'),
        shortcut: 'Ctrl + +',
        run: () => usePreviewStore.getState().zoomFolderIn(true),
      },
      {
        id: 'folder-zoom-out',
        label: t('folderZoom.zoomOutCommand'),
        shortcut: 'Ctrl + -',
        run: () => usePreviewStore.getState().zoomFolderOut(true),
      },
      {
        id: 'folder-zoom-reset',
        label: t('folderZoom.resetCommand'),
        shortcut: 'Ctrl + 0',
        run: () => usePreviewStore.getState().resetFolderZoom(true),
      },
      {
        id: 'connect-network-drive',
        label: t('networkDrive.connectTitle'),
        shortcut: '',
        run: () => void useFolderTreeStore.getState().openNetworkModal(),
      },
      {
        id: 'clipboard-history',
        label: t('clipboardHistory.title'),
        shortcut: 'Alt+V / Ctrl+Shift+V',
        run: () => useClipboardHistoryStore.getState().toggleDrawer(),
      },
      {
        id: 'archive-manager',
        label: t('archive.title'),
        shortcut: '',
        run: () => void openArchiveModal(),
      },
      {
        id: 'remote-manager',
        label: t('remote.title'),
        shortcut: '',
        run: () => void openRemoteModal(),
      },
      {
        id: 'batch-rename',
        label: t('productivity.batchRenameTitle'),
        shortcut: 'F2',
        run: () => void openBatchRename(),
      },
      {
        id: 'compare-folders',
        label: t('productivity.compareTitle'),
        shortcut: '',
        run: () => void openCompare(),
      },
      {
        id: 'compute-hashes',
        label: t('productivity.hashTitle'),
        shortcut: '',
        run: () => void openHashModal(),
      },
      {
        id: 'shortcuts-config',
        label: t('productivity.shortcutsTitle'),
        shortcut: '',
        run: () => openShortcutsModal(),
      },
      {
        id: 'new-folder',
        label: t('ops.newFolder'),
        shortcut: 'Ctrl+Shift+N',
        run: () => openPrompt('newFolder'),
      },
      {
        id: 'new-file',
        label: t('ops.newFile'),
        shortcut: '',
        run: () => openPrompt('newFile'),
      },
      {
        id: 'search-advanced',
        label: t('search.toggleAdvanced'),
        shortcut: 'Ctrl+Shift+S',
        run: () => toggleSearch(),
      },
      {
        id: 'item-properties',
        label: t('os.propertiesShortcut'),
        shortcut: 'Alt+Enter',
        run: () => void openProperties(),
      },
      {
        id: 'toggle-terminal',
        label: t('terminal.togglePanel'),
        shortcut: 'Ctrl+`',
        run: () => void toggleTerminal(currentPath || '/'),
      },
      {
        id: 'toggle-dual-pane',
        label: t('panes.splitHorizontal'),
        shortcut: '',
        run: () => setLayoutMode(layoutMode === 'single' ? 'split-h' : 'single'),
      },
      {
        id: 'tag-blue',
        label: `${t('productivity.tagAssign')}: Azul`,
        shortcut: '',
        run: () => void assignTagToSelection('Importante', '#3b82f6'),
      },
      {
        id: 'tag-green',
        label: `${t('productivity.tagAssign')}: Verde`,
        shortcut: '',
        run: () => void assignTagToSelection('Concluído', '#10b981'),
      },
      {
        id: 'tag-amber',
        label: `${t('productivity.tagAssign')}: Âmbar`,
        shortcut: '',
        run: () => void assignTagToSelection('Pendente', '#f59e0b'),
      },
      {
        id: 'tag-clear',
        label: t('productivity.tagClear'),
        shortcut: '',
        run: () => void clearTagFromSelection(),
      },
      {
        id: 'undo',
        label: t('ops.undo'),
        shortcut: 'Ctrl+Z',
        run: () => void undo(),
      },
      {
        id: 'redo',
        label: t('ops.redo'),
        shortcut: 'Ctrl+Y',
        run: () => void redo(),
      },
      {
        id: 'refresh',
        label: t('nav.refresh'),
        shortcut: 'F5',
        run: () => refresh(),
      },
    ],
    [
      t,
      openArchiveModal,
      openRemoteModal,
      openBatchRename,
      openCompare,
      openHashModal,
      openShortcutsModal,
      openPrompt,
      toggleSearch,
      openProperties,
      toggleTerminal,
      currentPath,
      setLayoutMode,
      layoutMode,
      assignTagToSelection,
      clearTagFromSelection,
      undo,
      redo,
      refresh,
    ]
  );

  const filteredCommands = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, paletteQuery]);

  // Detecção de conflitos de atalhos
  const shortcutCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of shortcuts) {
      const key = s.currentKey.trim().toLowerCase();
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [shortcuts]);

  const hasBatchConflicts = batchPreview.some((p) => p.hasConflict);

  const hashMatchKind = useMemo(() => {
    if (!hashData || !expectedHash.trim()) return null;
    const norm = expectedHash.trim().toLowerCase();
    if (norm === hashData.sha256.toLowerCase()) return 'SHA-256';
    if (norm === hashData.sha1.toLowerCase()) return 'SHA-1';
    if (norm === hashData.md5.toLowerCase()) return 'MD5';
    return 'MISMATCH';
  }, [hashData, expectedHash]);

  return (
    <>
      {/* 1. Paleta de Comandos (Ctrl+Shift+P) */}
      {paletteOpen && (
        <div style={styles.backdrop} onClick={closePalette}>
          <div style={styles.paletteModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.paletteHeader}>
              <Command size={15} style={{ color: 'var(--accent)' }} />
              <input
                ref={paletteInputRef}
                type="text"
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value);
                  setSelectedIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIdx((i) =>
                      filteredCommands.length > 0 ? (i + 1) % filteredCommands.length : 0
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIdx((i) =>
                      filteredCommands.length > 0
                        ? (i - 1 + filteredCommands.length) % filteredCommands.length
                        : 0
                    );
                  } else if (e.key === 'Enter' && filteredCommands[selectedIdx]) {
                    e.preventDefault();
                    const cmd = filteredCommands[selectedIdx];
                    closePalette();
                    cmd.run();
                  } else if (e.key === 'Escape') {
                    closePalette();
                  }
                }}
                placeholder={t('productivity.palettePlaceholder')}
                style={styles.paletteInput}
              />
              <button type="button" style={styles.iconBtn} onClick={closePalette}>
                <X size={14} />
              </button>
            </div>
            <div style={styles.paletteList}>
              {filteredCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  style={
                    idx === selectedIdx
                      ? { ...styles.paletteItem, ...styles.paletteItemActive }
                      : styles.paletteItem
                  }
                  onMouseEnter={() => setSelectedIdx(idx)}
                  onClick={() => {
                    closePalette();
                    cmd.run();
                  }}
                >
                  <span>{cmd.label}</span>
                  {cmd.shortcut && <kbd style={styles.kbd}>{cmd.shortcut}</kbd>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal de Renomeação em Lote com Prévia */}
      {batchRenameOpen && (
        <div style={styles.backdrop} onClick={closeBatchRename}>
          <div style={{ ...styles.modal, width: 640 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.titleRow}>
                <Edit3 size={15} style={{ color: 'var(--accent)' }} />
                {t('productivity.batchRenameTitle')}
              </span>
              <button type="button" style={styles.iconBtn} onClick={closeBatchRename}>
                <X size={14} />
              </button>
            </div>

            <div style={styles.gridForm}>
              <input
                type="text"
                placeholder={t('productivity.findPlaceholder')}
                value={batchOptions.find}
                onChange={(e) => void updateBatchOptions({ find: e.target.value })}
                style={styles.input}
              />
              <input
                type="text"
                placeholder={t('productivity.replacePlaceholder')}
                value={batchOptions.replace}
                onChange={(e) => void updateBatchOptions({ replace: e.target.value })}
                style={styles.input}
              />
              <input
                type="text"
                placeholder={t('productivity.prefixPlaceholder')}
                value={batchOptions.prefix}
                onChange={(e) => void updateBatchOptions({ prefix: e.target.value })}
                style={styles.input}
              />
              <input
                type="text"
                placeholder={t('productivity.suffixPlaceholder')}
                value={batchOptions.suffix}
                onChange={(e) => void updateBatchOptions({ suffix: e.target.value })}
                style={styles.input}
              />
              <select
                value={batchOptions.caseMode}
                onChange={(e) =>
                  void updateBatchOptions({
                    caseMode: e.target.value as 'none' | 'lower' | 'upper' | 'title',
                  })
                }
                style={styles.input}
              >
                <option value="none">{t('productivity.caseNone')}</option>
                <option value="lower">{t('productivity.caseLower')}</option>
                <option value="upper">{t('productivity.caseUpper')}</option>
                <option value="title">{t('productivity.caseTitle')}</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={batchOptions.useRegex}
                    onChange={(e) => void updateBatchOptions({ useRegex: e.target.checked })}
                  />
                  <span>Regex</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={batchOptions.numberDigits}
                  onChange={(e) =>
                    void updateBatchOptions({ numberDigits: Number(e.target.value) || 0 })
                  }
                  title={t('productivity.counterDigits')}
                  style={{ ...styles.input, width: 70 }}
                />
              </div>
            </div>

            {batchError && <div style={styles.errorBanner}>{batchError}</div>}

            <div style={styles.tableBox}>
              {batchPreview.map((item) => (
                <div key={item.originalPath} style={styles.previewRow}>
                  <span style={styles.origName}>{item.originalName}</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span
                    style={{
                      ...styles.newName,
                      color: item.hasConflict
                        ? '#ef4444'
                        : item.changed
                          ? 'var(--accent)'
                          : 'var(--text-primary)',
                    }}
                  >
                    {item.newName}
                  </span>
                </div>
              ))}
            </div>

            <div style={styles.footer}>
              <button type="button" style={styles.secondaryBtn} onClick={closeBatchRename}>
                {t('ops.cancel')}
              </button>
              <button
                type="button"
                style={styles.primaryBtn}
                disabled={hasBatchConflicts}
                onClick={() => void applyBatchRename()}
              >
                {t('ops.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal de Comparação de Pastas */}
      {compareOpen && (
        <div style={styles.backdrop} onClick={closeCompare}>
          <div style={{ ...styles.modal, width: 680 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.titleRow}>
                <FolderGit2 size={15} style={{ color: 'var(--accent)' }} />
                {t('productivity.compareTitle')}
              </span>
              <button type="button" style={styles.iconBtn} onClick={closeCompare}>
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={compareLeftDir}
                onChange={(e) => setCompareDirs(e.target.value, compareRightDir)}
                placeholder={t('ops.conflictSource')}
                style={{ ...styles.input, flex: 1 }}
              />
              <input
                type="text"
                value={compareRightDir}
                onChange={(e) => setCompareDirs(compareLeftDir, e.target.value)}
                placeholder={t('ops.conflictDest')}
                style={{ ...styles.input, flex: 1 }}
              />
              <button type="button" style={styles.primaryBtn} onClick={() => void runCompare()}>
                {t('productivity.compareRun')}
              </button>
            </div>

            <div style={styles.tableBox}>
              {compareLoading ? (
                <div style={styles.emptyMsg}>{t('tree.loading')}</div>
              ) : compareResults.length === 0 ? (
                <div style={styles.emptyMsg}>{t('search.noResults')}</div>
              ) : (
                compareResults.map((item) => (
                  <div key={item.name} style={styles.previewRow}>
                    <span style={{ fontWeight: 500, flex: 1 }}>{item.name}</span>
                    <span style={styles.diffBadge}>{t(`productivity.diffStatus.${item.status}`)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 130, textAlign: 'right' }}>
                      {item.leftSize > 0 ? formatBytes(item.leftSize, i18n.language) : '—'} /{' '}
                      {item.rightSize > 0 ? formatBytes(item.rightSize, i18n.language) : '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal de Calculadora e Verificador de Hashes (MD5, SHA-1, SHA-256) */}
      {hashOpen && (
        <div style={styles.backdrop} onClick={closeHashModal}>
          <div style={{ ...styles.modal, width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.titleRow}>
                <Hash size={15} style={{ color: 'var(--accent)' }} />
                {t('productivity.hashTitle')}
              </span>
              <button type="button" style={styles.iconBtn} onClick={closeHashModal}>
                <X size={14} />
              </button>
            </div>

            {hashLoading || !hashData ? (
              <div style={styles.emptyMsg}>{t('tree.loading')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                <div>
                  <strong>{t('columns.name')}:</strong> {hashData.path}
                </div>
                <div>
                  <strong>MD5:</strong>{' '}
                  <code style={styles.codeBlock}>{hashData.md5}</code>
                </div>
                <div>
                  <strong>SHA-1:</strong>{' '}
                  <code style={styles.codeBlock}>{hashData.sha1}</code>
                </div>
                <div>
                  <strong>SHA-256:</strong>{' '}
                  <code style={styles.codeBlock}>{hashData.sha256}</code>
                </div>

                <input
                  type="text"
                  value={expectedHash}
                  onChange={(e) => setExpectedHash(e.target.value)}
                  placeholder={t('productivity.verifyHashPlaceholder')}
                  style={styles.input}
                />

                {hashMatchKind && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: hashMatchKind === 'MISMATCH' ? '#ef4444' : '#10b981',
                      fontWeight: 600,
                    }}
                  >
                    {hashMatchKind === 'MISMATCH' ? (
                      <>
                        <AlertTriangle size={14} />
                        <span>{t('productivity.hashMismatch')}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        <span>{t('productivity.hashMatched', { algo: hashMatchKind })}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Modal de Atalhos Configuráveis com Detecção de Conflitos */}
      {shortcutsOpen && (
        <div style={styles.backdrop} onClick={closeShortcutsModal}>
          <div style={{ ...styles.modal, width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.titleRow}>
                <Keyboard size={15} style={{ color: 'var(--accent)' }} />
                {t('productivity.shortcutsTitle')}
              </span>
              <button type="button" style={styles.iconBtn} onClick={closeShortcutsModal}>
                <X size={14} />
              </button>
            </div>

            <div style={styles.tableBox}>
              {shortcuts.map((sc) => {
                const isConflict =
                  (shortcutCounts[sc.currentKey.trim().toLowerCase()] || 0) > 1;
                return (
                  <div key={sc.id} style={styles.previewRow}>
                    <span style={{ flex: 1 }}>{t(sc.labelKey)}</span>
                    <input
                      type="text"
                      value={sc.currentKey}
                      onChange={(e) => updateShortcut(sc.id, e.target.value)}
                      style={{
                        ...styles.input,
                        width: 140,
                        borderColor: isConflict ? '#ef4444' : 'var(--border-subtle)',
                      }}
                    />
                    {isConflict && (
                      <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 600 }}>
                        {t('productivity.shortcutConflict')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={styles.footer}>
              <button type="button" style={styles.secondaryBtn} onClick={resetShortcuts}>
                {t('search.clearFilters')}
              </button>
              <button type="button" style={styles.primaryBtn} onClick={closeShortcutsModal}>
                {t('ops.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal de Arquivos Compactados (.zip / .tar.gz) */}
      {archiveOpen && (
        <div style={styles.backdrop} onClick={closeArchiveModal}>
          <div style={{ ...styles.modal, width: 580 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.titleRow}>
                <Archive size={15} style={{ color: 'var(--accent)' }} />
                {t('archive.title')}
              </span>
              <button type="button" style={styles.iconBtn} onClick={closeArchiveModal}>
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={archiveNameInput}
                onChange={(e) => setArchiveNameInput(e.target.value)}
                placeholder={t('ops.namePlaceholder')}
                style={{ ...styles.input, flex: 1 }}
              />
              <select
                value={archiveFormat}
                onChange={(e) => setArchiveFormat(e.target.value as 'zip' | 'tar.gz')}
                style={styles.input}
              >
                <option value="zip">.zip</option>
                <option value="tar.gz">.tar.gz</option>
              </select>
              <button
                type="button"
                style={styles.primaryBtn}
                onClick={() => void compressSelection(archiveNameInput, archiveFormat)}
              >
                {t('archive.compressSelection')}
              </button>
            </div>

            {archivePath && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span>
                    <strong>{t('archive.inspecting')}:</strong> {archivePath}
                  </span>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={() => void extractCurrentArchive()}
                  >
                    {t('archive.extractHere')}
                  </button>
                </div>

                <div style={styles.tableBox}>
                  {archiveLoading ? (
                    <div style={styles.emptyMsg}>{t('tree.loading')}</div>
                  ) : archiveEntries.length === 0 ? (
                    <div style={styles.emptyMsg}>{t('status.empty')}</div>
                  ) : (
                    archiveEntries.map((entry) => (
                      <div key={entry.path} style={styles.previewRow}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.isDir ? `📁 ${entry.path}` : `📄 ${entry.path}`}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {entry.isDir ? '—' : formatBytes(entry.size, i18n.language)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 7. Modal de Conexões Remotas Seguras (SSH / SFTP / WebDAV) */}
      {remoteOpen && (
        <div style={styles.backdrop} onClick={closeRemoteModal}>
          <div style={{ ...styles.modal, width: 680 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.titleRow}>
                <Server size={15} style={{ color: 'var(--accent)' }} />
                {t('remote.title')}
              </span>
              <button type="button" style={styles.iconBtn} onClick={closeRemoteModal}>
                <X size={14} />
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 6,
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.28)',
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            >
              <ShieldCheck size={14} style={{ color: '#10b981', flexShrink: 0 }} />
              <span>
                Segurança SSH/SFTP ativa: verificação de chave pública do servidor (TOFU SHA-256) e credenciais mantidas apenas em memória volátil (nunca gravadas em texto puro no disco).
              </span>
            </div>

            {sftpError && <div style={styles.errorBanner}>{sftpError}</div>}

            {/* Alerta de Verificação TOFU / Divergência de Chave do Host */}
            {sftpTrustPrompt && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 6,
                  border: sftpTrustPrompt.hostKeyMismatch
                    ? '1px solid #ef4444'
                    : '1px solid #f59e0b',
                  backgroundColor: sftpTrustPrompt.hostKeyMismatch
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <ShieldAlert
                    size={15}
                    style={{
                      color: sftpTrustPrompt.hostKeyMismatch ? '#ef4444' : '#f59e0b',
                      flexShrink: 0,
                    }}
                  />
                  <span>
                    {sftpTrustPrompt.hostKeyMismatch
                      ? 'ALERTA DE SEGURANÇA: A chave pública do servidor mudou!'
                      : 'Verificar Identidade do Servidor SSH (Primeiro Acesso - TOFU)'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {sftpTrustPrompt.hostKeyMismatch
                    ? 'A impressão digital apresentada pelo servidor difere da chave confiável salva neste perfil. Isso pode indicar interceptação de rede (MITM) ou reinstalação do servidor.'
                    : 'Confirme a impressão digital (fingerprint) SHA-256 da chave pública do servidor antes de estabelecer a conexão criptografada:'}
                </div>
                <code style={styles.codeBlock}>
                  Algoritmo: {sftpTrustPrompt.hostKeyType || 'SSH'} • Fingerprint:{' '}
                  {sftpTrustPrompt.hostKeyFp}
                </code>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={cancelSftpTrustPrompt}
                  >
                    {t('ops.cancel')}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.primaryBtn,
                      backgroundColor: sftpTrustPrompt.hostKeyMismatch ? '#ef4444' : '#10b981',
                    }}
                    disabled={sftpConnecting}
                    onClick={() => void confirmSftpTrustAndConnect()}
                  >
                    {sftpTrustPrompt.hostKeyMismatch
                      ? 'Atualizar Chave e Conectar'
                      : 'Confiar na Chave (Pin SHA-256) e Conectar'}
                  </button>
                </div>
              </div>
            )}

            <div style={styles.gridForm}>
              <input
                type="text"
                placeholder="Nome (ex: Servidor Intranet / Produção)"
                value={remoteName}
                onChange={(e) => setRemoteName(e.target.value)}
                style={styles.input}
              />
              <select
                value={remoteProtocol}
                onChange={(e) => {
                  const proto = e.target.value as 'sftp' | 'webdav';
                  setRemoteProtocol(proto);
                  setRemotePort(proto === 'webdav' ? 443 : 22);
                }}
                style={styles.input}
              >
                <option value="sftp">SFTP / SSH (Porta 22)</option>
                <option value="webdav">WebDAV (HTTPS)</option>
              </select>
              <input
                type="text"
                placeholder={t('remote.hostPlaceholder')}
                value={remoteHost}
                onChange={(e) => setRemoteHost(e.target.value)}
                style={styles.input}
              />
              <input
                type="number"
                value={remotePort}
                onChange={(e) => setRemotePort(Number(e.target.value) || 22)}
                style={styles.input}
              />
              <input
                type="text"
                placeholder={t('remote.userPlaceholder')}
                value={remoteUser}
                onChange={(e) => setRemoteUser(e.target.value)}
                style={styles.input}
              />
              <input
                type="text"
                placeholder={t('remote.pathPlaceholder')}
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                style={styles.input}
              />

              {remoteProtocol === 'sftp' && (
                <>
                  <select
                    value={remoteAuthType}
                    onChange={(e) =>
                      setRemoteAuthType(e.target.value as 'key' | 'agent' | 'password')
                    }
                    style={styles.input}
                  >
                    <option value="key">Autenticação: Chave Privada SSH (~/.ssh)</option>
                    <option value="agent">Autenticação: SSH Agent do Sistema</option>
                    <option value="password">Autenticação: Senha (apenas em RAM)</option>
                  </select>

                  {remoteAuthType === 'key' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {localSshKeys.length > 0 && (
                        <select
                          value={remoteKeyPath || localSshKeys[0]?.path || ''}
                          onChange={(e) => setRemoteKeyPath(e.target.value)}
                          style={{ ...styles.input, flex: 1 }}
                          title="Chaves detectadas em ~/.ssh"
                        >
                          {localSshKeys.map((k) => (
                            <option key={k.path} value={k.path}>
                              🔑 {k.name} ({k.path})
                            </option>
                          ))}
                          <option value="">Outro caminho...</option>
                        </select>
                      )}
                      {(localSshKeys.length === 0 || remoteKeyPath === '') && (
                        <input
                          type="text"
                          placeholder="Caminho da chave (ex: ~/.ssh/id_ed25519)"
                          value={remoteKeyPath}
                          onChange={(e) => setRemoteKeyPath(e.target.value)}
                          style={{ ...styles.input, flex: 1 }}
                        />
                      )}
                    </div>
                  )}

                  {remoteAuthType === 'key' && (
                    <input
                      type="password"
                      placeholder="Passphrase da chave (opcional, apenas RAM)"
                      value={remotePassphrase}
                      onChange={(e) => setRemotePassphrase(e.target.value)}
                      style={{ ...styles.input, gridColumn: 'span 2' }}
                    />
                  )}

                  {remoteAuthType === 'password' && (
                    <input
                      type="password"
                      placeholder="Senha SSH (mantida apenas em memória na sessão)"
                      value={remotePassword}
                      onChange={(e) => setRemotePassword(e.target.value)}
                      style={styles.input}
                    />
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() => {
                  if (!remoteName.trim() || !remoteHost.trim()) return;
                  const chosenKey =
                    remoteAuthType === 'key'
                      ? remoteKeyPath.trim() || localSshKeys[0]?.path || ''
                      : '';
                  void addRemoteProfile({
                    name: remoteName.trim(),
                    protocol: remoteProtocol,
                    host: remoteHost.trim(),
                    port: remotePort,
                    username: remoteUser.trim(),
                    remotePath: remotePath.trim() || '/',
                    authType: remoteAuthType,
                    keyPath: chosenKey,
                  });
                  setRemoteName('');
                  setRemoteHost('');
                  setRemotePassword('');
                  setRemotePassphrase('');
                }}
              >
                {t('remote.saveProfile')}
              </button>

              {remoteProtocol === 'sftp' && (
                <button
                  type="button"
                  style={styles.primaryBtn}
                  disabled={sftpConnecting || !remoteHost.trim() || !remoteUser.trim()}
                  onClick={async () => {
                    if (!remoteHost.trim() || !remoteUser.trim()) return;
                    const chosenKey =
                      remoteAuthType === 'key'
                        ? remoteKeyPath.trim() || localSshKeys[0]?.path || ''
                        : '';
                    const profileName =
                      remoteName.trim() || `${remoteUser.trim()}@${remoteHost.trim()}`;
                    const savedId = await addRemoteProfile({
                      name: profileName,
                      protocol: 'sftp',
                      host: remoteHost.trim(),
                      port: remotePort || 22,
                      username: remoteUser.trim(),
                      remotePath: remotePath.trim() || '/',
                      authType: remoteAuthType,
                      keyPath: chosenKey,
                    });
                    await connectSFTP({
                      profileId: savedId || 0,
                      name: profileName,
                      host: remoteHost.trim(),
                      port: remotePort || 22,
                      username: remoteUser.trim(),
                      remotePath: remotePath.trim() || '/',
                      authType: remoteAuthType,
                      keyPath: chosenKey,
                      passphrase:
                        remoteAuthType === 'password' ? remotePassword : remotePassphrase,
                      trustHost: false,
                    });
                    setRemotePassword('');
                    setRemotePassphrase('');
                  }}
                >
                  {sftpConnecting ? 'Conectando...' : 'Salvar e Conectar SFTP'}
                </button>
              )}
            </div>

            <div style={styles.tableBox}>
              {remoteProfiles.length === 0 ? (
                <div style={styles.emptyMsg}>{t('remote.empty')}</div>
              ) : (
                remoteProfiles.map((p) => {
                  const isConnected = activeSftpIds.includes(p.id);
                  const isPrompting = inlinePromptProfileId === p.id;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: '6px 8px',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: isConnected ? '#10b981' : 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                          title={isConnected ? 'Conectado' : 'Desconectado'}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 12 }}>{p.name}</strong>
                            <span style={styles.diffBadge}>
                              {(p.authType || 'key').toUpperCase()}
                            </span>
                            {p.hostKeyFp && (
                              <span
                                style={{
                                  ...styles.diffBadge,
                                  color: '#10b981',
                                  borderColor: 'rgba(16, 185, 129, 0.35)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                }}
                                title={`Host Key SHA-256 verificada: ${p.hostKeyFp}`}
                              >
                                <Lock size={10} />
                                SHA-256 Pin
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {p.protocol.toUpperCase()} • {p.username ? `${p.username}@` : ''}
                            {p.host}:{p.port}
                            {p.remotePath}
                            {p.keyPath ? ` • 🔑 ${p.keyPath}` : ''}
                          </div>
                        </div>

                        {p.protocol === 'sftp' && (
                          <>
                            {isConnected ? (
                              <>
                                <button
                                  type="button"
                                  style={styles.secondaryBtn}
                                  onClick={() => {
                                    closeRemoteModal();
                                    void navigateTo(`sftp://${p.id}${p.remotePath || '/'}`);
                                  }}
                                  title="Abrir diretório remoto no navegador"
                                >
                                  <FolderOpen size={12} style={{ marginRight: 4 }} />
                                  Abrir
                                </button>
                                <button
                                  type="button"
                                  style={styles.secondaryBtn}
                                  onClick={() => void disconnectSFTP(p.id)}
                                  title="Encerrar sessão SFTP e limpar credenciais da memória"
                                >
                                  <Unplug size={12} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                style={styles.primaryBtn}
                                disabled={sftpConnecting}
                                onClick={() => {
                                  if (p.authType === 'password') {
                                    setInlinePromptProfileId(isPrompting ? null : p.id);
                                    setInlineSecret('');
                                    return;
                                  }
                                  void connectSFTP({
                                    profileId: p.id,
                                    name: p.name,
                                    host: p.host,
                                    port: p.port,
                                    username: p.username,
                                    remotePath: p.remotePath,
                                    authType: p.authType || 'key',
                                    keyPath: p.keyPath || localSshKeys[0]?.path || '',
                                    passphrase: '',
                                    trustHost: false,
                                  });
                                }}
                                title="Conectar via SFTP seguro"
                              >
                                <Plug size={12} style={{ marginRight: 4 }} />
                                Conectar
                              </button>
                            )}

                            <button
                              type="button"
                              style={styles.secondaryBtn}
                              onClick={() => {
                                closeRemoteModal();
                                void openSshTerminalSession(p);
                              }}
                              title="Abrir sessão interativa SSH no Terminal Integrado"
                            >
                              <TerminalSquare size={12} />
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          style={styles.iconBtn}
                          onClick={() => void removeRemoteProfile(p.id)}
                          title={t('ops.trash')}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Solicitação de senha/passphrase em memória para conectar a perfil salvo */}
                      {isPrompting && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 4 }}>
                          <KeyRound size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <input
                            type="password"
                            autoFocus
                            placeholder="Digite a senha SSH (mantida apenas na RAM)..."
                            value={inlineSecret}
                            onChange={(e) => setInlineSecret(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const secret = inlineSecret;
                                setInlineSecret('');
                                setInlinePromptProfileId(null);
                                void connectSFTP({
                                  profileId: p.id,
                                  name: p.name,
                                  host: p.host,
                                  port: p.port,
                                  username: p.username,
                                  remotePath: p.remotePath,
                                  authType: p.authType || 'password',
                                  keyPath: p.keyPath || '',
                                  passphrase: secret,
                                  trustHost: false,
                                });
                              } else if (e.key === 'Escape') {
                                setInlinePromptProfileId(null);
                                setInlineSecret('');
                              }
                            }}
                            style={{ ...styles.input, flex: 1 }}
                          />
                          <button
                            type="button"
                            style={styles.primaryBtn}
                            disabled={sftpConnecting}
                            onClick={() => {
                              const secret = inlineSecret;
                              setInlineSecret('');
                              setInlinePromptProfileId(null);
                              void connectSFTP({
                                profileId: p.id,
                                name: p.name,
                                host: p.host,
                                port: p.port,
                                username: p.username,
                                remotePath: p.remotePath,
                                authType: p.authType || 'password',
                                keyPath: p.keyPath || '',
                                passphrase: secret,
                                trustHost: false,
                              });
                            }}
                          >
                            Autenticar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
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
    zIndex: 2100,
  },
  paletteModal: {
    width: 520,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
  },
  paletteHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  paletteInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 13,
  },
  paletteList: {
    maxHeight: 320,
    overflowY: 'auto',
    padding: 6,
  },
  paletteItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: 6,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'default',
  },
  paletteItemActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    color: 'var(--accent)',
  },
  kbd: {
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 10,
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)',
  },
  modal: {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  gridForm: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  input: {
    height: 30,
    padding: '0 8px',
    borderRadius: 5,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-primary)',
    fontSize: 12,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  tableBox: {
    maxHeight: 240,
    overflowY: 'auto',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    padding: 8,
    backgroundColor: 'var(--bg-base)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  previewRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12,
    padding: '4px 6px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  origName: {
    flex: 1,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  newName: {
    flex: 1,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  diffBadge: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
  },
  codeBlock: {
    display: 'block',
    padding: '4px 6px',
    borderRadius: 4,
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--border-subtle)',
    fontFamily: 'monospace',
    fontSize: 11,
    wordBreak: 'break-all',
    marginTop: 2,
  },
  errorBanner: {
    padding: '6px 10px',
    borderRadius: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    fontSize: 12,
  },
  emptyMsg: {
    padding: 20,
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  footer: {
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
    cursor: 'default',
  },
  secondaryBtn: {
    padding: '6px 12px',
    borderRadius: 5,
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    fontSize: 12,
    cursor: 'default',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    color: 'var(--text-secondary)',
    cursor: 'default',
  },
};
