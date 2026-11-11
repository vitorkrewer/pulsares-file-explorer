import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Film,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  Maximize2,
  Music,
  PanelLeft,
  RefreshCw,
  Repeat,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { EditorTab, isStudioAudioVideoFile, useEditorStore } from './store';
import {
  getPreview,
  openPath,
  revealInSystemExplorer,
  setNativeClipboardImage,
} from '../../lib/wails';
import { SoftSelect, SoftSelectOption } from '../../ui/SoftSelect';

interface StudioMediaViewerProps {
  tab: EditorTab;
  onSwitchSvgToCode?: () => void;
  onNotify?: (message: string) => void;
}

export function formatStudioMediaBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function computeAspectRatioLabel(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.round(w), Math.round(h)) || 1;
  const rw = Math.round(w / divisor);
  const rh = Math.round(h / divisor);
  if (rw <= 64 && rh <= 64) {
    return `${rw}:${rh}`;
  }
  return `${(w / h).toFixed(2)}:1`;
}

const PDF_ZOOM_OPTIONS: SoftSelectOption[] = [
  { value: 'page-width', label: 'Ajustar largura' },
  { value: 'page-fit', label: 'Ajustar página' },
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' },
  { value: '125', label: '125%' },
  { value: '150', label: '150%' },
  { value: '200', label: '200%' },
  { value: '300', label: '300%' },
];

const PDF_NUMERIC_STEPS = [50, 75, 100, 125, 150, 200, 300];

const IMAGE_ZOOM_OPTIONS: SoftSelectOption[] = [
  { value: 'fit', label: 'Ajustar à tela' },
  { value: '25', label: '25%' },
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '100', label: '100% (1:1)' },
  { value: '150', label: '150%' },
  { value: '200', label: '200%' },
  { value: '400', label: '400%' },
  { value: '800', label: '800%' },
];

type CanvasBackdrop = 'checker' | 'dark' | 'light';

