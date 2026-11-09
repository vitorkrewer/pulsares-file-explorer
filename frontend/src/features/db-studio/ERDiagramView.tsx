import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Table2,
  Key,
  Link,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  LayoutGrid,
  Download,
  Search,
  Eye,
  Layers,
} from 'lucide-react';
import { DBSchemaInfo, DBObjectInfo, DBRelationshipInfo } from '../../lib/wails';

interface ERDiagramViewProps {
  schema: DBSchemaInfo | null;
  onSelectTable?: (tableName: string) => void;
  onOpenTableData?: (tableName: string) => void;
}

interface NodePosition {
  x: number;
  y: number;
}

const TABLE_WIDTH = 260;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 28;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export const ERDiagramView: React.FC<ERDiagramViewProps> = ({
  schema,
  onSelectTable,
  onOpenTableData,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 60, y: 60 });
  const [zoom, setZoom] = useState<number>(1);
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = useState<{ table: string; col: string } | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMiniMap, setShowMiniMap] = useState(true);

  // Estados de arrasto
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number }>({
    mouseX: 0,
    mouseY: 0,
    panX: 0,
    panY: 0,
  });

  const draggingNodeRef = useRef<{
    table: string;
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);

  const tables = useMemo(() => {
    return schema?.tables || [];
  }, [schema]);

  const relationships = useMemo(() => {
    if (schema?.relationships && schema.relationships.length > 0) {
      return schema.relationships;
    }
    // Fallback: computar a partir de foreignKeys das tabelas se relationships vier vazio
    const rels: DBRelationshipInfo[] = [];
    tables.forEach((tbl) => {
      (tbl.foreignKeys || []).forEach((fk) => {
        rels.push({
          id: `${fk.fromTable}_${fk.fromCol}__${fk.toTable}_${fk.toCol || 'id'}`,
          fromTable: fk.fromTable,
          fromCol: fk.fromCol,
          toTable: fk.toTable,
          toCol: fk.toCol || 'id',
          onUpdate: fk.onUpdate || '',
          onDelete: fk.onDelete || '',
        });
      });
    });
    return rels;
  }, [schema, tables]);

  // Mapa rápido de tabelas por nome
  const tableMap = useMemo(() => {
    const map = new Map<string, DBObjectInfo>();
    tables.forEach((t) => map.set(t.name, t));
    return map;
  }, [tables]);

  // Cálculo da altura de cada tabela
  const getTableHeight = useCallback((tbl: DBObjectInfo) => {
    return HEADER_HEIGHT + (tbl.columns?.length || 0) * ROW_HEIGHT + 14;
  }, []);

  // Algoritmo de Auto Layout em Camadas Topológicas
  const computeAutoLayout = useCallback(
    (customTables?: DBObjectInfo[]) => {
      const targetTables = customTables || tables;
      if (targetTables.length === 0) return {};

      // 1. Grafo de dependência: quantas tabelas cada tabela aponta (FKs)
      const inDegree = new Map<string, number>();
      const dependents = new Map<string, string[]>();

      targetTables.forEach((t) => {
        inDegree.set(t.name, 0);
        dependents.set(t.name, []);
      });

      relationships.forEach((rel) => {
        if (inDegree.has(rel.fromTable) && inDegree.has(rel.toTable)) {
          inDegree.set(rel.fromTable, (inDegree.get(rel.fromTable) || 0) + 1);
          dependents.get(rel.toTable)?.push(rel.fromTable);
        }
      });

      // 2. Ordenação por camadas (tabelas independentes à esquerda, dependentes à direita)
      const layers: string[][] = [];
      const visited = new Set<string>();

      // Camada 0: tabelas sem FKs (tabelas mestres/catálogo)
      let currentLayer = targetTables
        .filter((t) => (inDegree.get(t.name) || 0) === 0)
        .map((t) => t.name);

      if (currentLayer.length === 0 && targetTables.length > 0) {
        currentLayer = [targetTables[0].name];
      }

      while (currentLayer.length > 0) {
        layers.push(currentLayer);
        currentLayer.forEach((name) => visited.add(name));

        const nextLayer: string[] = [];
        currentLayer.forEach((parent) => {
          (dependents.get(parent) || []).forEach((child) => {
            if (!visited.has(child) && !nextLayer.includes(child)) {
              nextLayer.push(child);
            }
          });
        });

        // Adiciona outras tabelas restantes se o grafo tiver componentes desconectados
        if (nextLayer.length === 0 && visited.size < targetTables.length) {
          const unvisited = targetTables.find((t) => !visited.has(t.name));
          if (unvisited) {
            nextLayer.push(unvisited.name);
          }
        }

        currentLayer = nextLayer;
      }

      // 3. Atribui coordenadas (x, y) com espaçamento harmônico
      const newPos: Record<string, NodePosition> = {};
      const colSpacing = 380;
      const rowGap = 40;

      layers.forEach((layerTables, colIdx) => {
        let currentY = 50;
        layerTables.forEach((tableName) => {
          const tblObj = tableMap.get(tableName);
          const h = tblObj ? getTableHeight(tblObj) : 220;
          newPos[tableName] = {
            x: 60 + colIdx * colSpacing,
            y: currentY,
          };
          currentY += h + rowGap;
        });
      });

      return newPos;
    },
    [tables, relationships, tableMap, getTableHeight]
  );

  // Inicializa posições na primeira carga ou quando o schema mudar
  useEffect(() => {
    if (tables.length > 0) {
      setNodePositions((prev) => {
        const hasAll = tables.every((t) => prev[t.name]);
        if (hasAll && Object.keys(prev).length === tables.length) {
          return prev;
        }
        return computeAutoLayout(tables);
      });
    }
  }, [tables, computeAutoLayout]);

  // Fit View: Centraliza e ajusta o zoom para enquadrar todas as tabelas
  const handleFitView = useCallback(() => {
    if (!containerRef.current || tables.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    tables.forEach((tbl) => {
      const pos = nodePositions[tbl.name] || { x: 0, y: 0 };
      const h = getTableHeight(tbl);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
      maxY = Math.max(maxY, pos.y + h);
    });

    if (minX === Infinity) return;

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const padding = 80;

    const scaleX = (rect.width - padding * 2) / (graphWidth || 1);
    const scaleY = (rect.height - padding * 2) / (graphHeight || 1);
    const targetZoom = Math.max(MIN_ZOOM, Math.min(1.15, Math.min(scaleX, scaleY)));

    const targetPanX = (rect.width - graphWidth * targetZoom) / 2 - minX * targetZoom;
    const targetPanY = (rect.height - graphHeight * targetZoom) / 2 - minY * targetZoom;

    setZoom(targetZoom);
    setPan({ x: targetPanX, y: targetPanY });
  }, [tables, nodePositions, getTableHeight]);

  // Executa o Fit View automaticamente na primeira montagem após definir posições
  useEffect(() => {
    if (tables.length > 0 && Object.keys(nodePositions).length > 0) {
      const timer = setTimeout(handleFitView, 60);
      return () => clearTimeout(timer);
    }
  }, [tables.length, handleFitView]);

  // Zoom In / Out
  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, Number((z * 1.2).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, Number((z / 1.2).toFixed(2))));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 60, y: 60 });
  };

  // Zoom via Scroll do Mouse com ancoragem sob o ponteiro
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    if (nextZoom === zoom) return;

    // Mantém o ponto do mundo virtual estável sob a posição do mouse
    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const nextPanX = mouseX - worldX * nextZoom;
    const nextPanY = mouseY - worldY * nextZoom;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  // Panning do Canvas
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    // Apenas botão esquerdo ou botão do meio
    if (e.button !== 0 && e.button !== 1) return;
    // Se o clique foi disparado dentro de um nó de tabela, ignora o pan
    if ((e.target as HTMLElement).closest('.er-node-card')) return;

    isDraggingCanvasRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setSelectedTable(null);
  };

  // Início de arrasto de um nó de tabela
  const handleMouseDownNode = (e: React.MouseEvent, tableName: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const currentPos = nodePositions[tableName] || { x: 0, y: 0 };
    draggingNodeRef.current = {
      table: tableName,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: currentPos.x,
      startNodeY: currentPos.y,
    };
    setSelectedTable(tableName);
    if (onSelectTable) onSelectTable(tableName);
  };

  // Movimento global do mouse para Pan e Node Dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 1. Arrasto de nó de tabela
      if (draggingNodeRef.current) {
        const { table, startMouseX, startMouseY, startNodeX, startNodeY } = draggingNodeRef.current;
        const deltaX = (e.clientX - startMouseX) / zoom;
        const deltaY = (e.clientY - startMouseY) / zoom;

        setNodePositions((prev) => ({
          ...prev,
          [table]: {
            x: Math.round(startNodeX + deltaX),
            y: Math.round(startNodeY + deltaY),
          },
        }));
        return;
      }

      // 2. Pan do Canvas
      if (isDraggingCanvasRef.current) {
        const deltaX = e.clientX - dragStartRef.current.mouseX;
        const deltaY = e.clientY - dragStartRef.current.mouseY;

        setPan({
          x: dragStartRef.current.panX + deltaX,
          y: dragStartRef.current.panY + deltaY,
        });
      }
    };

    const handleMouseUp = () => {
      isDraggingCanvasRef.current = false;
      draggingNodeRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom]);

  // Foco suave em uma tabela específica a partir da pesquisa
  const handleFocusTable = (tableName: string) => {
    const pos = nodePositions[tableName];
    if (!pos || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const targetPanX = rect.width / 2 - (pos.x + TABLE_WIDTH / 2) * zoom;
    const targetPanY = rect.height / 2 - (pos.y + 120) * zoom;

    setPan({ x: targetPanX, y: targetPanY });
    setSelectedTable(tableName);
    if (onSelectTable) onSelectTable(tableName);
  };

  // Exportar Diagrama como SVG Vetorial
  const handleExportSVG = () => {
    if (tables.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    tables.forEach((tbl) => {
      const pos = nodePositions[tbl.name] || { x: 0, y: 0 };
      const h = getTableHeight(tbl);
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
      maxY = Math.max(maxY, pos.y + h);
    });

    const padding = 60;
    const totalW = maxX - minX + padding * 2;
    const totalH = maxY - minY + padding * 2;
    const shiftX = -minX + padding;
    const shiftY = -minY + padding;

    // Constrói SVG limpo e exportável
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" style="background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">\n`;
    svgContent += `  <defs>\n`;
    svgContent += `    <linearGradient id="tblGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient>\n`;
    svgContent += `    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8"/></marker>\n`;
    svgContent += `  </defs>\n`;

    // Desenha arestas
    relationships.forEach((rel) => {
      const srcPos = nodePositions[rel.fromTable];
      const tgtPos = nodePositions[rel.toTable];
      const srcTbl = tableMap.get(rel.fromTable);
      const tgtTbl = tableMap.get(rel.toTable);
      if (!srcPos || !tgtPos || !srcTbl || !tgtTbl) return;

      const fromColIdx = srcTbl.columns.findIndex((c) => c.name === rel.fromCol);
      const toColIdx = tgtTbl.columns.findIndex((c) => c.name === rel.toCol);
      const fromY = srcPos.y + HEADER_HEIGHT + (fromColIdx >= 0 ? fromColIdx * ROW_HEIGHT : 0) + ROW_HEIGHT / 2;
      const toY = tgtPos.y + HEADER_HEIGHT + (toColIdx >= 0 ? toColIdx * ROW_HEIGHT : 0) + ROW_HEIGHT / 2;

      const isSrcLeft = srcPos.x < tgtPos.x;
      const x1 = (isSrcLeft ? srcPos.x + TABLE_WIDTH : srcPos.x) + shiftX;
      const y1 = fromY + shiftY;
      const x2 = (isSrcLeft ? tgtPos.x : tgtPos.x + TABLE_WIDTH) + shiftX;
      const y2 = toY + shiftY;

      const dx = Math.max(Math.abs(x2 - x1) * 0.45, 45);
      const cx1 = isSrcLeft ? x1 + dx : x1 - dx;
      const cx2 = isSrcLeft ? x2 - dx : x2 + dx;

      svgContent += `  <path d="M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}" fill="none" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)" opacity="0.85"/>\n`;
    });

    // Desenha nós de tabelas
    tables.forEach((tbl) => {
      const pos = nodePositions[tbl.name] || { x: 0, y: 0 };
      const h = getTableHeight(tbl);
      const x = pos.x + shiftX;
      const y = pos.y + shiftY;

      svgContent += `  <g transform="translate(${x}, ${y})">\n`;
      svgContent += `    <rect width="${TABLE_WIDTH}" height="${h}" rx="10" ry="10" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>\n`;
      svgContent += `    <path d="M 0 10 A 10 10 0 0 1 10 0 L ${TABLE_WIDTH - 10} 0 A 10 10 0 0 1 ${TABLE_WIDTH} 10 L ${TABLE_WIDTH} ${HEADER_HEIGHT} L 0 ${HEADER_HEIGHT} Z" fill="url(#tblGrad)"/>\n`;
      svgContent += `    <text x="14" y="27" fill="#ffffff" font-size="13" font-weight="bold">${tbl.name}</text>\n`;

      tbl.columns.forEach((col, idx) => {
        const colY = HEADER_HEIGHT + idx * ROW_HEIGHT;
        const textY = colY + 19;
        const isPK = col.pk;
        const isFK = col.fk;

        svgContent += `    <rect x="0" y="${colY}" width="${TABLE_WIDTH}" height="${ROW_HEIGHT}" fill="${idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'}"/>\n`;
        if (isPK) {
          svgContent += `    <rect x="12" y="${colY + 5}" width="24" height="18" rx="4" fill="#ca8a04"/>\n`;
          svgContent += `    <text x="17" y="${textY - 2}" fill="#ffffff" font-size="9" font-weight="bold">PK</text>\n`;
        } else if (isFK) {
          svgContent += `    <rect x="12" y="${colY + 5}" width="24" height="18" rx="4" fill="#7c3aed"/>\n`;
          svgContent += `    <text x="18" y="${textY - 2}" fill="#ffffff" font-size="9" font-weight="bold">FK</text>\n`;
        }
        svgContent += `    <text x="${isPK || isFK ? 42 : 14}" y="${textY}" fill="#e2e8f0" font-size="11.5">${col.name}</text>\n`;
        svgContent += `    <text x="${TABLE_WIDTH - 12}" y="${textY}" fill="#94a3b8" font-size="10" text-anchor="end" font-family="monospace">${col.type || 'TEXT'}</text>\n`;
      });
      svgContent += `  </g>\n`;
    });

    svgContent += `</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${schema?.name || 'database'}-er-diagram.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Tabelas filtradas para destaque
  const matchingTables = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return tables.filter(
      (t) => t.name.toLowerCase().includes(q) || t.columns.some((c) => c.name.toLowerCase().includes(q))
    );
  }, [tables, searchQuery]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDownCanvas}
      onWheel={handleWheel}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-canvas, #090d16)',
        userSelect: 'none',
        cursor: isDraggingCanvasRef.current ? 'grabbing' : 'default',
        minHeight: 400,
      }}
    >
      {/* Grade de Pontos (Dots Grid) estilo React Flow com transform */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.18) 1.2px, transparent 1.2px)',
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          pointerEvents: 'none',
        }}
      />

      {/* Toolbar Flutuante de Controles (React Flow Controls) */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 16,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'var(--bg-surface, #1e293b)',
          border: '1px solid var(--border-subtle, #334155)',
          borderRadius: 8,
          padding: '4px 6px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}
      >
        <button
          type="button"
          className="op-btn"
          onClick={handleZoomIn}
          title="Aproximar Zoom (Zoom In)"
          style={{ padding: '5px 7px' }}
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="op-btn"
          onClick={handleZoomOut}
          title="Afastar Zoom (Zoom Out)"
          style={{ padding: '5px 7px' }}
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className="op-btn"
          onClick={handleFitView}
          title="Ajustar à Tela (Fit View)"
          style={{ padding: '5px 7px' }}
        >
          <Maximize2 size={14} />
        </button>
        <button
          type="button"
          className="op-btn"
          onClick={handleResetZoom}
          title="Redefinir Zoom para 100%"
          style={{ padding: '5px 7px' }}
        >
          <RotateCcw size={14} />
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border, #334155)', margin: '0 2px' }} />

        <button
          type="button"
          className="op-btn"
          onClick={() => {
            const newPos = computeAutoLayout();
            setNodePositions(newPos);
            setTimeout(handleFitView, 40);
          }}
          title="Organizar Automaticamente (Auto Layout em Árvore Relacional)"
          style={{
            padding: '5px 8px',
            fontSize: 11.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <LayoutGrid size={13} /> Organizar
        </button>

        <button
          type="button"
          className="op-btn"
          onClick={handleExportSVG}
          title="Exportar Mapa ER para Arquivo Vetorial SVG"
          style={{
            padding: '5px 8px',
            fontSize: 11.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Download size={13} /> Exportar SVG
        </button>

        <button
          type="button"
          className={`op-btn ${showMiniMap ? 'active' : ''}`}
          onClick={() => setShowMiniMap((s) => !s)}
          title="Alternar Visibilidade do Minimapa"
          style={{
            padding: '5px 8px',
            fontSize: 11.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Layers size={13} /> Minimapa
        </button>

        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted, #94a3b8)',
            padding: '0 4px',
            fontFamily: 'monospace',
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Caixa de Busca e Filtro de Tabelas */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'var(--bg-surface, #1e293b)',
          border: '1px solid var(--border-subtle, #334155)',
          borderRadius: 8,
          padding: '3px 8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}
      >
        <Search size={13} style={{ color: 'var(--text-muted, #94a3b8)' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Localizar tabela ou coluna..."
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 11.5,
            color: 'var(--text-primary, #ffffff)',
            width: 170,
          }}
        />
        {matchingTables.length > 0 && searchQuery && (
          <span
            style={{
              fontSize: 10,
              backgroundColor: '#2563eb',
              color: '#ffffff',
              padding: '1px 5px',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {matchingTables.length}
          </span>
        )}
      </div>

      {/* Resultado da busca flutuante quando há texto */}
      {searchQuery && matchingTables.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            right: 16,
            zIndex: 40,
            maxHeight: 240,
            overflowY: 'auto',
            backgroundColor: 'var(--bg-surface, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
            borderRadius: 8,
            padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            width: 220,
          }}
        >
          {matchingTables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => handleFocusTable(t.name)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                borderRadius: 5,
                background: selectedTable === t.name ? 'rgba(37,99,235,0.25)' : 'transparent',
                border: 'none',
                color: 'var(--text-primary, #ffffff)',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontWeight: 600 }}>{t.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)' }}>
                {t.columns.length} cols
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Viewport Transformado (Mundo Virtual com Pan e Zoom) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {/* Camada SVG de Conexões / Arestas Relacionais Bézier (Edges) */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 10000,
            height: 10000,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          <defs>
            {/* Marcadores de Ponta para Chave Primária (Destino) */}
            <marker
              id="er-arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
            </marker>
            <marker
              id="er-arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
            {/* Marcador circular para Chave Estrangeira (Origem) */}
            <marker
              id="er-circle-default"
              viewBox="0 0 8 8"
              refX="4"
              refY="4"
              markerWidth="4"
              markerHeight="4"
            >
              <circle cx="4" cy="4" r="3" fill="#64748b" />
            </marker>
            <marker
              id="er-circle-active"
              viewBox="0 0 8 8"
              refX="4"
              refY="4"
              markerWidth="5"
              markerHeight="5"
            >
              <circle cx="4" cy="4" r="3.5" fill="#38bdf8" />
            </marker>
          </defs>

          {relationships.map((rel) => {
            const srcPos = nodePositions[rel.fromTable];
            const tgtPos = nodePositions[rel.toTable];
            const srcTbl = tableMap.get(rel.fromTable);
            const tgtTbl = tableMap.get(rel.toTable);

            if (!srcPos || !tgtPos || !srcTbl || !tgtTbl) return null;

            const fromColIdx = srcTbl.columns.findIndex((c) => c.name === rel.fromCol);
            const toColIdx = tgtTbl.columns.findIndex((c) => c.name === rel.toCol);

            const fromY =
              srcPos.y +
              HEADER_HEIGHT +
              (fromColIdx >= 0 ? fromColIdx * ROW_HEIGHT : 0) +
              ROW_HEIGHT / 2;
            const toY =
              tgtPos.y +
              HEADER_HEIGHT +
              (toColIdx >= 0 ? toColIdx * ROW_HEIGHT : 0) +
              ROW_HEIGHT / 2;

            const isSrcLeft = srcPos.x < tgtPos.x;
            const x1 = isSrcLeft ? srcPos.x + TABLE_WIDTH : srcPos.x;
            const y1 = fromY;
            const x2 = isSrcLeft ? tgtPos.x : tgtPos.x + TABLE_WIDTH;
            const y2 = toY;

            const dx = Math.max(Math.abs(x2 - x1) * 0.45, 50);
            const cx1 = isSrcLeft ? x1 + dx : x1 - dx;
            const cx2 = isSrcLeft ? x2 - dx : x2 + dx;

            const pathD = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;

            const isConnectedToHovered =
              hoveredTable === rel.fromTable ||
              hoveredTable === rel.toTable ||
              hoveredEdgeId === rel.id ||
              (hoveredCol &&
                ((hoveredCol.table === rel.fromTable && hoveredCol.col === rel.fromCol) ||
                  (hoveredCol.table === rel.toTable && hoveredCol.col === rel.toCol)));

            const strokeColor = isConnectedToHovered ? '#38bdf8' : '#475569';
            const strokeWidth = isConnectedToHovered ? 2.8 : 1.6;
            const opacity = hoveredTable && !isConnectedToHovered ? 0.22 : 0.85;

            // Ponto central da curva para a tag
            const midX = (x1 + 3 * cx1 + 3 * cx2 + x2) / 8;
            const midY = (y1 + 3 * y1 + 3 * y2 + y2) / 8;

            return (
              <g
                key={rel.id}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onMouseEnter={() => setHoveredEdgeId(rel.id)}
                onMouseLeave={() => setHoveredEdgeId(null)}
              >
                {/* Linha de clique invisível mais larga */}
                <path d={pathD} fill="none" stroke="transparent" strokeWidth={16} />

                {/* Linha visível Bézier */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  markerStart={
                    isConnectedToHovered ? 'url(#er-circle-active)' : 'url(#er-circle-default)'
                  }
                  markerEnd={
                    isConnectedToHovered ? 'url(#er-arrow-active)' : 'url(#er-arrow-default)'
                  }
                  strokeDasharray={isConnectedToHovered ? undefined : '5,3'}
                  style={{
                    transition: 'stroke 0.15s ease, stroke-width 0.15s ease, opacity 0.15s ease',
                    filter: isConnectedToHovered
                      ? 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.75))'
                      : undefined,
                  }}
                />

                {/* Badge/Tag informativa no meio da conexão */}
                {isConnectedToHovered && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={-45}
                      y={-11}
                      width={90}
                      height={22}
                      rx={5}
                      fill="#0f172a"
                      stroke="#38bdf8"
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={4}
                      fill="#ffffff"
                      fontSize={10}
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {rel.fromCol} → {rel.toCol}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Camada de Nós de Tabelas (Nodes) */}
        {tables.map((tbl) => {
          const pos = nodePositions[tbl.name] || { x: 0, y: 0 };
          const isSelected = selectedTable === tbl.name;
          const isHovered = hoveredTable === tbl.name;

          // Verifica se esta tabela tem relação direta com a tabela em hover
          const isRelatedToHovered =
            hoveredTable &&
            relationships.some(
              (r) =>
                (r.fromTable === hoveredTable && r.toTable === tbl.name) ||
                (r.toTable === hoveredTable && r.fromTable === tbl.name)
            );

          const isFaded = hoveredTable && hoveredTable !== tbl.name && !isRelatedToHovered;
          const isMatchSearch =
            searchQuery &&
            (tbl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              tbl.columns.some((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())));

          return (
            <div
              key={tbl.name}
              className="er-node-card"
              onMouseDown={(e) => handleMouseDownNode(e, tbl.name)}
              onMouseEnter={() => setHoveredTable(tbl.name)}
              onMouseLeave={() => setHoveredTable(null)}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: TABLE_WIDTH,
                backgroundColor: 'var(--bg-surface, #1e293b)',
                borderRadius: 10,
                border: isSelected
                  ? '2px solid #38bdf8'
                  : isMatchSearch
                  ? '2px solid #eab308'
                  : isHovered || isRelatedToHovered
                  ? '1.5px solid rgba(56, 189, 248, 0.65)'
                  : '1px solid var(--border-subtle, #334155)',
                boxShadow: isSelected
                  ? '0 0 20px rgba(56, 189, 248, 0.4), 0 10px 30px rgba(0,0,0,0.5)'
                  : isHovered
                  ? '0 8px 24px rgba(0,0,0,0.45)'
                  : '0 4px 14px rgba(0,0,0,0.3)',
                opacity: isFaded ? 0.35 : 1,
                transition: 'opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                zIndex: isSelected ? 30 : isHovered ? 25 : 10,
                cursor: 'grab',
              }}
            >
              {/* Cabeçalho da Tabela */}
              <div
                style={{
                  height: HEADER_HEIGHT,
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  background:
                    'linear-gradient(135deg, rgba(37,99,235,0.92) 0%, rgba(79,70,229,0.92) 100%)',
                  color: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Table2 size={15} style={{ flexShrink: 0, opacity: 0.9 }} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={tbl.name}
                  >
                    {tbl.name}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {onOpenTableData && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTableData(tbl.name);
                      }}
                      title="Abrir Dados da Tabela"
                      style={{
                        background: 'rgba(255,255,255,0.18)',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 5px',
                        color: '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Eye size={12} />
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      background: 'rgba(0,0,0,0.25)',
                      padding: '2px 5px',
                      borderRadius: 4,
                      fontWeight: 600,
                    }}
                  >
                    {tbl.columns?.length || 0}
                  </span>
                </div>
              </div>

              {/* Lista de Colunas da Tabela */}
              <div style={{ padding: '6px 0' }}>
                {tbl.columns.map((col, idx) => {
                  const isPK = col.pk;
                  const isFK = col.fk;
                  const isColHovered =
                    hoveredCol?.table === tbl.name && hoveredCol?.col === col.name;

                  return (
                    <div
                      key={col.name}
                      onMouseEnter={() => setHoveredCol({ table: tbl.name, col: col.name })}
                      onMouseLeave={() => setHoveredCol(null)}
                      style={{
                        height: ROW_HEIGHT,
                        padding: '0 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11.5,
                        backgroundColor: isColHovered
                          ? 'rgba(56, 189, 248, 0.12)'
                          : idx % 2 === 0
                          ? 'transparent'
                          : 'rgba(255, 255, 255, 0.015)',
                        position: 'relative',
                        transition: 'background-color 0.1s ease',
                      }}
                    >
                      {/* Lado esquerdo: badges e nome da coluna */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {isPK && (
                          <span
                            title="Chave Primária (Primary Key)"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              fontSize: 9,
                              fontWeight: 800,
                              backgroundColor: '#eab308',
                              color: '#000000',
                              padding: '1px 4px',
                              borderRadius: 3,
                              lineHeight: 1,
                            }}
                          >
                            <Key size={8} /> PK
                          </span>
                        )}
                        {isFK && (
                          <span
                            title={`Chave Estrangeira / Secundária (Foreign Key) → ${
                              col.fkTarget || 'referência'
                            }`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                              fontSize: 9,
                              fontWeight: 800,
                              backgroundColor: '#8b5cf6',
                              color: '#ffffff',
                              padding: '1px 4px',
                              borderRadius: 3,
                              lineHeight: 1,
                            }}
                          >
                            <Link size={8} /> FK
                          </span>
                        )}
                        <span
                          style={{
                            fontWeight: isPK ? 700 : 500,
                            color: isPK
                              ? '#fef08a'
                              : isFK
                              ? '#c4b5fd'
                              : 'var(--text-primary, #ffffff)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {col.name}
                        </span>
                      </div>

                      {/* Lado direito: tipo do dado e flags */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          flexShrink: 0,
                          fontSize: 10,
                          fontFamily: 'monospace',
                          color: 'var(--text-muted, #94a3b8)',
                        }}
                      >
                        {col.notNull && (
                          <span
                            title="Não Nulo (NOT NULL)"
                            style={{
                              color: '#f97316',
                              fontSize: 8.5,
                              fontWeight: 700,
                            }}
                          >
                            NN
                          </span>
                        )}
                        <span>{col.type || 'TEXT'}</span>
                      </div>

                      {/* Handles visuais de ancoragem nas laterais (React Flow Style) */}
                      {(isPK || isFK) && (
                        <>
                          <div
                            style={{
                              position: 'absolute',
                              left: -4,
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              backgroundColor: isPK ? '#eab308' : '#8b5cf6',
                              border: '1.5px solid #0f172a',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              right: -4,
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              backgroundColor: isPK ? '#eab308' : '#8b5cf6',
                              border: '1.5px solid #0f172a',
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Rodapé da tabela com contagem de linhas */}
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle, #334155)',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--text-muted, #94a3b8)',
                  background: 'rgba(0,0,0,0.12)',
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 8,
                }}
              >
                <span>
                  {tbl.rowCount >= 0 ? `${tbl.rowCount.toLocaleString('pt-BR')} linhas` : 'Tabela'}
                </span>
                {tbl.foreignKeys && tbl.foreignKeys.length > 0 && (
                  <span style={{ color: '#a78bfa', fontWeight: 600 }}>
                    {tbl.foreignKeys.length} {tbl.foreignKeys.length === 1 ? 'relação' : 'relações'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MiniMap Flutuante Interativo (Canto Inferior Direito) */}
      {showMiniMap && tables.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            width: 170,
            height: 115,
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid var(--border-subtle, #334155)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 40,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted, #94a3b8)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>MINIMAPA</span>
            <span style={{ fontSize: 9, color: '#38bdf8' }}>{tables.length} tabelas</span>
          </div>

          <svg width="100%" height="86" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid meet">
            {/* Nós no minimapa */}
            {tables.map((t) => {
              const pos = nodePositions[t.name] || { x: 0, y: 0 };
              const isSel = selectedTable === t.name;
              return (
                <rect
                  key={t.name}
                  x={pos.x}
                  y={pos.y}
                  width={TABLE_WIDTH}
                  height={140}
                  rx={10}
                  fill={isSel ? '#38bdf8' : '#334155'}
                  stroke={isSel ? '#ffffff' : '#475569'}
                  strokeWidth={3}
                />
              );
            })}
          </svg>
        </div>
      )}

      {/* Estado Vazio se o Banco Não Tiver Tabelas */}
      {tables.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: 'var(--text-muted, #94a3b8)',
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
              borderRadius: '50%',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
            }}
          >
            <Layers size={26} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #ffffff)' }}>
            Nenhuma tabela encontrada neste banco
          </div>
          <div style={{ fontSize: 12, maxWidth: 320 }}>
            Crie tabelas ou importe dados (CSV, TSV, JSON) para visualizar o mapa de
            entidade-relacionamento entre chaves primárias e secundárias.
          </div>
        </div>
      )}
    </div>
  );
};
