import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  Table2,
  Eye,
  Key,
  Terminal,
  Code2,
  RefreshCw,
  Download,
  ExternalLink,
  Search,
  Play,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  Clock,
  Layers,
  Minus,
  Square,
  Maximize2,
  Minimize2,
  X,
  FolderOpen,
} from 'lucide-react';
import {
  useDBStudioStore,
  isStandaloneDBStudioWindow,
} from './store';
import {
  subscribeEvent,
  DBStudioOpenFileEvent,
  windowMinimize,
  windowToggleMaximize,
  windowClose,
} from '../../lib/wails';
import { formatBytes } from '../../i18n/format';

interface DBStudioModalProps {
  standalone?: boolean;
}

export const DBStudioModal: React.FC<DBStudioModalProps> = ({ standalone = false }) => {
  const isDedicated = standalone || isStandaloneDBStudioWindow();

  const isOpen = useDBStudioStore((s) => s.isOpen);
  const isMinimized = useDBStudioStore((s) => s.isMinimized);
  const isMaximized = useDBStudioStore((s) => s.isMaximized);
  const dbPath = useDBStudioStore((s) => s.dbPath);
  const schema = useDBStudioStore((s) => s.schema);
  const activeTable = useDBStudioStore((s) => s.activeTable);
  const activeTabMode = useDBStudioStore((s) => s.activeTabMode);
  const tableData = useDBStudioStore((s) => s.tableData);
  const pageLimit = useDBStudioStore((s) => s.pageLimit);
  const pageOffset = useDBStudioStore((s) => s.pageOffset);
  const tableFilter = useDBStudioStore((s) => s.tableFilter);
  const sortCol = useDBStudioStore((s) => s.sortCol);
  const sortDir = useDBStudioStore((s) => s.sortDir);
  const sqlQuery = useDBStudioStore((s) => s.sqlQuery);
  const queryResult = useDBStudioStore((s) => s.queryResult);
  const queryHistory = useDBStudioStore((s) => s.queryHistory);
  const loading = useDBStudioStore((s) => s.loading);
  const queryLoading = useDBStudioStore((s) => s.queryLoading);
  const error = useDBStudioStore((s) => s.error);
  const toastMessage = useDBStudioStore((s) => s.toastMessage);

  const openDatabase = useDBStudioStore((s) => s.openDatabase);
  const refreshSchema = useDBStudioStore((s) => s.refreshSchema);
  const selectTable = useDBStudioStore((s) => s.selectTable);
  const setActiveTabMode = useDBStudioStore((s) => s.setActiveTabMode);
  const setTablePage = useDBStudioStore((s) => s.setTablePage);
  const setTableFilter = useDBStudioStore((s) => s.setTableFilter);
  const toggleTableSort = useDBStudioStore((s) => s.toggleTableSort);
  const setSqlQuery = useDBStudioStore((s) => s.setSqlQuery);
  const runCustomSQL = useDBStudioStore((s) => s.runCustomSQL);
  const detachToSeparateWindow = useDBStudioStore((s) => s.detachToSeparateWindow);
  const exportCurrentResult = useDBStudioStore((s) => s.exportCurrentResult);
  const setMinimized = useDBStudioStore((s) => s.setMinimized);
  const toggleMaximize = useDBStudioStore((s) => s.toggleMaximize);
  const closeDBStudio = useDBStudioStore((s) => s.closeDBStudio);

  const [sidebarSearch, setSidebarSearch] = useState('');
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [filterInput, setFilterInput] = useState('');
  const [manualPathInput, setManualPathInput] = useState('');
  const [selectedCellValue, setSelectedCellValue] = useState<{ col: string; val: string } | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Posição para modal flutuante quando usado dentro do Explorer
  const [pos, setPos] = useState({ x: 70, y: 45 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    setFilterInput(tableFilter);
  }, [tableFilter, activeTable]);

  // Escuta eventos IPC do backend Go quando outra instância pede para abrir um banco no DB Studio
  useEffect(() => {
    if (!isDedicated) return;
    const unsub = subscribeEvent<DBStudioOpenFileEvent>('dbstudio:open-file', (ev) => {
      if (ev?.targetPath) {
        void openDatabase(ev.targetPath, { forceInline: true });
      }
    });
    return () => unsub();
  }, [isDedicated, openDatabase]);

  const activeTableObj = useMemo(() => {
    if (!schema || !activeTable) return null;
    return (
      schema.tables?.find((t) => t.name === activeTable) ||
      schema.views?.find((v) => v.name === activeTable) ||
      null
    );
  }, [schema, activeTable]);

  const filteredTables = useMemo(() => {
    const list = schema?.tables || [];
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns?.some((c) => c.name.toLowerCase().includes(q))
    );
  }, [schema, sidebarSearch]);

  const filteredViews = useMemo(() => {
    const list = schema?.views || [];
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) => v.name.toLowerCase().includes(q));
  }, [schema, sidebarSearch]);

  const filteredIndexes = useMemo(() => {
    const list = schema?.indexes || [];
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (idx) =>
        idx.name.toLowerCase().includes(q) ||
        idx.tableName.toLowerCase().includes(q)
    );
  }, [schema, sidebarSearch]);

  if (!isOpen && !isDedicated) return null;

  if (isMinimized && !isDedicated) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 36,
          right: 260,
          zIndex: 9600,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '7px 14px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          cursor: 'pointer',
          color: 'var(--text-main)',
          fontSize: 12,
          fontWeight: 600,
        }}
        onClick={() => setMinimized(false)}
      >
        <Database size={15} style={{ color: '#10b981' }} />
        <span>Pulsares DB Studio — {schema?.name || 'SQLite'}</span>
        <Maximize2 size={13} style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isMaximized || isDedicated) return;
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const nx = Math.max(0, Math.min(window.innerWidth - 320, dragRef.current.origX + (ev.clientX - dragRef.current.startX)));
      const ny = Math.max(0, Math.min(window.innerHeight - 80, dragRef.current.origY + (ev.clientY - dragRef.current.startY)));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleCopyText = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 1800);
  };

  const containerStyle: React.CSSProperties =
    isDedicated || isMaximized
      ? {
          position: 'fixed',
          inset: 0,
          zIndex: 9500,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          overflow: 'hidden',
        }
      : {
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: 'min(1260px, 92vw)',
          height: 'min(820px, 88vh)',
          zIndex: 9500,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.55)',
          overflow: 'hidden',
        };

  return (
    <div style={containerStyle}>
      {/* Titlebar Customizada Nativa do Pulsares DB Studio */}
      <div
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={() => {
          if (isDedicated) {
            void windowToggleMaximize();
          } else {
            toggleMaximize();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isDedicated ? '0 0 0 12px' : '6px 12px',
          height: isDedicated ? 40 : 44,
          backgroundColor: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: isDedicated || isMaximized ? 'default' : 'move',
          userSelect: 'none',
          gap: 8,
          // @ts-expect-error Wails frameless drag property
          '--wails-draggable': isDedicated ? 'drag' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.35)',
            }}
          >
            <Database size={13} color="#fff" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>
            Pulsares DB Studio
          </span>
          {schema && (
            <>
              <span
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'rgba(16, 185, 129, 0.14)',
                  color: '#10b981',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                SQLite {schema.sqliteVer || '3'}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 340,
                }}
                title={dbPath}
              >
                {dbPath} ({formatBytes(schema.size, 'pt-BR')})
              </span>
            </>
          )}
        </div>

        {/* Abas de Modo e Ferramentas */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flexWrap: 'nowrap',
            height: '100%',
            // @ts-expect-error Wails frameless no-drag property
            '--wails-draggable': 'no-drag',
          }}
        >
          <button
            type="button"
            className={`op-btn ${activeTabMode === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTabMode('data')}
            style={{ padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Table2 size={13} /> Dados da Tabela
          </button>
          <button
            type="button"
            className={`op-btn ${activeTabMode === 'query' ? 'active' : ''}`}
            onClick={() => setActiveTabMode('query')}
            style={{ padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Terminal size={13} /> Console SQL
          </button>
          <button
            type="button"
            className={`op-btn ${activeTabMode === 'schema' ? 'active' : ''}`}
            onClick={() => setActiveTabMode('schema')}
            style={{ padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Code2 size={13} /> Estrutura / DDL
          </button>

          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />

          <button
            type="button"
            className="op-btn"
            onClick={() => void refreshSchema()}
            disabled={!dbPath || loading}
            title="Recarregar estrutura e tabelas do banco"
            style={{ padding: '4px 8px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <RefreshCw size={12} /> Atualizar
          </button>

          <button
            type="button"
            className="op-btn"
            onClick={() => void exportCurrentResult('csv')}
            disabled={!dbPath}
            title="Exportar resultado visível para CSV"
            style={{ padding: '4px 8px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Download size={12} /> CSV
          </button>

          <button
            type="button"
            className="op-btn"
            onClick={() => void exportCurrentResult('json')}
            disabled={!dbPath}
            title="Exportar resultado visível para JSON"
            style={{ padding: '4px 8px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Download size={12} /> JSON
          </button>

          {!isDedicated && (
            <button
              type="button"
              className="op-btn"
              onClick={() => void detachToSeparateWindow()}
              title="Desacoplar Pulsares DB Studio em janela independente do sistema operacional"
              style={{
                padding: '4px 9px',
                fontSize: 11.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                borderColor: 'var(--accent)',
                color: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              <ExternalLink size={12} /> Janela Separada
            </button>
          )}

          {/* Controles Nativos da Janela */}
          {isDedicated ? (
            <div style={{ display: 'flex', alignItems: 'stretch', height: '100%', marginLeft: 6 }}>
              <button
                type="button"
                onClick={() => void windowMinimize()}
                title="Minimizar janela"
                style={{
                  width: 42,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() => void windowToggleMaximize()}
                title="Maximizar / Restaurar janela"
                style={{
                  width: 42,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Square size={12} />
              </button>
              <button
                type="button"
                onClick={() => void windowClose()}
                title="Fechar Pulsares DB Studio"
                style={{
                  width: 44,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#dc2626';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-main)';
                }}
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
              <button
                type="button"
                className="op-btn"
                onClick={() => setMinimized(true)}
                title="Minimizar no rodapé"
                style={{ padding: '4px 7px' }}
              >
                <Minimize2 size={13} />
              </button>
              <button
                type="button"
                className="op-btn"
                onClick={toggleMaximize}
                title={isMaximized ? 'Restaurar tamanho flutuante' : 'Maximizar'}
                style={{ padding: '4px 7px' }}
              >
                {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button
                type="button"
                className="op-btn danger"
                onClick={closeDBStudio}
                title="Fechar DB Studio"
                style={{ padding: '4px 8px' }}
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notificação Toast / Erro */}
      {(toastMessage || error) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 14px',
            fontSize: 12,
            background: error ? 'rgba(220, 38, 38, 0.14)' : 'rgba(16, 185, 129, 0.15)',
            color: error ? 'var(--danger)' : '#10b981',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={14} />
            {error || toastMessage}
          </span>
        </div>
      )}

      {/* Estado sem banco aberto */}
      {!dbPath ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            gap: 14,
          }}
        >
          <Database size={48} style={{ color: '#10b981', opacity: 0.85 }} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>Pulsares DB Studio</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 460, textAlign: 'center' }}>
            Informe o caminho de um arquivo SQLite (<code>.db</code>, <code>.sqlite</code>, <code>.sqlite3</code>) ou clique com o botão direito sobre um banco no Pulsares Explorer.
          </div>
          <div style={{ display: 'flex', gap: 8, width: 'min(520px, 90%)' }}>
            <input
              type="text"
              className="search-input"
              placeholder="Ex: C:\caminho\para\banco.db"
              value={manualPathInput}
              onChange={(e) => setManualPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualPathInput.trim()) {
                  void openDatabase(manualPathInput.trim(), { forceInline: true });
                }
              }}
              style={{ flex: 1, padding: '7px 10px', fontSize: 12.5 }}
            />
            <button
              type="button"
              className="op-btn primary"
              onClick={() => {
                if (manualPathInput.trim()) {
                  void openDatabase(manualPathInput.trim(), { forceInline: true });
                }
              }}
              style={{ padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FolderOpen size={14} /> Abrir Banco
            </button>
          </div>
        </div>
      ) : loading && !schema ? (
        /* Estado de Carregamento Inicial do Banco */
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            padding: 32,
          }}
        >
          <RefreshCw size={36} className="spin-animation" style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>Abrindo banco de dados e inspecionando tabelas...</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 500, wordBreak: 'break-all', textAlign: 'center' }}>
            {dbPath}
          </div>
        </div>
      ) : error && !schema ? (
        /* Estado de Erro ao Abrir Banco */
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            gap: 14,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            <AlertTriangle size={32} style={{ color: '#ef4444' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Não foi possível abrir o banco de dados
          </div>
          <div
            style={{
              maxWidth: 520,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: 'var(--text-primary)',
              background: 'rgba(239, 68, 68, 0.08)',
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid rgba(239, 68, 68, 0.25)',
              textAlign: 'center',
            }}
          >
            {error}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', wordBreak: 'break-all', maxWidth: 520 }}>
            {dbPath}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="op-btn primary"
              onClick={() => void refreshSchema()}
              style={{ padding: '7px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={13} /> Tentar novamente
            </button>
            <button
              type="button"
              className="op-btn"
              onClick={() => useDBStudioStore.setState({ dbPath: '', error: null, schema: null })}
              style={{ padding: '7px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FolderOpen size={13} /> Escolher outro arquivo
            </button>
          </div>
        </div>
      ) : (
        /* Corpo Principal: Sidebar de Esquema + Área de Dados/Consulta */
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          {/* Sidebar Esquerda de Esquema (Tabelas, Views, Índices) */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              borderRight: '1px solid var(--border)',
              background: 'var(--bg-sidebar)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search
                  size={13}
                  style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }}
                />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Filtrar tabelas ou colunas..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px 5px 26px', fontSize: 11.5 }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {/* Seção TABELAS */}
              <div
                style={{
                  padding: '4px 12px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>TABELAS</span>
                <span>{filteredTables.length}</span>
              </div>

              {filteredTables.map((tbl) => {
                const isSelected = activeTable === tbl.name;
                const isExpanded = !!expandedTables[tbl.name];
                return (
                  <div key={tbl.name}>
                    <div
                      onClick={() => void selectTable(tbl.name)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 10px',
                        cursor: 'pointer',
                        fontSize: 12,
                        background: isSelected ? 'var(--bg-selected)' : 'transparent',
                        color: isSelected ? 'var(--accent)' : 'var(--text-main)',
                        fontWeight: isSelected ? 600 : 400,
                        borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTables((prev) => ({ ...prev, [tbl.name]: !prev[tbl.name] }));
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </span>
                        <Table2 size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tbl.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 10,
                          background: 'var(--bg-hover)',
                          color: 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        {tbl.rowCount != null && tbl.rowCount >= 0 ? tbl.rowCount.toLocaleString('pt-BR') : '—'}
                      </span>
                    </div>

                    {isExpanded && tbl.columns && (
                      <div style={{ padding: '2px 0 4px 28px', background: 'rgba(0,0,0,0.03)' }}>
                        {tbl.columns.map((col) => (
                          <div
                            key={col.name}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '2px 10px 2px 4px',
                              fontSize: 11,
                              color: 'var(--text-muted)',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              {col.pk ? (
                                <Key size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
                              ) : (
                                <span style={{ width: 11, display: 'inline-block' }} />
                              )}
                              <span
                                style={{
                                  color: col.pk ? 'var(--text-main)' : 'var(--text-muted)',
                                  fontWeight: col.pk ? 600 : 400,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {col.name}
                              </span>
                            </span>
                            <span style={{ fontSize: 9.5, opacity: 0.75, fontFamily: 'monospace' }}>
                              {col.type || 'ANY'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Seção VIEWS */}
              {filteredViews.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '10px 12px 4px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>VIEWS</span>
                    <span>{filteredViews.length}</span>
                  </div>
                  {filteredViews.map((vw) => {
                    const isSelected = activeTable === vw.name;
                    return (
                      <div
                        key={vw.name}
                        onClick={() => void selectTable(vw.name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '5px 10px 5px 16px',
                          cursor: 'pointer',
                          fontSize: 12,
                          background: isSelected ? 'var(--bg-selected)' : 'transparent',
                          color: isSelected ? 'var(--accent)' : 'var(--text-main)',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <Eye size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {vw.name}
                          </span>
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {vw.rowCount != null && vw.rowCount >= 0 ? vw.rowCount.toLocaleString('pt-BR') : '—'}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Seção ÍNDICES */}
              {filteredIndexes.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '10px 12px 4px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>ÍNDICES</span>
                    <span>{filteredIndexes.length}</span>
                  </div>
                  {filteredIndexes.map((idx) => (
                    <div
                      key={idx.name}
                      onClick={() => {
                        if (idx.tableName) {
                          void selectTable(idx.tableName);
                          setActiveTabMode('schema');
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 10px 4px 16px',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                      }}
                      title={`Tabela: ${idx.tableName}`}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <Layers size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {idx.name}
                        </span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Área Principal Direita */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            {activeTabMode === 'data' && (
              <>
                {/* Barra de Filtro e Paginação da Tabela */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface)',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Table2 size={14} style={{ color: '#10b981' }} />
                      {activeTable || 'Nenhuma tabela'}
                    </span>
                    <div style={{ position: 'relative', flex: 1, maxWidth: 340, display: 'flex', alignItems: 'center' }}>
                      <Search
                        size={13}
                        style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }}
                      />
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Filtrar linhas em qualquer coluna (Enter)..."
                        value={filterInput}
                        onChange={(e) => setFilterInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            void setTableFilter(filterInput);
                          }
                        }}
                        style={{ width: '100%', padding: '5px 24px 5px 26px', fontSize: 12 }}
                      />
                      {filterInput && (
                        <button
                          type="button"
                          onClick={() => {
                            setFilterInput('');
                            void setTableFilter('');
                          }}
                          style={{
                            position: 'absolute',
                            right: 6,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="op-btn"
                      onClick={() => void setTableFilter(filterInput)}
                      style={{ padding: '4px 9px', fontSize: 11.5 }}
                    >
                      Filtrar
                    </button>
                  </div>

                  {/* Controles de Paginação */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    {tableData && (() => {
                      const total = Number(
                        tableData.totalRows ??
                        // @ts-expect-error fallback compat
                        tableData.totalCount ??
                        activeTableObj?.rowCount ??
                        tableData.rows.length
                      );
                      const from = tableData.rows.length === 0 ? 0 : pageOffset + 1;
                      const to = Math.min(pageOffset + tableData.rows.length, Math.max(total, pageOffset + tableData.rows.length));
                      return (
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {total === 0
                            ? '0 registros'
                            : `${from}–${to.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}{' '}
                          ({tableData.durationMs} ms)
                        </span>
                      );
                    })()}
                    <select
                      className="search-input"
                      value={pageLimit}
                      onChange={(e) => void setTablePage(0, Number(e.target.value))}
                      style={{ padding: '3px 6px', fontSize: 11.5 }}
                    >
                      <option value={50}>50 / pág</option>
                      <option value={100}>100 / pág</option>
                      <option value={250}>250 / pág</option>
                      <option value={500}>500 / pág</option>
                    </select>
                    <button
                      type="button"
                      className="op-btn"
                      disabled={pageOffset <= 0 || queryLoading}
                      onClick={() => void setTablePage(Math.max(0, pageOffset - pageLimit))}
                      style={{ padding: '4px 7px' }}
                      title="Página anterior"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <button
                      type="button"
                      className="op-btn"
                      disabled={
                        !tableData ||
                        queryLoading ||
                        pageOffset + pageLimit >=
                          Number(
                            tableData.totalRows ??
                            // @ts-expect-error fallback
                            tableData.totalCount ??
                            activeTableObj?.rowCount ??
                            tableData.rows.length
                          )
                      }
                      onClick={() => void setTablePage(pageOffset + pageLimit)}
                      style={{ padding: '4px 7px' }}
                      title="Próxima página"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>

                {/* Grade de Dados da Tabela */}
                <div style={{ flex: 1, overflow: 'auto', position: 'relative', backgroundColor: 'var(--bg-surface)' }}>
                  {queryLoading && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.28)',
                        backdropFilter: 'blur(2px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        zIndex: 10,
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <RefreshCw size={16} className="spin-animation" style={{ color: 'var(--accent)' }} />
                      <span>Carregando registros da tabela...</span>
                    </div>
                  )}

                  {!tableData || tableData.columns.length === 0 ? (
                    <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, gap: 10 }}>
                      {queryLoading ? (
                        <>
                          <RefreshCw size={22} className="spin-animation" style={{ color: 'var(--accent)' }} />
                          <span>Carregando registros...</span>
                        </>
                      ) : (
                        'Selecione uma tabela na barra lateral.'
                      )}
                    </div>
                  ) : (
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      <thead style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: 'var(--bg-subtle)' }}>
                        <tr>
                          <th
                            style={{
                              width: 44,
                              padding: '7px 8px',
                              textAlign: 'right',
                              borderBottom: '1px solid var(--border-subtle)',
                              borderRight: '1px solid var(--border-subtle)',
                              color: 'var(--text-muted)',
                              fontSize: 10.5,
                            }}
                          >
                            #
                          </th>
                          {tableData.columns.map((col) => {
                            const colMeta = activeTableObj?.columns?.find((c) => c.name === col);
                            const isSorted = sortCol === col;
                            return (
                              <th
                                key={col}
                                onClick={() => void toggleTableSort(col)}
                                style={{
                                  padding: '7px 10px',
                                  textAlign: 'left',
                                  borderBottom: '1px solid var(--border-subtle)',
                                  borderRight: '1px solid var(--border-subtle)',
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  whiteSpace: 'nowrap',
                                  backgroundColor: isSorted ? 'var(--bg-selected)' : 'var(--bg-subtle)',
                                }}
                                title="Clique para ordenar por esta coluna"
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {colMeta?.pk && <Key size={11} style={{ color: '#f59e0b' }} />}
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{col}</span>
                                  {colMeta?.type && (
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                                      {colMeta.type}
                                    </span>
                                  )}
                                  {isSorted &&
                                    (sortDir === 'ASC' ? (
                                      <ArrowUp size={12} style={{ color: 'var(--accent)' }} />
                                    ) : (
                                      <ArrowDown size={12} style={{ color: 'var(--accent)' }} />
                                    ))}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.rows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            style={{
                              borderBottom: '1px solid var(--border-subtle)',
                              backgroundColor: rIdx % 2 === 1 ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                            }}
                          >
                            <td
                              style={{
                                padding: '5px 8px',
                                textAlign: 'right',
                                borderRight: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                fontSize: 10.5,
                              }}
                            >
                              {pageOffset + rIdx + 1}
                            </td>
                            {row.map((cell, cIdx) => {
                              const isNull = cell === 'NULL';
                              const colName = tableData.columns[cIdx] || '';
                              return (
                                <td
                                  key={cIdx}
                                  onClick={() => setSelectedCellValue({ col: colName, val: cell })}
                                  style={{
                                    padding: '5px 10px',
                                    borderRight: '1px solid var(--border-subtle)',
                                    maxWidth: 320,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    cursor: 'pointer',
                                    color: isNull ? 'var(--text-muted)' : 'var(--text-primary)',
                                    fontStyle: isNull ? 'italic' : 'normal',
                                  }}
                                  title={cell}
                                >
                                  {isNull ? (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        background: 'var(--bg-hover)',
                                        color: 'var(--text-muted)',
                                      }}
                                    >
                                      NULL
                                    </span>
                                  ) : (
                                    cell
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Inspetor de Célula Selecionada no Rodapé */}
                {selectedCellValue && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      borderTop: '1px solid var(--border)',
                      background: 'var(--bg-panel)',
                      gap: 10,
                      fontSize: 11.5,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <span style={{ fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                        [{selectedCellValue.col}]:
                      </span>
                      <code
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {selectedCellValue.val}
                      </code>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="op-btn"
                        onClick={() => handleCopyText(selectedCellValue.val)}
                        style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        {copiedText ? <Check size={12} /> : <Copy size={12} />} Copiar Valor
                      </button>
                      <button
                        type="button"
                        className="op-btn"
                        onClick={() => setSelectedCellValue(null)}
                        style={{ padding: '3px 6px' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTabMode === 'query' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Barra de Snippets SQL e Execução */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-panel)',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="op-btn primary"
                      onClick={() => void runCustomSQL()}
                      disabled={queryLoading || !sqlQuery.trim()}
                      style={{ padding: '5px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <Play size={13} /> Executar SQL (Ctrl+Enter)
                    </button>

                    {activeTable && (
                      <>
                        <button
                          type="button"
                          className="op-btn"
                          onClick={() => {
                            const q = `SELECT * FROM "${activeTable.replace(/"/g, '""')}" LIMIT 100;`;
                            void runCustomSQL(q);
                          }}
                          style={{ padding: '4px 8px', fontSize: 11 }}
                        >
                          SELECT * ({activeTable})
                        </button>
                        <button
                          type="button"
                          className="op-btn"
                          onClick={() => {
                            const q = `SELECT COUNT(*) AS total FROM "${activeTable.replace(/"/g, '""')}";`;
                            void runCustomSQL(q);
                          }}
                          style={{ padding: '4px 8px', fontSize: 11 }}
                        >
                          COUNT(*)
                        </button>
                        <button
                          type="button"
                          className="op-btn"
                          onClick={() => {
                            const q = `PRAGMA table_info("${activeTable.replace(/"/g, '""')}");`;
                            void runCustomSQL(q);
                          }}
                          style={{ padding: '4px 8px', fontSize: 11 }}
                        >
                          PRAGMA table_info
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="op-btn"
                      onClick={() =>
                        void runCustomSQL(
                          `SELECT name, type, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name;`
                        )
                      }
                      style={{ padding: '4px 8px', fontSize: 11 }}
                    >
                      sqlite_master
                    </button>
                  </div>

                  {queryResult && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={12} />
                      {queryResult.isSelect
                        ? `${queryResult.totalRows} linhas em ${queryResult.durationMs} ms`
                        : `${queryResult.rowsAffected} linhas afetadas em ${queryResult.durationMs} ms`}
                    </span>
                  )}
                </div>

                {/* Editor SQL */}
                <div style={{ height: 170, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void runCustomSQL();
                      }
                    }}
                    placeholder="Digite sua consulta SQL (SELECT, PRAGMA, INSERT, UPDATE, DELETE, CREATE...) e pressione Ctrl+Enter"
                    style={{
                      flex: 1,
                      width: '100%',
                      padding: 12,
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                      background: 'var(--bg-main)',
                      color: 'var(--text-main)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  />
                  {queryHistory.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        borderTop: '1px solid var(--border)',
                        background: 'var(--bg-sidebar)',
                        overflowX: 'auto',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>Histórico:</span>
                      {queryHistory.slice(0, 6).map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          className="op-btn"
                          onClick={() => setSqlQuery(h.query)}
                          style={{
                            padding: '2px 7px',
                            fontSize: 10.5,
                            maxWidth: 220,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                          title={`${h.query} (${h.durationMs} ms)`}
                        >
                          {h.query}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resultado da Consulta SQL */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {!queryResult ? (
                    <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>
                      Execute uma instrução SQL acima para visualizar os resultados.
                    </div>
                  ) : !queryResult.isSelect ? (
                    <div style={{ padding: 24 }}>
                      <div
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#10b981',
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {queryResult.message || `Comando executado com sucesso. Linhas afetadas: ${queryResult.rowsAffected}`}
                      </div>
                    </div>
                  ) : (
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-subtle)', zIndex: 2 }}>
                        <tr>
                          <th
                            style={{
                              width: 44,
                              padding: '6px 8px',
                              textAlign: 'right',
                              borderBottom: '1px solid var(--border-subtle)',
                              borderRight: '1px solid var(--border-subtle)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            #
                          </th>
                          {queryResult.columns.map((c, idx) => (
                            <th
                              key={idx}
                              style={{
                                padding: '6px 10px',
                                textAlign: 'left',
                                borderBottom: '1px solid var(--border-subtle)',
                                borderRight: '1px solid var(--border-subtle)',
                                whiteSpace: 'nowrap',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.rows.map((r, rIdx) => (
                          <tr
                            key={rIdx}
                            style={{
                              borderBottom: '1px solid var(--border-subtle)',
                              backgroundColor: rIdx % 2 === 1 ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                            }}
                          >
                            <td
                              style={{
                                padding: '5px 8px',
                                textAlign: 'right',
                                borderRight: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                fontSize: 10.5,
                              }}
                            >
                              {rIdx + 1}
                            </td>
                            {r.map((val, cIdx) => (
                              <td
                                key={cIdx}
                                style={{
                                  padding: '5px 10px',
                                  borderRight: '1px solid var(--border-subtle)',
                                  maxWidth: 360,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  color: 'var(--text-primary)',
                                }}
                                title={val}
                              >
                                {val}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTabMode === 'schema' && (
              <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {activeTableObj ? (
                  <>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
                        Colunas de {activeTableObj.name} ({activeTableObj.columns?.length || 0})
                      </div>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: 12,
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <thead style={{ backgroundColor: 'var(--bg-subtle)' }}>
                          <tr>
                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>#</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>Coluna</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>Tipo</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>Chave Primária</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>NOT NULL</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>Valor Padrão</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(activeTableObj.columns || []).map((col) => (
                            <tr key={col.cid} style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
                              <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{col.cid}</td>
                              <td style={{ padding: '6px 10px', fontWeight: 600 }}>{col.name}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{col.type || 'ANY'}</td>
                              <td style={{ padding: '6px 10px' }}>
                                {col.pk ? (
                                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>PK</span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '6px 10px' }}>{col.notNull ? 'Sim' : 'Não'}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                {col.defaultValue || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {activeTableObj.sql && (
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>DDL SQL ({activeTableObj.name})</span>
                          <button
                            type="button"
                            className="op-btn"
                            onClick={() => handleCopyText(activeTableObj.sql)}
                            style={{ padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          >
                            {copiedText ? <Check size={12} /> : <Copy size={12} />} Copiar DDL
                          </button>
                        </div>
                        <pre
                          style={{
                            padding: 14,
                            borderRadius: 8,
                            background: 'var(--bg-sidebar)',
                            border: '1px solid var(--border)',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: 12,
                            whiteSpace: 'pre-wrap',
                            overflowX: 'auto',
                            margin: 0,
                          }}
                        >
                          {activeTableObj.sql}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                    Selecione uma tabela na barra lateral para inspecionar sua estrutura e DDL.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
