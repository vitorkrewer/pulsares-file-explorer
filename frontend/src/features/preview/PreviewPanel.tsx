import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  ExternalLink,
  FileCode2,
  Database,
  Music,
  Film,
  Repeat,
  PictureInPicture2,
  ChevronLeft,
  ChevronRight,
  Presentation,
  List,
  MonitorPlay,
  Search,
  MessageSquareText,
} from 'lucide-react';
import { usePreviewStore } from './store';
import { useBrowserStore } from '../browser/store';
import { useEditorStore } from '../editor/store';
import { useDBStudioStore, isDatabaseFile } from '../db-studio/store';
import { formatBytes, formatDate } from '../../i18n/format';
import { openPath, PreviewData, PresentationSlide } from '../../lib/wails';
import { FileTypeIcon, getFileTypeVisual } from '../../ui/FileTypeIcon';

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

const MediaPlayerSection: React.FC<{ data: PreviewData }> = ({ data }) => {
  const isAudio = data.mimeType.startsWith('audio/');
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);

  const mediaSrc =
    data.dataUri || `/__localmedia?path=${encodeURIComponent(data.path)}`;

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (mediaRef.current) {
      mediaRef.current.playbackRate = newSpeed;
    }
  };

  const handleToggleLoop = () => {
    const next = !loop;
    setLoop(next);
    if (mediaRef.current) {
      mediaRef.current.loop = next;
    }
  };

  const handlePiP = async () => {
    const videoEl = mediaRef.current as HTMLVideoElement | null;
    if (!videoEl || isAudio) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (typeof videoEl.requestPictureInPicture === 'function') {
        await videoEl.requestPictureInPicture();
      }
    } catch {
      // Ignora caso o navegador não suporte PiP
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        gap: 12,
      }}
    >
      {isAudio ? (
        <div
          style={{
            width: '100%',
            padding: '22px 16px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.14) 0%, rgba(124, 58, 237, 0.14) 100%)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(37, 99, 235, 0.35)',
            }}
          >
            <Music size={24} color="#fff" />
          </div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              textAlign: 'center',
              wordBreak: 'break-word',
              color: 'var(--text-primary)',
            }}
          >
            {data.name}
          </div>
          <audio
            ref={(el) => {
              mediaRef.current = el;
            }}
            controls
            preload="metadata"
            src={mediaSrc}
            style={{ width: '100%', marginTop: 4 }}
          />
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#000',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            ref={(el) => {
              mediaRef.current = el;
            }}
            controls
            preload="metadata"
            src={mediaSrc}
            style={{ width: '100%', maxHeight: 380, display: 'block' }}
          />
        </div>
      )}

      {/* Barra de controles avançados de reprodução */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {isAudio ? <Music size={12} /> : <Film size={12} />} Velocidade:
        </span>
        {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => handleSpeedChange(rate)}
            style={{
              padding: '2px 6px',
              fontSize: 10.5,
              borderRadius: 4,
              border: '1px solid var(--border-subtle)',
              background: speed === rate ? 'var(--accent-primary)' : 'var(--bg-elevated)',
              color: speed === rate ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: speed === rate ? 700 : 500,
            }}
          >
            {rate}x
          </button>
        ))}

        <button
          type="button"
          onClick={handleToggleLoop}
          title="Repetir mídia em loop"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 7px',
            fontSize: 10.5,
            borderRadius: 4,
            border: '1px solid var(--border-subtle)',
            background: loop ? 'var(--accent-primary)' : 'var(--bg-elevated)',
            color: loop ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Repeat size={11} /> Loop
        </button>

        {!isAudio && (
          <button
            type="button"
            onClick={() => void handlePiP()}
            title="Picture-in-Picture (Janela flutuante de vídeo)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 7px',
              fontSize: 10.5,
              borderRadius: 4,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <PictureInPicture2 size={11} /> PiP
          </button>
        )}
      </div>
    </div>
  );
};

