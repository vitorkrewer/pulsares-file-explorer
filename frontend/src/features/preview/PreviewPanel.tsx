import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut, RotateCcw, X, ExternalLink } from 'lucide-react';
import { usePreviewStore } from './store';
import { useBrowserStore } from '../browser/store';
import { formatBytes, formatDate } from '../../i18n/format';
import { openPath, PreviewData } from '../../lib/wails';

function renderSimpleMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('### ')) {
      return (
        <h4 key={i} style={{ margin: '10px 0 4px', fontSize: 13 }}>
          {line.slice(4)}
        </h4>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h3 key={i} style={{ margin: '12px 0 6px', fontSize: 15 }}>
          {line.slice(3)}
        </h3>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <h2 key={i} style={{ margin: '14px 0 8px', fontSize: 17 }}>
          {line.slice(2)}
        </h2>
      );
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <li key={i} style={{ marginLeft: 16, fontSize: 12, lineHeight: 1.5 }}>
          {line.slice(2)}
        </li>
      );
    }
    return (
      <p key={i} style={{ margin: '4px 0', fontSize: 12, lineHeight: 1.5 }}>
        {line}
      </p>
    );
  });
}

const PreviewBody: React.FC<{
  data: PreviewData;
  imageZoom: number;
  setImageZoom: (z: number) => void;
  language: string;
}> = ({ data, imageZoom, setImageZoom, language }) => {
  const { t } = useTranslation('common');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Metadados do item */}
      <div style={styles.metaBar}>
        <div style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }}>{data.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          {data.kind === 'folder'
            ? t('preview.folderItems', { count: data.childCount ?? 0 })
            : `${formatBytes(data.size, language)} · ${formatDate(data.modTime, language)}`}
        </div>
        {data.imageWidth && data.imageHeight ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {data.imageWidth} × {data.imageHeight} px
          </div>
        ) : null}
      </div>

      {/* Conteúdo principal da prévia */}
      <div style={styles.contentArea}>
        {data.kind === 'image' && data.dataUri && (
          <div style={styles.imagePreviewContainer}>
            <div style={styles.zoomBar}>
              <button
                type="button"
                style={styles.iconBtn}
                onClick={() => setImageZoom(imageZoom - 0.25)}
                title={t('preview.zoomOut')}
              >
                <ZoomOut size={13} />
              </button>
              <span style={{ fontSize: 11 }}>{Math.round(imageZoom * 100)}%</span>
              <button
                type="button"
                style={styles.iconBtn}
                onClick={() => setImageZoom(imageZoom + 0.25)}
                title={t('preview.zoomIn')}
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                style={styles.iconBtn}
                onClick={() => setImageZoom(1)}
                title={t('preview.zoomReset')}
              >
                <RotateCcw size={13} />
              </button>
            </div>
            <div style={styles.imageCanvas}>
              <img
                src={data.dataUri}
                alt={data.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  transform: `scale(${imageZoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.1s ease-out',
                }}
              />
            </div>
          </div>
        )}

        {data.kind === 'markdown' && (
          <div style={styles.markdownBox}>
            {renderSimpleMarkdown(data.textContent || '')}
            {data.truncated && <div style={styles.truncatedNote}>{t('preview.truncated')}</div>}
          </div>
        )}

        {(data.kind === 'code' || data.kind === 'text') && (
          <div style={styles.codeBox}>
            <pre style={styles.preBlock}>{data.textContent || ''}</pre>
            {data.truncated && <div style={styles.truncatedNote}>{t('preview.truncated')}</div>}
          </div>
        )}

        {data.kind === 'media' && data.dataUri && (
          <div style={styles.mediaBox}>
            {data.mimeType.startsWith('audio/') ? (
              <audio controls src={data.dataUri} style={{ width: '100%' }} />
            ) : (
              <video controls src={data.dataUri} style={{ maxWidth: '100%', maxHeight: 340 }} />
            )}
          </div>
        )}

        {data.kind === 'pdf' && (
          <div style={styles.mediaBox}>
            {data.dataUri ? (
              <iframe
                src={data.dataUri}
                title={data.name}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            ) : (
              <div style={styles.placeholderBox}>{t('preview.noPreview')}</div>
            )}
          </div>
        )}

        {(data.kind === 'binary' || data.kind === 'folder') && (
          <div style={styles.placeholderBox}>
            <p style={{ margin: 0 }}>{t('preview.noPreview')}</p>
            <button
              type="button"
              style={styles.openExternalBtn}
              onClick={() => void openPath(data.path)}
            >
              <ExternalLink size={13} />
              <span>{t('preview.openDefault')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const PreviewPanel: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const { selectedPaths } = useBrowserStore();
  const {
    previewPanelOpen,
    quickLookOpen,
    previewData,
    previewLoading,
    imageZoom,
    setImageZoom,
    togglePreviewPanel,
    closeQuickLook,
    loadPreview,
  } = usePreviewStore();

  const selectedFirst = Array.from(selectedPaths)[0] || null;

  useEffect(() => {
    if (!previewPanelOpen && !quickLookOpen) return;
    void loadPreview(selectedFirst);
  }, [selectedFirst, previewPanelOpen, quickLookOpen, loadPreview]);

  return (
    <>
      {previewPanelOpen && (
        <aside style={styles.sidePanel} aria-label={t('preview.title')}>
          <div style={styles.header}>
            <span style={styles.headerTitle}>{t('preview.title')}</span>
            <button
              type="button"
              style={styles.iconBtn}
              onClick={togglePreviewPanel}
              title={t('ops.cancel')}
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {previewLoading ? (
              <div style={styles.placeholderBox}>{t('tree.loading')}</div>
            ) : previewData ? (
              <PreviewBody
                data={previewData}
                imageZoom={imageZoom}
                setImageZoom={setImageZoom}
                language={i18n.language}
              />
            ) : (
              <div style={styles.placeholderBox}>{t('preview.selectItem')}</div>
            )}
          </div>
        </aside>
      )}

      {/* Modal Quick Look em tela cheia (acionado com Espaço) */}
      {quickLookOpen && previewData && (
        <div
          role="dialog"
          aria-modal="true"
          style={styles.quickLookBackdrop}
          onClick={closeQuickLook}
        >
          <div style={styles.quickLookDialog} onClick={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              <span style={styles.headerTitle}>
                {t('preview.quickLook')} — {previewData.name}
              </span>
              <button type="button" style={styles.iconBtn} onClick={closeQuickLook}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <PreviewBody
                data={previewData}
                imageZoom={imageZoom}
                setImageZoom={setImageZoom}
                language={i18n.language}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidePanel: {
    width: 310,
    minWidth: 250,
    maxWidth: 420,
    height: '100%',
    borderLeft: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
  },
  metaBar: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
  },
  contentArea: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  imagePreviewContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  zoomBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 6,
    borderBottom: '1px solid var(--border-subtle)',
  },
  imageCanvas: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    padding: 12,
  },
  markdownBox: {
    padding: 12,
    color: 'var(--text-primary)',
    overflowY: 'auto',
  },
  codeBox: {
    padding: 12,
    overflow: 'auto',
    flex: 1,
  },
  preBlock: {
    margin: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    color: 'var(--text-primary)',
  },
  truncatedNote: {
    marginTop: 8,
    padding: '4px 8px',
    borderRadius: 4,
    backgroundColor: 'var(--bg-elevated)',
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  mediaBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  placeholderBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    fontSize: 12,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  openExternalBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 4,
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
    fontSize: 12,
    cursor: 'pointer',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 4,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  quickLookBackdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  quickLookDialog: {
    width: '76vw',
    maxWidth: 920,
    height: '78vh',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
  },
};