const StudioPdfViewer: React.FC<{
  tab: EditorTab;
  onNotify?: (message: string) => void;
}> = ({ tab, onNotify }) => {
  const updateTabMediaMeta = useEditorStore((s) => s.updateTabMediaMeta);

  const [baseUrl, setBaseUrl] = useState<string>(
    tab.mediaSrc && !tab.mediaSrc.startsWith('data:')
      ? tab.mediaSrc
      : tab.path
      ? `/__localmedia?path=${encodeURIComponent(tab.path)}`
      : ''
  );
  const [page, setPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>('1');
  const [pageCount, setPageCount] = useState<number>(tab.pageCount || 0);
  const [fileSize, setFileSize] = useState<number>(tab.fileSize || 0);
  const [zoomValue, setZoomValue] = useState<string>('page-width');
  const [showOutline, setShowOutline] = useState<boolean>(false);
  const [reloadSeq, setReloadSeq] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const refreshPdfMetadata = useCallback(
    async (manual = false) => {
      if (!tab.path) return;
      setLoading(true);
      try {
        const prev = await getPreview(tab.path, 4096);
        const liveUrl =
          prev.dataUri || `/__localmedia?path=${encodeURIComponent(tab.path)}`;
        setBaseUrl(liveUrl);
        if (prev.pageCount && prev.pageCount > 0) {
          setPageCount(prev.pageCount);
        }
        if (prev.size && prev.size > 0) {
          setFileSize(prev.size);
        }
        updateTabMediaMeta(tab.id, {
          mediaSrc: liveUrl,
          fileSize: prev.size || tab.fileSize,
          pageCount: prev.pageCount || tab.pageCount,
          mimeType: prev.mimeType || 'application/pdf',
        });
        if (manual) {
          setReloadSeq((n) => n + 1);
          onNotify?.('Documento PDF recarregado');
        }
      } catch {
        setBaseUrl(`/__localmedia?path=${encodeURIComponent(tab.path)}`);
      } finally {
        setLoading(false);
      }
    },
    [onNotify, tab.fileSize, tab.id, tab.pageCount, tab.path, updateTabMediaMeta]
  );

  useEffect(() => {
    setPage(1);
    setPageInput('1');
    setPageCount(tab.pageCount || 0);
    setFileSize(tab.fileSize || 0);
    void refreshPdfMetadata(false);
  }, [tab.path, refreshPdfMetadata, tab.pageCount, tab.fileSize]);

  const applyPage = (target: number) => {
    const maxP = pageCount > 0 ? pageCount : 9999;
    const clamped = Math.max(1, Math.min(maxP, Math.floor(target) || 1));
    setPage(clamped);
    setPageInput(String(clamped));
  };

  const stepPdfZoom = (dir: -1 | 1) => {
    const currentNum = Number(zoomValue);
    if (!Number.isFinite(currentNum) || currentNum <= 0) {
      setZoomValue(dir > 0 ? '125' : '75');
      return;
    }
    if (dir > 0) {
      const next = PDF_NUMERIC_STEPS.find((s) => s > currentNum) ?? 300;
      setZoomValue(String(next));
    } else {
      const prev =
        [...PDF_NUMERIC_STEPS].reverse().find((s) => s < currentNum) ?? 50;
      setZoomValue(String(prev));
    }
  };

  const computedPdfSrc = useMemo(() => {
    if (!baseUrl) return '';
    if (baseUrl.startsWith('data:')) return baseUrl;
    const sep = baseUrl.includes('?') ? '&' : '?';
    const withCacheBust =
      reloadSeq > 0 ? `${baseUrl}${sep}v=${reloadSeq}` : baseUrl;
    const navPanes = showOutline ? 1 : 0;
    const pageMode = showOutline ? '&pagemode=thumbs' : '&pagemode=none';
    return `${withCacheBust}#page=${page}&zoom=${zoomValue}&navpanes=${navPanes}${pageMode}&toolbar=1`;
  }, [baseUrl, page, reloadSeq, showOutline, zoomValue]);

  const iframeKey = `${tab.path}|${page}|${zoomValue}|${showOutline ? 1 : 0}|${reloadSeq}`;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        backgroundColor: 'var(--bg-app)',
      }}
    >
      {/* Barra de controles do renderizador de PDF */}
      <div style={toolbarBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              ...badgePillStyle,
              backgroundColor: 'rgba(220, 38, 38, 0.14)',
              color: '#ef4444',
              borderColor: 'rgba(220, 38, 38, 0.3)',
            }}
          >
            <FileText size={12} />
            <span>PDF</span>
          </span>
          {pageCount > 0 && (
            <span style={metaTextStyle}>
              {pageCount} {pageCount === 1 ? 'página' : 'páginas'}
            </span>
          )}
          {fileSize > 0 && (
            <span style={metaTextStyle}>{formatStudioMediaBytes(fileSize)}</span>
          )}
        </div>

        {/* Navegação de páginas e zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={segmentedGroupStyle}>
            <button
              type="button"
              onClick={() => applyPage(page - 1)}
              disabled={page <= 1}
              title="Página anterior"
              style={{
                ...iconToolBtnStyle,
                opacity: page <= 1 ? 0.45 : 1,
              }}
            >
              <ChevronLeft size={13} />
            </button>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0 6px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
              }}
            >
              <span>Pág.</span>
              <input
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => applyPage(Number(pageInput) || 1)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    applyPage(Number(pageInput) || 1);
                  }
                }}
                aria-label="Número da página"
                style={{
                  width: '36px',
                  padding: '1px 4px',
                  textAlign: 'center',
                  fontSize: '11px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
              {pageCount > 0 && <span>/ {pageCount}</span>}
            </div>
            <button
              type="button"
              onClick={() => applyPage(page + 1)}
              disabled={pageCount > 0 && page >= pageCount}
              title="Próxima página"
              style={{
                ...iconToolBtnStyle,
                opacity: pageCount > 0 && page >= pageCount ? 0.45 : 1,
              }}
            >
              <ChevronRight size={13} />
            </button>
          </div>

          <div style={dividerStyle} />

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() => stepPdfZoom(-1)}
              title="Reduzir zoom do documento"
              style={actionBtnStyle}
            >
              <ZoomOut size={13} />
            </button>
            <SoftSelect
              size="sm"
              value={zoomValue}
              options={PDF_ZOOM_OPTIONS}
              onChange={(val) => setZoomValue(val)}
              ariaLabel="Zoom do PDF"
              minMenuWidth={148}
              style={{ minWidth: '126px' }}
            />
            <button
              type="button"
              onClick={() => stepPdfZoom(1)}
              title="Ampliar zoom do documento"
              style={actionBtnStyle}
            >
              <ZoomIn size={13} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowOutline((v) => !v)}
            title="Alternar painel lateral de miniaturas e sumário do PDF"
            style={{
              ...actionBtnStyle,
              borderColor: showOutline ? 'var(--accent-primary)' : 'var(--border-subtle)',
              backgroundColor: showOutline ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              color: showOutline ? 'var(--accent-text)' : 'var(--text-primary)',
            }}
          >
            <PanelLeft size={13} />
            <span>Miniaturas</span>
          </button>
        </div>

        {/* Ações rápidas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button
            type="button"
            onClick={() => void refreshPdfMetadata(true)}
            title="Recarregar arquivo PDF do disco"
            style={actionBtnStyle}
          >
            <RefreshCw size={13} style={{ opacity: loading ? 0.5 : 1 }} />
            <span>Recarregar</span>
          </button>
          {tab.path && (
            <>
              <button
                type="button"
                onClick={() => void revealInSystemExplorer(tab.path)}
                title="Mostrar arquivo na pasta do sistema"
                style={actionBtnStyle}
              >
                <FolderOpen size={13} />
              </button>
              <button
                type="button"
                onClick={() => void openPath(tab.path)}
                title="Abrir no leitor padrão do sistema"
                style={actionBtnStyle}
              >
                <ExternalLink size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Área principal do documento PDF */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          backgroundColor: '#323639',
        }}
      >
        {computedPdfSrc ? (
          <iframe
            key={iframeKey}
            src={computedPdfSrc}
            title={tab.name}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
              backgroundColor: '#323639',
            }}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#e2e8f0',
              fontSize: '13px',
            }}
          >
            Carregando documento PDF...
          </div>
        )}
      </div>
    </div>
  );
};