const PresentationPreviewSection: React.FC<{ data: PreviewData }> = ({ data }) => {
  const slides: PresentationSlide[] = data.slides || [];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'slide' | 'outline'>('slide');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setCurrentIdx(0);
    setSearchQuery('');
  }, [data.path]);

  const ext = (data.extension || '').toLowerCase();
  const isOpenDocument = ext === 'odp' || ext === 'otp' || ext === 'fodp';
  const suiteLabel = isOpenDocument ? 'LibreOffice Impress (ODF)' : 'Microsoft PowerPoint';
  const accentColor = isOpenDocument ? '#ea580c' : '#d946ef';
  const accentGradient = isOpenDocument
    ? 'linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)'
    : 'linear-gradient(135deg, #ea580c 0%, #e11d48 100%)';

  const safeIdx = Math.min(Math.max(0, currentIdx), Math.max(0, slides.length - 1));
  const activeSlide = slides[safeIdx] || null;

  const filteredSlides = slides.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    if (s.title?.toLowerCase().includes(q)) return true;
    if (s.subtitle?.toLowerCase().includes(q)) return true;
    if (s.notes?.toLowerCase().includes(q)) return true;
    return (s.bullets || []).some((b) => b.toLowerCase().includes(q));
  });

  if (slides.length === 0) {
    return (
      <div style={styles.placeholderBox}>
        <Presentation size={38} color="#ea580c" />
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
          {suiteLabel}
        </div>
        {data.dataUri ? (
          <img
            src={data.dataUri}
            alt={data.name}
            style={{
              maxWidth: '100%',
              maxHeight: 220,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
            }}
          />
        ) : (
          <p style={{ margin: 0 }}>Nenhum slide estruturado pôde ser extraído deste arquivo.</p>
        )}
        <button
          type="button"
          style={styles.openExternalBtn}
          onClick={() => void openPath(data.path)}
        >
          <ExternalLink size={13} />
          <span>Abrir no Aplicativo Padrão</span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: 10,
        gap: 10,
        overflowY: 'auto',
      }}
    >
      {/* Barra superior do player de apresentação */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          flexWrap: 'wrap',
          padding: '6px 8px',
          borderRadius: 6,
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 7px',
              borderRadius: 4,
              background: accentGradient,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.03em',
            }}
          >
            <Presentation size={11} />
            {ext.toUpperCase() || 'SLIDES'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {slides.length} {slides.length === 1 ? 'slide' : 'slides'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={() => setViewMode('slide')}
            title="Modo Apresentação (Slide 16:9)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 7px',
              fontSize: 10.5,
              fontWeight: 600,
              borderRadius: 4,
              border: '1px solid var(--border-subtle)',
              backgroundColor: viewMode === 'slide' ? 'var(--accent-primary)' : 'transparent',
              color: viewMode === 'slide' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <MonitorPlay size={11} />
            <span>Slide</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('outline')}
            title="Modo Roteiro (Todos os slides)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 7px',
              fontSize: 10.5,
              fontWeight: 600,
              borderRadius: 4,
              border: '1px solid var(--border-subtle)',
              backgroundColor: viewMode === 'outline' ? 'var(--accent-primary)' : 'transparent',
              color: viewMode === 'outline' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <List size={11} />
            <span>Roteiro</span>
          </button>
        </div>
      </div>

      {viewMode === 'slide' && activeSlide ? (
        <>
          {/* Palco 16:9 do Slide Atual */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              minHeight: 195,
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
              background:
                'linear-gradient(160deg, var(--bg-base) 0%, var(--bg-elevated) 100%)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Faixa superior decorativa da suíte */}
            <div
              style={{
                height: 4,
                width: '100%',
                background: accentGradient,
                flexShrink: 0,
              }}
            />

            <div
              style={{
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                flex: 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#ea580c',
                  }}
                >
                  Slide {activeSlide.index} de {slides.length}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {suiteLabel}
                </span>
              </div>

              <div
                style={{
                  fontSize: 14.5,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  lineHeight: 1.3,
                  borderBottom: activeSlide.subtitle || (activeSlide.bullets && activeSlide.bullets.length > 0)
                    ? '1px solid var(--border-subtle)'
                    : 'none',
                  paddingBottom: 6,
                }}
              >
                {activeSlide.title || `Slide ${activeSlide.index}`}
              </div>

              {activeSlide.subtitle && (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.35,
                  }}
                >
                  {activeSlide.subtitle}
                </div>
              )}

              {activeSlide.bullets && activeSlide.bullets.length > 0 && (
                <ul
                  style={{
                    margin: '2px 0 0',
                    paddingLeft: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {activeSlide.bullets.map((b, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-primary)',
                        lineHeight: 1.45,
                      }}
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {/* Imagens embutidas no slide (ou miniatura de capa no slide 1) */}
              {activeSlide.images && activeSlide.images.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginTop: 6,
                    justifyContent: 'center',
                  }}
                >
                  {activeSlide.images.map((imgSrc, i) => (
                    <img
                      key={i}
                      src={imgSrc}
                      alt={`Slide ${activeSlide.index} figura ${i + 1}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: 160,
                        objectFit: 'contain',
                        borderRadius: 6,
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: 'rgba(0,0,0,0.12)',
                      }}
                    />
                  ))}
                </div>
              ) : safeIdx === 0 && data.dataUri ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                  <img
                    src={data.dataUri}
                    alt={data.name}
                    style={{
                      maxWidth: '100%',
                      maxHeight: 140,
                      objectFit: 'contain',
                      borderRadius: 6,
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Controles Anterior / Próximo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}
          >
            <button
              type="button"
              disabled={safeIdx <= 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 5,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)',
                color: safeIdx <= 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: safeIdx <= 0 ? 'not-allowed' : 'pointer',
                opacity: safeIdx <= 0 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={13} />
              <span>Anterior</span>
            </button>

            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {safeIdx + 1} / {slides.length}
            </span>

            <button
              type="button"
              disabled={safeIdx >= slides.length - 1}
              onClick={() => setCurrentIdx((i) => Math.min(slides.length - 1, i + 1))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 5,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)',
                color:
                  safeIdx >= slides.length - 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: safeIdx >= slides.length - 1 ? 'not-allowed' : 'pointer',
                opacity: safeIdx >= slides.length - 1 ? 0.5 : 1,
              }}
            >
              <span>Próximo</span>
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Tira seletora rápida de slides */}
          {slides.length > 1 && (
            <div
              style={{
                display: 'flex',
                gap: 4,
                overflowX: 'auto',
                paddingBottom: 4,
              }}
            >
              {slides.map((s, idx) => {
                const active = idx === safeIdx;
                return (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    title={`Slide ${s.index}: ${s.title}`}
                    style={{
                      minWidth: 26,
                      height: 24,
                      padding: '0 6px',
                      borderRadius: 4,
                      border: active
                        ? '1px solid #ea580c'
                        : '1px solid var(--border-subtle)',
                      backgroundColor: active
                        ? 'rgba(234, 88, 12, 0.18)'
                        : 'var(--bg-elevated)',
                      color: active ? '#ea580c' : 'var(--text-secondary)',
                      fontSize: 10.5,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {s.index}
                  </button>
                );
              })}
            </div>
          )}

          {/* Notas do Apresentador */}
          {activeSlide.notes && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: accentColor,
                  textTransform: 'uppercase',
                }}
              >
                <MessageSquareText size={12} />
                <span>Notas do Apresentador</span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {activeSlide.notes}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Modo Roteiro / Lista Completa com busca */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 5,
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-base)',
            }}
          >
            <Search size={12} color="var(--text-muted)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar slides por título ou conteúdo..."
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 11.5,
                outline: 'none',
              }}
            />
          </div>

          {filteredSlides.map((s) => (
            <div
              key={s.index}
              onClick={() => {
                setCurrentIdx(s.index - 1);
                setViewMode('slide');
              }}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    padding: '1px 5px',
                    borderRadius: 3,
                    backgroundColor: 'rgba(234, 88, 12, 0.16)',
                    color: '#ea580c',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  #{s.index}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {s.title}
                </span>
              </div>
              {s.subtitle && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {s.subtitle}
                </div>
              )}
              {s.bullets && s.bullets.length > 0 && (
                <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
                  {s.bullets.slice(0, 4).map((b, idx) => (
                    <li
                      key={idx}
                      style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Botão para abrir no PowerPoint / LibreOffice Impress */}
      <button
        type="button"
        style={{ ...styles.openExternalBtn, alignSelf: 'center', marginTop: 2 }}
        onClick={() => void openPath(data.path)}
      >
        <ExternalLink size={13} />
        <span>Abrir no {isOpenDocument ? 'LibreOffice / App Padrão' : 'PowerPoint / App Padrão'}</span>
      </button>
    </div>
  );
};

const PreviewBody: React.FC<{
  data: PreviewData;
  imageZoom: number;
  setImageZoom: (z: number) => void;
  language: string;
}> = ({ data, imageZoom, setImageZoom, language }) => {
  const { t } = useTranslation('common');
  const isDb = data.kind === 'database' || isDatabaseFile(data.path);
  const typeVisual = getFileTypeVisual(data.name, data.kind === 'folder' ? 'dir' : 'file');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Metadados do item */}
      <div style={styles.metaBar}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <FileTypeIcon
              name={data.name}
              kind={data.kind === 'folder' ? 'dir' : 'file'}
              size={16}
            />
            <div style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }}>{data.name}</div>
          </div>
          {(data.kind === 'markdown' || data.kind === 'code' || data.kind === 'text') && (
            <button
              type="button"
              onClick={() => void useEditorStore.getState().openFileInEditor(data.path)}
              title="Editar no Pulsares Studio"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid var(--accent-primary)',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent-text)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <FileCode2 size={12} />
              <span>Editar</span>
            </button>
          )}
          {isDb && (
            <button
              type="button"
              onClick={() => void useDBStudioStore.getState().openDatabase(data.path)}
              title="Abrir no Pulsares DB Studio"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid #10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Database size={12} />
              <span>DB Studio</span>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          {data.kind === 'folder'
            ? `${typeVisual.typeLabel} · ${t('preview.folderItems', { count: data.childCount ?? 0 })}`
            : `${typeVisual.typeLabel} · ${formatBytes(data.size, language)} · ${formatDate(data.modTime, language)}`}
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

        {data.kind === 'media' && <MediaPlayerSection data={data} />}

        {data.kind === 'presentation' && <PresentationPreviewSection data={data} />}

        {isDb && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              gap: 12,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #059669 0%, #0284c7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 18px rgba(5, 150, 105, 0.35)',
              }}
            >
              <Database size={22} color="#fff" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>
              Banco de Dados SQLite
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 240, lineHeight: 1.45 }}>
              Inspecione tabelas, views, índices, filtre registros e execute consultas SQL no Pulsares DB Studio.
            </div>
            <button
              type="button"
              onClick={() => void useDBStudioStore.getState().openDatabase(data.path)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 6,
                border: 'none',
                background: 'linear-gradient(135deg, #059669 0%, #0284c7 100%)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
              }}
            >
              <Database size={14} />
              <span>Abrir no Pulsares DB Studio</span>
            </button>
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

        {!isDb && (data.kind === 'binary' || data.kind === 'folder') && (
          <div style={styles.placeholderBox}>
            <FileTypeIcon
              name={data.name}
              kind={data.kind === 'folder' ? 'dir' : 'file'}
              size={40}
            />
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
              {typeVisual.typeLabel}
            </div>
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

