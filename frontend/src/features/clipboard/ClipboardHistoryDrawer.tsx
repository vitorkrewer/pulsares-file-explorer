import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  Copy,
  Check,
  Pin,
  Trash2,
  X,
  Search,
  Image as ImageIcon,
  FileText,
  FolderClosed,
  Download,
  ClipboardPaste,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  ClipboardFilterType,
  ClipboardFilesPayload,
  useClipboardHistoryStore,
} from './store';
import { ClipboardHistoryItem } from '../../lib/wails';
import { formatBytes } from '../../i18n/format';
import { useBrowserStore } from '../browser/store';

export const ClipboardHistoryDrawer: React.FC = () => {
  const { t, i18n } = useTranslation();
  const {
    drawerOpen,
    items,
    capturePaused,
    filterType,
    searchQuery,
    feedbackMessage,
    setDrawerOpen,
    setFilterType,
    setSearchQuery,
    toggleCapturePaused,
    togglePin,
    removeItem,
    clearUnpinned,
    copyItemToSystem,
    pasteFilesItemHere,
    saveItemToCurrentFolder,
    syncFromSystemClipboard,
    showFeedback,
  } = useClipboardHistoryStore();

  const currentPath = useBrowserStore((s) => s.currentPath);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  if (!drawerOpen) return null;

  const unpinnedCount = items.filter((i) => !i.pinned).length;
  const pinnedCount = items.filter((i) => i.pinned).length;

  const filteredItems = items.filter((item) => {
    if (filterType === 'pinned' && !item.pinned) return false;
    if (filterType !== 'all' && filterType !== 'pinned' && item.kind !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPreview = (item.preview || '').toLowerCase().includes(q);
      const matchContent =
        item.kind !== 'image' && (item.content || '').toLowerCase().includes(q);
      return matchPreview || matchContent;
    }
    return true;
  });

  const handleCopyItem = async (item: ClipboardHistoryItem) => {
    await copyItemToSystem(item);
    setCopiedId(item.id);
    showFeedback(t('clipboardHistory.copiedToast'));
    setTimeout(() => {
      setCopiedId((prev) => (prev === item.id ? null : prev));
    }, 1500);
  };

  const handleSaveToFolder = async (item: ClipboardHistoryItem) => {
    try {
      const savedPath = await saveItemToCurrentFolder(item);
      if (savedPath) {
        const fileName = savedPath.replace(/\\/g, '/').split('/').pop() || savedPath;
        showFeedback(t('clipboardHistory.savedToFolderToast', { name: fileName }));
      }
    } catch {
      // ignore
    }
  };

  const handlePasteFiles = async (item: ClipboardHistoryItem) => {
    await pasteFilesItemHere(item);
    showFeedback(t('clipboardHistory.pastedFilesToast'));
  };

  const filters: { id: ClipboardFilterType; label: string }[] = [
    { id: 'all', label: t('clipboardHistory.filterAll') },
    { id: 'text', label: t('clipboardHistory.filterText') },
    { id: 'image', label: t('clipboardHistory.filterImages') },
    { id: 'files', label: t('clipboardHistory.filterFiles') },
    { id: 'pinned', label: `${t('clipboardHistory.filterPinned')} (${pinnedCount})` },
  ];

  return (
    <aside
      style={styles.drawer}
      aria-label={t('clipboardHistory.title')}
      data-testid="clipboard-history-drawer"
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitleRow}>
          <div style={styles.titleIconWrap}>
            <ClipboardList size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.titleText}>{t('clipboardHistory.title')}</div>
            <div style={styles.subtitleText}>
              {t('clipboardHistory.capacityInfo', { count: unpinnedCount, max: 20 })}
              {pinnedCount > 0 ? ` • ${pinnedCount} ${t('clipboardHistory.pinnedLower')}` : ''}
            </div>
          </div>
          <span style={styles.shortcutBadge} title={t('clipboardHistory.shortcutHint')}>
            Alt+V
          </span>
          <button
            type="button"
            style={styles.iconBtn}
            onClick={() => setDrawerOpen(false)}
            title={t('clipboardHistory.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar Controls */}
        <div style={styles.toolbarRow}>
          <button
            type="button"
            style={styles.toolbarBtn}
            onClick={() => void syncFromSystemClipboard(true)}
            title={t('clipboardHistory.syncNowHint')}
          >
            <RefreshCw size={13} />
            <span>{t('clipboardHistory.syncNow')}</span>
          </button>

          <button
            type="button"
            style={{
              ...styles.toolbarBtn,
              ...(capturePaused ? styles.toolbarBtnWarning : {}),
            }}
            onClick={toggleCapturePaused}
            title={
              capturePaused
                ? t('clipboardHistory.resumeCapture')
                : t('clipboardHistory.pauseCapture')
            }
          >
            {capturePaused ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
            <span>
              {capturePaused
                ? t('clipboardHistory.resumeCapture')
                : t('clipboardHistory.pauseCapture')}
            </span>
          </button>

          <button
            type="button"
            style={{
              ...styles.toolbarBtn,
              opacity: unpinnedCount === 0 ? 0.45 : 1,
            }}
            disabled={unpinnedCount === 0}
            onClick={() => void clearUnpinned()}
            title={t('clipboardHistory.clearUnpinned')}
          >
            <Trash2 size={13} />
            <span>{t('clipboardHistory.clearUnpinned')}</span>
          </button>
        </div>

        {/* Search Input */}
        <div style={styles.searchWrap}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('clipboardHistory.searchPlaceholder')}
            style={styles.searchInput}
          />
          {searchQuery && (
            <button
              type="button"
              style={styles.clearSearchBtn}
              onClick={() => setSearchQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div style={styles.filterRow}>
          {filters.map((f) => {
            const active = filterType === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterType(f.id)}
                style={{
                  ...styles.filterPill,
                  ...(active ? styles.filterPillActive : {}),
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div style={styles.feedbackBanner}>
          <Sparkles size={13} />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Paused Banner */}
      {capturePaused && (
        <div style={styles.pausedBanner}>
          <PauseCircle size={14} style={{ flexShrink: 0 }} />
          <span>{t('clipboardHistory.pausedNotice')}</span>
        </div>
      )}

      {/* Items List */}
      <div style={styles.listContainer}>
        {filteredItems.length === 0 ? (
          <div style={styles.emptyState}>
            <ClipboardList size={34} style={{ color: 'var(--text-muted)', opacity: 0.45 }} />
            <div style={styles.emptyTitle}>{t('clipboardHistory.emptyTitle')}</div>
            <div style={styles.emptyDesc}>{t('clipboardHistory.emptyDesc')}</div>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isCopied = copiedId === item.id;
            let filesPayload: ClipboardFilesPayload | null = null;
            if (item.kind === 'files') {
              try {
                filesPayload = JSON.parse(item.content) as ClipboardFilesPayload;
              } catch {
                filesPayload = null;
              }
            }

            return (
              <div
                key={item.id}
                style={{
                  ...styles.card,
                  ...(item.pinned ? styles.cardPinned : {}),
                }}
              >
                {/* Card Top Bar */}
                <div style={styles.cardHeader}>
                  <div style={styles.cardKindBadge}>
                    {item.kind === 'image' && (
                      <>
                        <ImageIcon size={13} style={{ color: '#8b5cf6' }} />
                        <span>{t('clipboardHistory.kindImage')}</span>
                        {item.width && item.height ? (
                          <span style={styles.cardMetaText}>
                            {item.width}×{item.height}
                          </span>
                        ) : null}
                      </>
                    )}
                    {item.kind === 'text' && (
                      <>
                        <FileText size={13} style={{ color: 'var(--accent)' }} />
                        <span>{t('clipboardHistory.kindText')}</span>
                        <span style={styles.cardMetaText}>
                          {item.content.length} {t('clipboardHistory.chars')}
                        </span>
                      </>
                    )}
                    {item.kind === 'files' && (
                      <>
                        <FolderClosed size={13} style={{ color: '#10b981' }} />
                        <span>
                          {filesPayload?.mode === 'cut'
                            ? t('clipboardHistory.kindFilesCut')
                            : t('clipboardHistory.kindFilesCopy')}
                        </span>
                        {filesPayload?.paths?.length ? (
                          <span style={styles.cardMetaText}>
                            ({filesPayload.paths.length})
                          </span>
                        ) : null}
                      </>
                    )}
                    <span style={styles.cardMetaText}>• {formatBytes(item.byteSize, i18n.language || 'pt-BR')}</span>
                  </div>

                  {/* Card Actions */}
                  <div style={styles.cardActions}>
                    <button
                      type="button"
                      style={{
                        ...styles.cardActionBtn,
                        ...(isCopied ? styles.cardActionBtnSuccess : {}),
                      }}
                      onClick={() => void handleCopyItem(item)}
                      title={t('clipboardHistory.copyAction')}
                    >
                      {isCopied ? <Check size={13} /> : <Copy size={13} />}
                    </button>

                    {(item.kind === 'image' || item.kind === 'text') && currentPath && (
                      <button
                        type="button"
                        style={styles.cardActionBtn}
                        onClick={() => void handleSaveToFolder(item)}
                        title={
                          item.kind === 'image'
                            ? t('clipboardHistory.saveImageToFolder')
                            : t('clipboardHistory.saveTextToFolder')
                        }
                      >
                        <Download size={13} />
                      </button>
                    )}

                    {item.kind === 'files' && currentPath && (
                      <button
                        type="button"
                        style={styles.cardActionBtn}
                        onClick={() => void handlePasteFiles(item)}
                        title={t('clipboardHistory.pasteFilesHere')}
                      >
                        <ClipboardPaste size={13} />
                      </button>
                    )}

                    <button
                      type="button"
                      style={{
                        ...styles.cardActionBtn,
                        ...(item.pinned ? styles.cardActionBtnPinned : {}),
                      }}
                      onClick={() => void togglePin(item.id)}
                      title={
                        item.pinned
                          ? t('clipboardHistory.unpinAction')
                          : t('clipboardHistory.pinAction')
                      }
                    >
                      <Pin size={13} />
                    </button>

                    <button
                      type="button"
                      style={styles.cardActionBtn}
                      onClick={() => void removeItem(item.id)}
                      title={t('clipboardHistory.deleteAction')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Card Content Preview */}
                {item.kind === 'image' && (
                  <div
                    style={styles.imagePreviewWrap}
                    onClick={() => void handleCopyItem(item)}
                    title={t('clipboardHistory.clickToCopy')}
                  >
                    <img
                      src={item.content}
                      alt={item.preview || 'Clipboard image'}
                      style={styles.imagePreview}
                    />
                  </div>
                )}

                {item.kind === 'text' && (
                  <div
                    style={styles.textPreviewBox}
                    onClick={() => void handleCopyItem(item)}
                    title={t('clipboardHistory.clickToCopy')}
                  >
                    {item.content.slice(0, 420)}
                    {item.content.length > 420 ? '…' : ''}
                  </div>
                )}

                {item.kind === 'files' && filesPayload && (
                  <div
                    style={styles.filesListBox}
                    onClick={() => void handleCopyItem(item)}
                    title={t('clipboardHistory.clickToCopy')}
                  >
                    {filesPayload.paths.slice(0, 4).map((p) => {
                      const clean = p.replace(/\\/g, '/');
                      const name = clean.split('/').filter(Boolean).pop() || p;
                      return (
                        <div key={p} style={styles.fileRowItem} title={p}>
                          <span style={styles.fileName}>{name}</span>
                          <span style={styles.filePathHint}>{p}</span>
                        </div>
                      );
                    })}
                    {filesPayload.paths.length > 4 && (
                      <div style={styles.moreFilesHint}>
                        +{filesPayload.paths.length - 4} {t('clipboardHistory.moreItems')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  drawer: {
    width: '340px',
    minWidth: '300px',
    maxWidth: '380px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-surface)',
    borderLeft: '1px solid var(--border-subtle)',
    userSelect: 'none',
    zIndex: 30,
  },
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: 'var(--bg-elevated)',
  },
  headerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  titleIconWrap: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--accent-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleText: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  subtitleText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '1px',
  },
  shortcutBadge: {
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  toolbarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  toolbarBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 500,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  toolbarBtnWarning: {
    borderColor: '#f59e0b',
    color: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 8px',
    height: '28px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '12px',
  },
  clearSearchBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '2px',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    overflowX: 'auto',
    paddingBottom: '2px',
  },
  filterPill: {
    padding: '3px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 500,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterPillActive: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: '#ffffff',
  },
  feedbackBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 500,
    backgroundColor: 'var(--accent-subtle)',
    color: 'var(--accent)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  pausedBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    fontSize: '11px',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    color: '#f59e0b',
    borderBottom: '1px solid var(--border-subtle)',
  },
  listContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '28px 16px',
    gap: '8px',
  },
  emptyTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  emptyDesc: {
    fontSize: '11.5px',
    color: 'var(--text-muted)',
    lineHeight: 1.45,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    transition: 'border-color 0.12s ease',
  },
  cardPinned: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--bg-surface)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
  },
  cardKindBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    minWidth: 0,
    overflow: 'hidden',
  },
  cardMetaText: {
    fontSize: '10.5px',
    fontWeight: 400,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  cardActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  cardActionBtnPinned: {
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-subtle)',
  },
  cardActionBtnSuccess: {
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
  },
  imagePreviewWrap: {
    width: '100%',
    maxHeight: '150px',
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  imagePreview: {
    maxWidth: '100%',
    maxHeight: '146px',
    objectFit: 'contain',
    display: 'block',
  },
  textPreviewBox: {
    fontSize: '11.5px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 8px',
    maxHeight: '88px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    cursor: 'pointer',
    userSelect: 'text',
  },
  filesListBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 8px',
    cursor: 'pointer',
  },
  fileRowItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '11.5px',
  },
  fileName: {
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  filePathHint: {
    fontSize: '10.5px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '140px',
  },
  moreFilesHint: {
    fontSize: '10.5px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    marginTop: '2px',
  },
};