const StudioImageViewer: React.FC<{
  tab: EditorTab;
  onSwitchSvgToCode?: () => void;
  onNotify?: (message: string) => void;
}> = ({ tab, onSwitchSvgToCode, onNotify }) => {
  const updateTabMediaMeta = useEditorStore((s) => s.updateTabMediaMeta);
  const isSvg = tab.name.toLowerCase().endsWith('.svg');

  const [resolvedSrc, setResolvedSrc] = useState<string>(tab.mediaSrc || '');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({
    w: tab.imageWidth || 0,
    h: tab.imageHeight || 0,
  });
  const [fileSize, setFileSize] = useState<number>(tab.fileSize || 0);
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [flipV, setFlipV] = useState<boolean>(false);
  const [pixelated, setPixelated] = useState<boolean>(false);
  const [backdrop, setBackdrop] = useState<CanvasBackdrop>('checker');
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragOriginRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const loadFreshImage = useCallback(
    async (manual = false) => {
      setLoadError(false);
      if (isSvg && tab.content.trim()) {
        const liveSvgUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
          tab.content
        )}`;
        setResolvedSrc(liveSvgUri);
        setFileSize(new Blob([tab.content]).size);
        if (manual) onNotify?.('Visualização SVG atualizada');
        return;
      }
      if (!tab.path) return;
      try {
        const prev = await getPreview(tab.path, 4096);
        let nextSrc =
          prev.dataUri || `/__localmedia?path=${encodeURIComponent(tab.path)}`;
        if (manual && !nextSrc.startsWith('data:')) {
          nextSrc += `${nextSrc.includes('?') ? '&' : '?'}v=${Date.now()}`;
        }
        setResolvedSrc(nextSrc);
        if (prev.size && prev.size > 0) setFileSize(prev.size);
        if (prev.imageWidth && prev.imageHeight) {
          setNaturalSize({ w: prev.imageWidth, h: prev.imageHeight });
        }
        updateTabMediaMeta(tab.id, {
          mediaSrc: nextSrc,
          fileSize: prev.size || tab.fileSize,
          imageWidth: prev.imageWidth || tab.imageWidth,
          imageHeight: prev.imageHeight || tab.imageHeight,
          mimeType: prev.mimeType || tab.mimeType,
        });
        if (manual) onNotify?.('Imagem recarregada do disco');
      } catch {
        setResolvedSrc(`/__localmedia?path=${encodeURIComponent(tab.path)}`);
      }
    },
    [
      isSvg,
      onNotify,
      tab.content,
      tab.fileSize,
      tab.id,
      tab.imageHeight,
      tab.imageWidth,
      tab.mimeType,
      tab.path,
      updateTabMediaMeta,
    ]
  );

  useEffect(() => {
    setZoomMode('fit');
    setZoomScale(1);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setPan({ x: 0, y: 0 });
    void loadFreshImage(false);
  }, [tab.path, loadFreshImage]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragOriginRef.current) return;
      const dx = e.clientX - dragOriginRef.current.startX;
      const dy = e.clientY - dragOriginRef.current.startY;
      setPan({
        x: dragOriginRef.current.panX + dx,
        y: dragOriginRef.current.panY + dy,
      });
    };
    const onUp = () => {
      setIsDragging(false);
      dragOriginRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  const applyNumericZoom = (nextScale: number) => {
    const clamped = Math.max(0.1, Math.min(16, Number(nextScale.toFixed(2))));
    setZoomMode('custom');
    setZoomScale(clamped);
  };

  const resetView = () => {
    setZoomMode('fit');
    setZoomScale(1);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setPan({ x: 0, y: 0 });
  };

  const handleSelectZoomOption = (val: string) => {
    if (val === 'fit') {
      setZoomMode('fit');
      setZoomScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const pct = Number(val);
    if (Number.isFinite(pct) && pct > 0) {
      applyNumericZoom(pct / 100);
    }
  };

  const selectDropdownValue = useMemo(() => {
    if (zoomMode === 'fit') return 'fit';
    const pctStr = String(Math.round(zoomScale * 100));
    return IMAGE_ZOOM_OPTIONS.some((o) => o.value === pctStr) ? pctStr : 'custom';
  }, [zoomMode, zoomScale]);

  const dynamicZoomOptions = useMemo<SoftSelectOption[]>(() => {
    if (zoomMode === 'fit') return IMAGE_ZOOM_OPTIONS;
    const pctStr = String(Math.round(zoomScale * 100));
    if (IMAGE_ZOOM_OPTIONS.some((o) => o.value === pctStr)) {
      return IMAGE_ZOOM_OPTIONS;
    }
    return [
      ...IMAGE_ZOOM_OPTIONS,
      { value: 'custom', label: `${Math.round(zoomScale * 100)}%` },
    ];
  }, [zoomMode, zoomScale]);

  const handleCopyImageToClipboard = async () => {
    const imgEl = imgRef.current;
    if (!imgEl || naturalSize.w <= 0 || naturalSize.h <= 0) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = naturalSize.w;
      canvas.height = naturalSize.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(imgEl, 0, 0, naturalSize.w, naturalSize.h);
      const pngDataUrl = canvas.toDataURL('image/png');
      await setNativeClipboardImage(pngDataUrl);
      onNotify?.('Imagem copiada para a área de transferência');
    } catch {
      onNotify?.('Não foi possível copiar os pixels desta imagem');
    }
  };

  const formatBadge = (
    tab.name.split('.').pop() ||
    tab.encoding ||
    'IMG'
  ).toUpperCase();
  const ratioLabel = computeAspectRatioLabel(naturalSize.w, naturalSize.h);

  const canvasBackgroundStyle: React.CSSProperties =
    backdrop === 'checker'
      ? {
          backgroundColor: '#1e293b',
          backgroundImage:
            'linear-gradient(45deg, #0f172a 25%, transparent 25%), linear-gradient(-45deg, #0f172a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0f172a 75%), linear-gradient(-45deg, transparent 75%, #0f172a 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
        }
      : backdrop === 'dark'
      ? { backgroundColor: '#09090b' }
      : { backgroundColor: '#f8fafc' };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        backgroundColor: 'var(--bg-app)',
      }}
    >
      {/* Barra de inspeção e ferramentas de imagem */}
      <div style={toolbarBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              ...badgePillStyle,
              backgroundColor: 'rgba(37, 99, 235, 0.14)',
              color: 'var(--accent)',
              borderColor: 'rgba(37, 99, 235, 0.3)',
            }}
          >
            <ImageIcon size={12} />
            <span>{formatBadge}</span>
          </span>
          {naturalSize.w > 0 && naturalSize.h > 0 && (
            <span style={{ ...metaTextStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
              {naturalSize.w} × {naturalSize.h} px
            </span>
          )}
          {ratioLabel && <span style={metaTextStyle}>({ratioLabel})</span>}
          {fileSize > 0 && (
            <span style={metaTextStyle}>{formatStudioMediaBytes(fileSize)}</span>
          )}
        </div>

        {/* Controles centrais: Zoom, Transformação, Nitidez e Fundo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() =>
                applyNumericZoom((zoomMode === 'fit' ? 1 : zoomScale) * 0.8)
              }
              title="Reduzir zoom"
              style={actionBtnStyle}
            >
              <ZoomOut size={13} />
            </button>
            <SoftSelect
              size="sm"
              value={selectDropdownValue}
              options={dynamicZoomOptions}
              onChange={handleSelectZoomOption}
              ariaLabel="Nível de zoom da imagem"
              minMenuWidth={145}
              style={{ minWidth: '126px' }}
            />
            <button
              type="button"
              onClick={() =>
                applyNumericZoom((zoomMode === 'fit' ? 1 : zoomScale) * 1.25)
              }
              title="Ampliar zoom"
              style={actionBtnStyle}
            >
              <ZoomIn size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomMode('custom');
                setZoomScale(1);
                setPan({ x: 0, y: 0 });
              }}
              title="Tamanho real 1:1 (100%)"
              style={{
                ...actionBtnStyle,
                fontWeight: 600,
                borderColor:
                  zoomMode === 'custom' && Math.abs(zoomScale - 1) < 0.01
                    ? 'var(--accent-primary)'
                    : 'var(--border-subtle)',
              }}
            >
              1:1
            </button>
            <button
              type="button"
              onClick={resetView}
              title="Ajustar à tela e redefinir transformações"
              style={actionBtnStyle}
            >
              <Maximize2 size={12} />
            </button>
          </div>

          <div style={dividerStyle} />

          {/* Rotação e espelhamento */}
          <div style={segmentedGroupStyle}>
            <button
              type="button"
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              title="Girar 90° à esquerda"
              style={iconToolBtnStyle}
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              title="Girar 90° à direita"
              style={iconToolBtnStyle}
            >
              <RotateCw size={13} />
            </button>
            <button
              type="button"
              onClick={() => setFlipH((v) => !v)}
              title="Espelhar horizontalmente"
              style={{
                ...iconToolBtnStyle,
                color: flipH ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              <FlipHorizontal2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => setFlipV((v) => !v)}
              title="Espelhar verticalmente"
              style={{
                ...iconToolBtnStyle,
                color: flipV ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              <FlipVertical2 size={13} />
            </button>
          </div>

          {/* Modo Pixel Art */}
          <button
            type="button"
            onClick={() => setPixelated((v) => !v)}
            title="Alternar interpolação nítida de pixels (ideal para ícones e sprites)"
            style={{
              ...actionBtnStyle,
              borderColor: pixelated ? 'var(--accent-primary)' : 'var(--border-subtle)',
              backgroundColor: pixelated ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              color: pixelated ? 'var(--accent-text)' : 'var(--text-primary)',
            }}
          >
            <Grid3X3 size={12} />
            <span>Pixels</span>
          </button>

          {/* Seletor de fundo (Quadriculado / Escuro / Claro) */}
          <div style={segmentedGroupStyle} title="Cor de fundo do palco de inspeção">
            {(
              [
                { id: 'checker', label: 'Transp.' },
                { id: 'dark', label: 'Escuro' },
                { id: 'light', label: 'Claro' },
              ] as const
            ).map((bg) => {
              const active = backdrop === bg.id;
              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setBackdrop(bg.id)}
                  style={{
                    ...iconToolBtnStyle,
                    padding: '3px 7px',
                    fontSize: '10px',
                    fontWeight: active ? 700 : 500,
                    backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  {bg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ações direitas (Editar Código SVG / Copiar / Recarregar / Abrir) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {isSvg && onSwitchSvgToCode && (
            <button
              type="button"
              onClick={onSwitchSvgToCode}
              title="Alternar para o editor de código XML deste arquivo SVG"
              style={{
                ...actionBtnStyle,
                borderColor: 'var(--accent-primary)',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent-text)',
                fontWeight: 600,
              }}
            >
              <Code2 size={13} />
              <span>Código SVG</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleCopyImageToClipboard()}
            title="Copiar imagem para a área de transferência"
            style={actionBtnStyle}
          >
            <Copy size={13} />
            <span>Copiar</span>
          </button>
          <button
            type="button"
            onClick={() => void loadFreshImage(true)}
            title="Recarregar imagem do disco"
            style={actionBtnStyle}
          >
            <RefreshCw size={13} />
          </button>
          {tab.path && (
            <>
              <button
                type="button"
                onClick={() => void revealInSystemExplorer(tab.path)}
                title="Mostrar na pasta"
                style={actionBtnStyle}
              >
                <FolderOpen size={13} />
              </button>
              <button
                type="button"
                onClick={() => void openPath(tab.path)}
                title="Abrir no visualizador externo do sistema"
                style={actionBtnStyle}
              >
                <ExternalLink size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Palco interativo de inspeção da imagem (suporta roda do mouse para zoom e arrasto para pan) */}
      <div
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          const base = zoomMode === 'fit' ? 1 : zoomScale;
          applyNumericZoom(base * factor);
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          setIsDragging(true);
          dragOriginRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            panX: pan.x,
            panY: pan.y,
          };
        }}
        onDoubleClick={() => {
          if (zoomMode === 'fit') {
            setZoomMode('custom');
            setZoomScale(1);
            setPan({ x: 0, y: 0 });
          } else {
            setZoomMode('fit');
            setZoomScale(1);
            setPan({ x: 0, y: 0 });
          }
        }}
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          ...canvasBackgroundStyle,
        }}
      >
        {loadError ? (
          <div
            style={{
              padding: '16px 22px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
            }}
          >
            Não foi possível renderizar esta imagem ({tab.name}).
          </div>
        ) : resolvedSrc ? (
          <img
            ref={imgRef}
            src={resolvedSrc}
            alt={tab.name}
            draggable={false}
            crossOrigin="anonymous"
            onLoad={(e) => {
              const nw = e.currentTarget.naturalWidth;
              const nh = e.currentTarget.naturalHeight;
              if (nw > 0 && nh > 0) {
                setNaturalSize({ w: nw, h: nh });
                if (nw !== tab.imageWidth || nh !== tab.imageHeight) {
                  updateTabMediaMeta(tab.id, {
                    imageWidth: nw,
                    imageHeight: nh,
                  });
                }
              }
            }}
            onError={() => setLoadError(true)}
            style={{
              maxWidth: zoomMode === 'fit' ? '92%' : 'none',
              maxHeight: zoomMode === 'fit' ? '92%' : 'none',
              width:
                zoomMode === 'custom' && naturalSize.w > 0
                  ? `${Math.max(1, Math.round(naturalSize.w * zoomScale))}px`
                  : undefined,
              height:
                zoomMode === 'custom' && naturalSize.h > 0
                  ? `${Math.max(1, Math.round(naturalSize.h * zoomScale))}px`
                  : undefined,
              objectFit: 'contain',
              imageRendering: pixelated ? 'pixelated' : 'auto',
              transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scaleX(${
                flipH ? -1 : 1
              }) scaleY(${flipV ? -1 : 1})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              boxShadow: '0 10px 32px rgba(0, 0, 0, 0.32)',
            }}
          />
        ) : (
          <div style={{ color: '#cbd5e1', fontSize: '12px' }}>
            Carregando imagem...
          </div>
        )}

        {/* Dica discreta no canto inferior direito */}
        <div
          style={{
            position: 'absolute',
            right: '12px',
            bottom: '10px',
            padding: '3px 9px',
            borderRadius: '999px',
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            color: '#e2e8f0',
            fontSize: '10px',
            pointerEvents: 'none',
            backdropFilter: 'blur(6px)',
          }}
        >
          Roda do mouse: Zoom • Arrastar: Mover • Duplo clique: Ajustar / 1:1
        </div>
      </div>
    </div>
  );
};

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg']);

function formatDurationLabel(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const totalSec = Math.floor(sec);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

const StudioAudioVideoViewer: React.FC<{
  tab: EditorTab;
  onNotify?: (message: string) => void;
}> = ({ tab, onNotify }) => {
  const updateTabMediaMeta = useEditorStore((s) => s.updateTabMediaMeta);
  const ext = (tab.name.split('.').pop() || '').toLowerCase();
  const isAudio = AUDIO_EXTENSIONS.has(ext) && ext !== 'ogv';

  const [streamUrl, setStreamUrl] = useState<string>(
    tab.mediaSrc || (tab.path ? `/__localmedia?path=${encodeURIComponent(tab.path)}` : '')
  );
  const [fileSize, setFileSize] = useState<number>(tab.fileSize || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [loop, setLoop] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({
    w: tab.imageWidth || 0,
    h: tab.imageHeight || 0,
  });
  const [reloadSeq, setReloadSeq] = useState<number>(0);
  const [loadError, setLoadError] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refreshMediaMetadata = useCallback(
    async (manual = false) => {
      if (!tab.path) return;
      setLoadError(false);
      try {
        const prev = await getPreview(tab.path, 4096);
        let liveUrl =
          prev.dataUri || `/__localmedia?path=${encodeURIComponent(tab.path)}`;
        if (manual && !liveUrl.startsWith('data:')) {
          liveUrl += `${liveUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
        }
        setStreamUrl(liveUrl);
        if (prev.size && prev.size > 0) {
          setFileSize(prev.size);
        }
        updateTabMediaMeta(tab.id, {
          mediaSrc: liveUrl,
          fileSize: prev.size || tab.fileSize,
          mimeType: prev.mimeType || tab.mimeType,
        });
        if (manual) {
          setReloadSeq((n) => n + 1);
          onNotify?.('Mídia recarregada do disco');
        }
      } catch {
        setStreamUrl(`/__localmedia?path=${encodeURIComponent(tab.path)}`);
      }
    },
    [onNotify, tab.fileSize, tab.id, tab.mimeType, tab.path, updateTabMediaMeta]
  );

  useEffect(() => {
    setDuration(0);
    setLoadError(false);
    void refreshMediaMetadata(false);
  }, [tab.path, refreshMediaMetadata]);

  const applyPlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const formatBadge = (ext || tab.encoding || (isAudio ? 'AUDIO' : 'VIDEO')).toUpperCase();
  const durationLabel = formatDurationLabel(duration);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        backgroundColor: 'var(--bg-app)',
      }}
    >
      {/* Barra de controles do Inspetor de Áudio e Vídeo */}
      <div style={toolbarBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              ...badgePillStyle,
              backgroundColor: isAudio
                ? 'rgba(168, 85, 247, 0.14)'
                : 'rgba(14, 165, 233, 0.14)',
              color: isAudio ? '#c084fc' : '#38bdf8',
              borderColor: isAudio
                ? 'rgba(168, 85, 247, 0.32)'
                : 'rgba(14, 165, 233, 0.32)',
            }}
          >
            {isAudio ? <Music size={12} /> : <Film size={12} />}
            <span>{formatBadge}</span>
          </span>
          {!isAudio && videoDims.w > 0 && videoDims.h > 0 && (
            <span style={{ ...metaTextStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
              {videoDims.w} × {videoDims.h} px
            </span>
          )}
          {durationLabel && <span style={metaTextStyle}>{durationLabel}</span>}
          {fileSize > 0 && (
            <span style={metaTextStyle}>{formatStudioMediaBytes(fileSize)}</span>
          )}
        </div>

        {/* Controles centrais: Velocidade de Reprodução e Loop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={segmentedGroupStyle} title="Velocidade de reprodução">
            {([0.5, 1, 1.25, 1.5, 2] as const).map((spd) => {
              const active = Math.abs(playbackRate - spd) < 0.01;
              return (
                <button
                  key={spd}
                  type="button"
                  onClick={() => applyPlaybackRate(spd)}
                  style={{
                    ...iconToolBtnStyle,
                    padding: '3px 7px',
                    fontSize: '10px',
                    fontWeight: active ? 700 : 500,
                    backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  }}
                >
                  {spd}x
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setLoop((v) => !v)}
            title="Alternar repetição contínua (Loop)"
            style={{
              ...actionBtnStyle,
              borderColor: loop ? 'var(--accent-primary)' : 'var(--border-subtle)',
              backgroundColor: loop ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              color: loop ? 'var(--accent-text)' : 'var(--text-primary)',
            }}
          >
            <Repeat size={12} />
            <span>Loop</span>
          </button>
        </div>

        {/* Ações direitas (Recarregar, Mostrar na Pasta, Abrir Externamente) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button
            type="button"
            onClick={() => void refreshMediaMetadata(true)}
            title="Recarregar mídia do disco"
            style={actionBtnStyle}
          >
            <RefreshCw size={13} />
            <span>Recarregar</span>
          </button>
          {tab.path && (
            <>
              <button
                type="button"
                onClick={() => void revealInSystemExplorer(tab.path)}
                title="Mostrar na pasta"
                style={actionBtnStyle}
              >
                <FolderOpen size={13} />
                <span>Mostrar na Pasta</span>
              </button>
              <button
                type="button"
                onClick={() => void openPath(tab.path)}
                title="Abrir no reprodutor padrão do sistema"
                style={actionBtnStyle}
              >
                <ExternalLink size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Palco principal de reprodução HTML5 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          minHeight: 0,
          overflow: 'auto',
          backgroundColor: '#09090b',
        }}
      >
        {loadError ? (
          <div
            style={{
              padding: '16px 22px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
            }}
          >
            Não foi possível reproduzir esta mídia ({tab.name}).
          </div>
        ) : !streamUrl ? (
          <div style={{ color: '#cbd5e1', fontSize: '12px' }}>
            Carregando mídia...
          </div>
        ) : isAudio ? (
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              padding: '28px 24px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 18px 42px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '18px',
                background:
                  'linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(59, 130, 246, 0.22))',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c084fc',
              }}
            >
              <Music size={30} />
            </div>
            <div style={{ textAlign: 'center', maxWidth: '100%' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '14px',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-word',
                }}
              >
                {tab.name}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                }}
              >
                {formatBadge}
                {durationLabel ? ` • ${durationLabel}` : ''}
                {fileSize > 0 ? ` • ${formatStudioMediaBytes(fileSize)}` : ''}
              </div>
            </div>
            <audio
              key={`${tab.path}|${reloadSeq}`}
              ref={audioRef}
              controls
              autoPlay={false}
              loop={loop}
              src={streamUrl}
              onLoadedMetadata={(e) => {
                e.currentTarget.playbackRate = playbackRate;
                if (Number.isFinite(e.currentTarget.duration)) {
                  setDuration(e.currentTarget.duration);
                }
              }}
              onError={() => setLoadError(true)}
              style={{ width: '100%' }}
            />
          </div>
        ) : (
          <video
            key={`${tab.path}|${reloadSeq}`}
            ref={videoRef}
            controls
            autoPlay={false}
            loop={loop}
            src={streamUrl}
            onLoadedMetadata={(e) => {
              e.currentTarget.playbackRate = playbackRate;
              if (Number.isFinite(e.currentTarget.duration)) {
                setDuration(e.currentTarget.duration);
              }
              const vw = e.currentTarget.videoWidth;
              const vh = e.currentTarget.videoHeight;
              if (vw > 0 && vh > 0) {
                setVideoDims({ w: vw, h: vh });
                updateTabMediaMeta(tab.id, {
                  imageWidth: vw,
                  imageHeight: vh,
                });
              }
            }}
            onError={() => setLoadError(true)}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#000000',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
              outline: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
};

export const StudioMediaViewer: React.FC<StudioMediaViewerProps> = ({
  tab,
  onSwitchSvgToCode,
  onNotify,
}) => {
  if (tab.tabKind === 'pdf') {
    return <StudioPdfViewer tab={tab} onNotify={onNotify} />;
  }
  if (tab.tabKind === 'media' || isStudioAudioVideoFile(tab.name)) {
    return <StudioAudioVideoViewer tab={tab} onNotify={onNotify} />;
  }
  return (
    <StudioImageViewer
      tab={tab}
      onSwitchSvgToCode={onSwitchSvgToCode}
      onNotify={onNotify}
    />
  );
};

const toolbarBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  padding: '6px 12px',
  backgroundColor: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--border-subtle)',
  flexWrap: 'wrap',
  userSelect: 'none',
};

const badgePillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 7px',
  borderRadius: '999px',
  border: '1px solid transparent',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.03em',
};

const metaTextStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-secondary)',
};

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: '26px',
  padding: '0 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: '11px',
  cursor: 'default',
};

const segmentedGroupStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface)',
  overflow: 'hidden',
};

const iconToolBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '24px',
  padding: '0 6px',
  border: 'none',
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  cursor: 'default',
};

const dividerStyle: React.CSSProperties = {
  width: '1px',
  height: '16px',
  backgroundColor: 'var(--border-subtle)',
};

