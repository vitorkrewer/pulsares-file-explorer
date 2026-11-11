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
  Network,
  Plus,
  Trash2,
  Wrench,
  Bookmark,
  Sparkles,
  FileSpreadsheet,
  Edit3,
} from 'lucide-react';
import {
  useDBStudioStore,
  isStandaloneDBStudioWindow,
} from './store';
import { useDBCreatorStore } from '../db-creator/store';
import {
  subscribeEvent,
  DBStudioOpenFileEvent,
  windowMinimize,
  windowToggleMaximize,
  windowClose,
  showSaveFileDialog,
  showOpenFileDialog,
} from '../../lib/wails';
import { formatBytes } from '../../i18n/format';
import { ERDiagramView } from './ERDiagramView';

interface DBStudioModalProps {
  standalone?: boolean;
}

type DBTemplateKey = 'blank' | 'users' | 'catalog' | 'tasks' | 'custom';

interface NewTableColDraft {
  id: string;
  name: string;
  type: 'INTEGER' | 'TEXT' | 'REAL' | 'BLOB' | 'NUMERIC';
  pk: boolean;
  autoIncrement: boolean;
  notNull: boolean;
  unique: boolean;
  defaultVal: string;
}

const DB_TEMPLATES: Record<DBTemplateKey, { label: string; description: string; sql: string }> = {
  blank: {
    label: 'Banco em Branco (Vazio)',
    description: 'Cria um arquivo SQLite limpo pronto para novas tabelas ou importações.',
    sql: '',
  },
  users: {
    label: 'Sistema de Usuários & Perfis',
    description: 'Tabelas usuarios, perfis e sessoes com chaves estrangeiras (FK) e dados iniciais.',
    sql: `CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS perfis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL UNIQUE,
  cargo TEXT NOT NULL DEFAULT 'Membro',
  departamento TEXT,
  bio TEXT,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_origem TEXT,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

INSERT INTO usuarios (nome, email, ativo) VALUES
  ('Ana Martins', 'ana.martins@exemplo.local', 1),
  ('Carlos Eduardo', 'carlos.edu@exemplo.local', 1);

INSERT INTO perfis (usuario_id, cargo, departamento, bio) VALUES
  (1, 'Engenheira de Dados', 'Plataforma', 'Especialista em arquitetura SQLite e ETL'),
  (2, 'Analista de Sistemas', 'Produto', 'Focado em modelagem relacional');`,
  },
  catalog: {
    label: 'Catálogo de Produtos & Pedidos',
    description: 'Tabelas categorias, produtos e pedidos com relacionamentos FK e estoque.',
    sql: `CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT
);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  preco REAL NOT NULL DEFAULT 0.0,
  estoque INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL,
  cliente_nome TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PAGO',
  data_pedido TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
);

INSERT INTO categorias (nome, descricao) VALUES
  ('Hardware', 'Equipamentos e componentes físicos'),
  ('Periféricos', 'Teclados, mouses e monitores');

INSERT INTO produtos (categoria_id, sku, nome, preco, estoque) VALUES
  (1, 'SSD-NVME-1TB', 'SSD NVMe 1TB Gen4', 549.90, 35),
  (2, 'TEC-MEC-PRO', 'Teclado Mecânico Switch Tátil', 389.00, 20);

INSERT INTO pedidos (produto_id, cliente_nome, quantidade, valor_total, status) VALUES
  (1, 'Mariana Costa', 2, 1099.80, 'ENVIADO'),
  (2, 'Roberto Almeida', 1, 389.00, 'PAGO');`,
  },
  tasks: {
    label: 'Gerenciador de Tarefas / Projetos',
    description: 'Tabelas projetos e tarefas conectadas por chave estrangeira e prioridades.',
    sql: `CREATE TABLE IF NOT EXISTS projetos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  responsavel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'MEDIA',
  concluida INTEGER NOT NULL DEFAULT 0,
  prazo TEXT,
  FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
);

INSERT INTO projetos (nome, responsavel, status) VALUES
  ('Migração Banco Local', 'Equipe Core', 'ATIVO'),
  ('Automação de Relatórios', 'Equipe Dados', 'PLANEJADO');

INSERT INTO tarefas (projeto_id, titulo, prioridade, concluida, prazo) VALUES
  (1, 'Definir esquema e índices principais', 'ALTA', 1, '2025-05-10'),
  (1, 'Validar integridade referencial FK', 'ALTA', 0, '2025-05-15'),
  (2, 'Exportar consultas recorrentes', 'MEDIA', 0, '2025-05-22');`,
  },
  custom: {
    label: 'Script DDL Personalizado',
    description: 'Escreva seu próprio script CREATE TABLE / INSERT para inicializar o banco.',
    sql: `CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT,
  atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
);`,
  },
};

const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'CREATE TABLE',
  'ALTER TABLE',
  'ADD COLUMN',
  'DROP TABLE',
  'CREATE INDEX',
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'INNER JOIN',
  'LEFT JOIN',
  'ON',
  'COUNT(*)',
  'DISTINCT',
  'PRAGMA',
  'table_info',
  'foreign_key_list',
  'sqlite_master',
  'PRIMARY KEY',
  'AUTOINCREMENT',
  'NOT NULL',
  'DEFAULT',
];

function buildCreateTableDDL(tableName: string, cols: NewTableColDraft[]): string {
  const safeTable = (tableName.trim() || 'nova_tabela').replace(/"/g, '""');
  const colLines = cols
    .filter((c) => c.name.trim().length > 0)
    .map((c) => {
      const safeCol = c.name.trim().replace(/"/g, '""');
      const parts: string[] = [`  "${safeCol}" ${c.type}`];
      if (c.pk) {
        parts.push('PRIMARY KEY');
        if (c.autoIncrement && c.type === 'INTEGER') {
          parts.push('AUTOINCREMENT');
        }
      }
      if (c.notNull && !c.pk) {
        parts.push('NOT NULL');
      }
      if (c.unique && !c.pk) {
        parts.push('UNIQUE');
      }
      if (c.defaultVal.trim() !== '') {
        parts.push(`DEFAULT ${c.defaultVal.trim()}`);
      }
      return parts.join(' ');
    });

  if (colLines.length === 0) {
    colLines.push('  "id" INTEGER PRIMARY KEY AUTOINCREMENT');
  }

  return `CREATE TABLE "${safeTable}" (\n${colLines.join(',\n')}\n);`;
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
  const sqlTabs = useDBStudioStore((s) => s.sqlTabs);
  const activeSqlTabId = useDBStudioStore((s) => s.activeSqlTabId);
  const savedQueries = useDBStudioStore((s) => s.savedQueries);
  const recentDatabases = useDBStudioStore((s) => s.recentDatabases);
  const queryResult = useDBStudioStore((s) => s.queryResult);
  const queryHistory = useDBStudioStore((s) => s.queryHistory);
  const loading = useDBStudioStore((s) => s.loading);
  const queryLoading = useDBStudioStore((s) => s.queryLoading);
  const error = useDBStudioStore((s) => s.error);
  const toastMessage = useDBStudioStore((s) => s.toastMessage);

  const openDatabase = useDBStudioStore((s) => s.openDatabase);
  const browseAndOpenDatabase = useDBStudioStore((s) => s.browseAndOpenDatabase);
  const createNewDatabase = useDBStudioStore((s) => s.createNewDatabase);
  const removeRecentDatabase = useDBStudioStore((s) => s.removeRecentDatabase);
  const refreshSchema = useDBStudioStore((s) => s.refreshSchema);
  const selectTable = useDBStudioStore((s) => s.selectTable);
  const setActiveTabMode = useDBStudioStore((s) => s.setActiveTabMode);
  const setTablePage = useDBStudioStore((s) => s.setTablePage);
  const setTableFilter = useDBStudioStore((s) => s.setTableFilter);
  const toggleTableSort = useDBStudioStore((s) => s.toggleTableSort);
  const setSqlQuery = useDBStudioStore((s) => s.setSqlQuery);
  const addSqlTab = useDBStudioStore((s) => s.addSqlTab);
  const selectSqlTab = useDBStudioStore((s) => s.selectSqlTab);
  const closeSqlTab = useDBStudioStore((s) => s.closeSqlTab);
  const saveFavoriteQuery = useDBStudioStore((s) => s.saveFavoriteQuery);
  const deleteFavoriteQuery = useDBStudioStore((s) => s.deleteFavoriteQuery);
  const runCustomSQL = useDBStudioStore((s) => s.runCustomSQL);
  const updateCellValue = useDBStudioStore((s) => s.updateCellValue);
  const insertTableRow = useDBStudioStore((s) => s.insertTableRow);
  const deleteTableRow = useDBStudioStore((s) => s.deleteTableRow);
  const runMaintenance = useDBStudioStore((s) => s.runMaintenance);
  const exportSQLDump = useDBStudioStore((s) => s.exportSQLDump);
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

  // Estados para Criar Novo Banco de Dados
  const [showCreateDbModal, setShowCreateDbModal] = useState(false);
  const [newDbPath, setNewDbPath] = useState('');
  const [newDbWal, setNewDbWal] = useState(true);
  const [newDbTemplate, setNewDbTemplate] = useState<DBTemplateKey>('users');
  const [newDbCustomSql, setNewDbCustomSql] = useState(DB_TEMPLATES.users.sql);

  // Estados para Menu de Manutenção
  const [showMaintenanceMenu, setShowMaintenanceMenu] = useState(false);

  // Estados para Construtor Visual de Tabela (+ Nova Tabela) e (+ Coluna)
  const [showNewTableModal, setShowNewTableModal] = useState(false);
  const [newTableName, setNewTableName] = useState('nova_tabela');
  const [newTableCols, setNewTableCols] = useState<NewTableColDraft[]>([
    { id: 'c1', name: 'id', type: 'INTEGER', pk: true, autoIncrement: true, notNull: true, unique: false, defaultVal: '' },
    { id: 'c2', name: 'nome', type: 'TEXT', pk: false, autoIncrement: false, notNull: true, unique: false, defaultVal: '' },
    { id: 'c3', name: 'criado_em', type: 'TEXT', pk: false, autoIncrement: false, notNull: false, unique: false, defaultVal: 'CURRENT_TIMESTAMP' },
  ]);

  const [showAddColModal, setShowAddColModal] = useState(false);
  const [addColName, setAddColName] = useState('');
  const [addColType, setAddColType] = useState<'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'NUMERIC'>('TEXT');
  const [addColNotNull, setAddColNotNull] = useState(false);
  const [addColDefault, setAddColDefault] = useState('');

  // Estados para Edição Inline de Célula e Inserção de Linha
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    colName: string;
    pkCol: string;
    pkVal: string;
    value: string;
  } | null>(null);

  const [showInsertRowPanel, setShowInsertRowPanel] = useState(false);
  const [insertRowValues, setInsertRowValues] = useState<Record<string, string>>({});
  const [insertRowNulls, setInsertRowNulls] = useState<Record<string, boolean>>({});

  // Estados para Favoritos e Autocomplete SQL
  const [showSaveQueryPrompt, setShowSaveQueryPrompt] = useState(false);
  const [favoriteQueryName, setFavoriteQueryName] = useState('');
  const [cursorWord, setCursorWord] = useState('');
  const sqlTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  const primaryKeyColName = useMemo(() => {
    if (!activeTableObj?.columns || activeTableObj.columns.length === 0) {
      return tableData?.columns?.[0] || '';
    }
    const pkCol = activeTableObj.columns.find((c) => c.pk);
    return pkCol ? pkCol.name : activeTableObj.columns[0].name;
  }, [activeTableObj, tableData]);

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
        (idx.tableName || '').toLowerCase().includes(q)
    );
  }, [schema, sidebarSearch]);

  const sqlSuggestions = useMemo(() => {
    const prefix = cursorWord.trim().toLowerCase();
    if (!prefix || prefix.length < 1) return [];
    const items: { label: string; kind: 'table' | 'column' | 'keyword' }[] = [];
    const seen = new Set<string>();

    for (const tbl of schema?.tables || []) {
      if (tbl.name.toLowerCase().includes(prefix) && !seen.has(tbl.name)) {
        seen.add(tbl.name);
        items.push({ label: tbl.name, kind: 'table' });
      }
      for (const col of tbl.columns || []) {
        if (col.name.toLowerCase().includes(prefix) && !seen.has(col.name)) {
          seen.add(col.name);
          items.push({ label: col.name, kind: 'column' });
        }
      }
    }
    for (const kw of SQL_KEYWORDS) {
      if (kw.toLowerCase().startsWith(prefix) && !seen.has(kw)) {
        seen.add(kw);
        items.push({ label: kw, kind: 'keyword' });
      }
    }
    return items.slice(0, 10);
  }, [cursorWord, schema]);

  const liveCreateTableSQL = useMemo(
    () => buildCreateTableDDL(newTableName, newTableCols),
    [newTableName, newTableCols]
  );

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
          cursor: 'default',
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

  const handlePickNewDbLocation = async () => {
    const baseDir = dbPath ? dbPath.replace(/[/\\][^/\\]+$/, '') : '';
    try {
      const chosen = await showSaveFileDialog({
        title: 'Escolher local para o Novo Banco SQLite',
        defaultDirectory: baseDir,
        defaultFilename: 'novo_banco.db',
        filterDisplayName: 'Banco SQLite (*.db, *.sqlite)',
        filterPattern: '*.db;*.sqlite;*.sqlite3',
      });
      if (chosen) {
        setNewDbPath(chosen);
      }
    } catch {
      // ignore cancel
    }
  };

  const handleCreateDatabaseNow = async () => {
    if (!newDbPath.trim()) {
      await handlePickNewDbLocation();
      return;
    }
    const ok = await createNewDatabase(newDbPath.trim(), newDbCustomSql, newDbWal);
    if (ok) {
      setShowCreateDbModal(false);
    }
  };

  const handleImportFromCsvOrJson = async () => {
    try {
      const baseDir = dbPath ? dbPath.replace(/[/\\][^/\\]+$/, '') : '';
      const picked = await showOpenFileDialog({
        title: 'Selecionar CSV, TSV, JSON ou JSONL para converter em SQLite',
        defaultDirectory: baseDir,
        defaultFilename: '',
        filterDisplayName: 'Arquivos de Dados (*.csv, *.tsv, *.json, *.jsonl)',
        filterPattern: '*.csv;*.tsv;*.json;*.jsonl;*.ndjson',
      });
      if (picked && picked.trim()) {
        setShowCreateDbModal(false);
        await useDBCreatorStore.getState().openCreator(picked.trim());
      }
    } catch {
      // ignore cancel
    }
  };

  const handleExecuteCreateTable = async () => {
    if (!newTableName.trim()) return;
    const ddl = buildCreateTableDDL(newTableName, newTableCols);
    await runCustomSQL(ddl);
    await refreshSchema();
    await selectTable(newTableName.trim());
    setActiveTabMode('data');
    setShowNewTableModal(false);
  };

  const handleExecuteAddColumn = async () => {
    if (!activeTableObj || !addColName.trim()) return;
    const safeTbl = activeTableObj.name.replace(/"/g, '""');
    const safeCol = addColName.trim().replace(/"/g, '""');
    let sql = `ALTER TABLE "${safeTbl}" ADD COLUMN "${safeCol}" ${addColType}`;
    if (addColNotNull) {
      sql += ` NOT NULL DEFAULT ${addColDefault.trim() || "''"}`;
    } else if (addColDefault.trim()) {
      sql += ` DEFAULT ${addColDefault.trim()}`;
    }
    sql += ';';
    await runCustomSQL(sql);
    await refreshSchema();
    setAddColName('');
    setAddColDefault('');
    setAddColNotNull(false);
    setShowAddColModal(false);
  };

  const handleOpenInsertRow = () => {
    if (!activeTableObj) return;
    const initVals: Record<string, string> = {};
    const initNulls: Record<string, boolean> = {};
    for (const col of activeTableObj.columns || []) {
      initVals[col.name] = col.defaultValue ? col.defaultValue.replace(/^'|'$/g, '') : '';
      initNulls[col.name] = col.pk && col.type.toUpperCase().includes('INT');
    }
    setInsertRowValues(initVals);
    setInsertRowNulls(initNulls);
    setShowInsertRowPanel(true);
  };

  const handleConfirmInsertRow = async () => {
    if (!activeTableObj) return;
    const nullCols = Object.entries(insertRowNulls)
      .filter(([, isN]) => isN)
      .map(([col]) => col);
    const ok = await insertTableRow(activeTableObj.name, insertRowValues, nullCols);
    if (ok) {
      setShowInsertRowPanel(false);
    }
  };

  const handleCommitInlineCell = async (forceNull = false) => {
    if (!editingCell || !activeTable) return;
    const { pkCol, pkVal, colName, value } = editingCell;
    const ok = await updateCellValue(activeTable, pkCol, pkVal, colName, value, forceNull);
    if (ok) {
      setEditingCell(null);
    }
  };

  const updateCursorWordFromTextarea = (el: HTMLTextAreaElement) => {
    const posIdx = el.selectionStart || 0;
    const leftPart = el.value.slice(0, posIdx);
    const match = leftPart.match(/[A-Za-z0-9_]+$/);
    setCursorWord(match ? match[0] : '');
  };

  const applyAutocompleteSuggestion = (suggestion: string) => {
    const el = sqlTextareaRef.current;
    if (!el) {
      setSqlQuery(`${sqlQuery} ${suggestion}`);
      setCursorWord('');
      return;
    }
    const posIdx = el.selectionStart || 0;
    const leftPart = sqlQuery.slice(0, posIdx);
    const rightPart = sqlQuery.slice(posIdx);
    const replacedLeft = leftPart.replace(/[A-Za-z0-9_]+$/, suggestion);
    const nextSql = replacedLeft + rightPart;
    setSqlQuery(nextSql);
    setCursorWord('');
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(replacedLeft.length, replacedLeft.length);
    }, 0);
  };

  const renderCreationCardContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 5, color: 'var(--text-muted)' }}>
          Arquivo de Destino (.db / .sqlite)
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            className="search-input"
            placeholder="Ex: C:\Projetos\meu_sistema.db"
            value={newDbPath}
            onChange={(e) => setNewDbPath(e.target.value)}
            style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
          />
          <button
            type="button"
            className="op-btn"
            onClick={() => void handlePickNewDbLocation()}
            style={{ padding: '6px 11px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
          >
            <FolderOpen size={13} /> Escolher Local...
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'default' }}>
          <input
            type="checkbox"
            checked={newDbWal}
            onChange={(e) => setNewDbWal(e.target.checked)}
          />
          <span>Ativar modo WAL (alta concorrência e performance)</span>
        </label>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, marginBottom: 5, color: 'var(--text-muted)' }}>
          Modelo Inicial (Template Relacional)
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 6 }}>
          {(Object.keys(DB_TEMPLATES) as DBTemplateKey[]).map((key) => {
            const tmpl = DB_TEMPLATES[key];
            const active = newDbTemplate === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setNewDbTemplate(key);
                  setNewDbCustomSql(tmpl.sql);
                }}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 7,
                  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: active ? 'var(--bg-selected)' : 'var(--bg-main)',
                  color: 'var(--text-main)',
                  cursor: 'default',
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-main)' }}>
                  {tmpl.label}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>
                  {tmpl.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {newDbTemplate !== 'blank' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
              Script SQL de Inicialização (editável):
            </span>
          </div>
          <textarea
            value={newDbCustomSql}
            onChange={(e) => setNewDbCustomSql(e.target.value)}
            rows={6}
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11.5,
              resize: 'vertical',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="op-btn"
          onClick={() => void handleImportFromCsvOrJson()}
          style={{ padding: '7px 12px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <FileSpreadsheet size={13} style={{ color: '#10b981' }} />
          Criar a partir de CSV / JSON / JSONL...
        </button>

        <button
          type="button"
          className="op-btn primary"
          onClick={() => void handleCreateDatabaseNow()}
          disabled={loading}
          style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Sparkles size={13} />
          Criar e Abrir no DB Studio
        </button>
      </div>
    </div>
  );

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
          width: 'min(1280px, 94vw)',
          height: 'min(840px, 90vh)',
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
          height: isDedicated ? 42 : 46,
          backgroundColor: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: isDedicated || isMaximized ? 'default' : 'move',
          userSelect: 'none',
          gap: 8,
          ...(isDedicated ? { '--wails-draggable': 'drag' } : {}),
        } as React.CSSProperties}
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
                  maxWidth: 260,
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
            '--wails-draggable': 'no-drag',
          } as React.CSSProperties}
        >
          <button
            type="button"
            className="op-btn"
            onClick={() => setShowCreateDbModal(true)}
            title="Criar novo banco de dados SQLite do zero ou a partir de modelo"
            style={{
              padding: '4px 9px',
              fontSize: 11.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              borderColor: '#10b981',
              color: '#10b981',
              fontWeight: 600,
            }}
          >
            <Plus size={12} /> Novo Banco
          </button>

          <button
            type="button"
            className="op-btn"
            onClick={() => void browseAndOpenDatabase()}
            title="Abrir outro arquivo de banco de dados SQLite"
            style={{ padding: '4px 8px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <FolderOpen size={12} /> Abrir...
          </button>

          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />

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
          <button
            type="button"
            className={`op-btn ${activeTabMode === 'erd' ? 'active' : ''}`}
            onClick={() => setActiveTabMode('erd')}
            style={{ padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            title="Mapa de Entidade-Relacionamento e Chaves do Banco"
          >
            <Network size={13} /> Mapa ER
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
            <RefreshCw size={12} />
          </button>

          {/* Menu de Manutenção e Dump SQL */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="op-btn"
              disabled={!dbPath}
              onClick={() => setShowMaintenanceMenu((v) => !v)}
              title="Ferramentas de Manutenção SQLite e Exportação de Dump .SQL"
              style={{ padding: '4px 8px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Wrench size={12} /> Manutenção
            </button>
            {showMaintenanceMenu && dbPath && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 4px)',
                  zIndex: 9900,
                  minWidth: 220,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 8,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                  padding: 5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => {
                    setShowMaintenanceMenu(false);
                    void runMaintenance('vacuum');
                  }}
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: 11.5, border: 'none' }}
                >
                  VACUUM (Compactar Banco)
                </button>
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => {
                    setShowMaintenanceMenu(false);
                    void runMaintenance('integrity');
                  }}
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: 11.5, border: 'none' }}
                >
                  Verificar Integridade (PRAGMA)
                </button>
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => {
                    setShowMaintenanceMenu(false);
                    void runMaintenance('analyze');
                  }}
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: 11.5, border: 'none' }}
                >
                  ANALYZE (Otimizar Estatísticas)
                </button>
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => {
                    setShowMaintenanceMenu(false);
                    void runMaintenance('foreign_keys');
                  }}
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: 11.5, border: 'none' }}
                >
                  Auditar Chaves Estrangeiras
                </button>
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => {
                    setShowMaintenanceMenu(false);
                    void runMaintenance('wal_checkpoint');
                  }}
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: 11.5, border: 'none' }}
                >
                  WAL Checkpoint (TRUNCATE)
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => {
                    setShowMaintenanceMenu(false);
                    void exportSQLDump();
                  }}
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: 11.5, border: 'none', color: '#10b981', fontWeight: 600 }}
                >
                  Exportar Dump .SQL Completo
                </button>
              </div>
            )}
          </div>

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
              <ExternalLink size={12} /> Janela
            </button>
          )}

          {/* Controles Nativos da Janela */}
          {isDedicated ? (
            <div style={{ display: 'flex', alignItems: 'stretch', height: '100%', marginLeft: 4 }}>
              <button
                type="button"
                onClick={() => void windowMinimize()}
                title="Minimizar janela"
                style={{
                  width: 40,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
                }}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() => void windowToggleMaximize()}
                title="Maximizar / Restaurar janela"
                style={{
                  width: 40,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
                }}
              >
                <Square size={12} />
              </button>
              <button
                type="button"
                onClick={() => void windowClose()}
                title="Fechar Pulsares DB Studio"
                style={{
                  width: 42,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
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
          <button
            type="button"
            onClick={() => useDBStudioStore.setState({ error: null, toastMessage: null })}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'default' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Modal Sobreposto para Criar Novo Banco quando já há um banco aberto */}
      {showCreateDbModal && dbPath && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9800,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: 'min(680px, 95%)',
              maxHeight: '90%',
              overflowY: 'auto',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10,
              padding: 20,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700 }}>
                <Sparkles size={16} style={{ color: '#10b981' }} />
                <span>Criar Novo Banco de Dados SQLite</span>
              </div>
              <button
                type="button"
                className="op-btn"
                onClick={() => setShowCreateDbModal(false)}
                style={{ padding: '4px 7px' }}
              >
                <X size={13} />
              </button>
            </div>
            {renderCreationCardContent()}
          </div>
        </div>
      )}

      {/* Modal Construtor Visual de Nova Tabela */}
      {showNewTableModal && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9800,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: 'min(760px, 96%)',
              maxHeight: '90%',
              overflowY: 'auto',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Table2 size={16} style={{ color: '#10b981' }} />
                <span>Criar Nova Tabela no Banco</span>
              </div>
              <button type="button" className="op-btn" onClick={() => setShowNewTableModal(false)}>
                <X size={13} />
              </button>
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Nome da Tabela
              </label>
              <input
                type="text"
                className="search-input"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Ex: clientes"
                style={{ width: '100%', padding: '6px 10px', fontSize: 12.5 }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)' }}>Colunas da Tabela</span>
                <button
                  type="button"
                  className="op-btn"
                  onClick={() =>
                    setNewTableCols((prev) => [
                      ...prev,
                      {
                        id: `c-${Date.now()}`,
                        name: `coluna_${prev.length + 1}`,
                        type: 'TEXT',
                        pk: false,
                        autoIncrement: false,
                        notNull: false,
                        unique: false,
                        defaultVal: '',
                      },
                    ])
                  }
                  style={{ padding: '4px 9px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Plus size={12} /> Adicionar Coluna
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                {newTableCols.map((col, idx) => (
                  <div
                    key={col.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.5fr 110px auto auto auto auto 1fr auto',
                      gap: 6,
                      alignItems: 'center',
                      padding: '6px 8px',
                      background: 'var(--bg-main)',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      fontSize: 11.5,
                    }}
                  >
                    <input
                      type="text"
                      className="search-input"
                      value={col.name}
                      placeholder="Nome da coluna"
                      onChange={(e) => {
                        const v = e.target.value;
                        setNewTableCols((prev) => prev.map((c, i) => (i === idx ? { ...c, name: v } : c)));
                      }}
                      style={{ padding: '4px 7px', fontSize: 11.5 }}
                    />
                    <select
                      className="search-input"
                      value={col.type}
                      onChange={(e) => {
                        const t = e.target.value as NewTableColDraft['type'];
                        setNewTableCols((prev) => prev.map((c, i) => (i === idx ? { ...c, type: t } : c)));
                      }}
                      style={{ padding: '4px 6px', fontSize: 11.5 }}
                    >
                      <option value="INTEGER">INTEGER</option>
                      <option value="TEXT">TEXT</option>
                      <option value="REAL">REAL</option>
                      <option value="NUMERIC">NUMERIC</option>
                      <option value="BLOB">BLOB</option>
                    </select>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <input
                        type="checkbox"
                        checked={col.pk}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewTableCols((prev) => prev.map((c, i) => (i === idx ? { ...c, pk: checked } : c)));
                        }}
                      />
                      PK
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <input
                        type="checkbox"
                        checked={col.autoIncrement}
                        disabled={!col.pk || col.type !== 'INTEGER'}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewTableCols((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, autoIncrement: checked } : c))
                          );
                        }}
                      />
                      AUTO
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <input
                        type="checkbox"
                        checked={col.notNull}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewTableCols((prev) => prev.map((c, i) => (i === idx ? { ...c, notNull: checked } : c)));
                        }}
                      />
                      NOT NULL
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <input
                        type="checkbox"
                        checked={col.unique}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewTableCols((prev) => prev.map((c, i) => (i === idx ? { ...c, unique: checked } : c)));
                        }}
                      />
                      UNIQUE
                    </label>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="DEFAULT (opcional)"
                      value={col.defaultVal}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNewTableCols((prev) => prev.map((c, i) => (i === idx ? { ...c, defaultVal: v } : c)));
                      }}
                      style={{ padding: '4px 7px', fontSize: 11 }}
                    />
                    <button
                      type="button"
                      className="op-btn danger"
                      disabled={newTableCols.length <= 1}
                      onClick={() => setNewTableCols((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ padding: '4px 6px' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Prévia DDL SQL:
              </span>
              <pre
                style={{
                  margin: 0,
                  padding: 10,
                  borderRadius: 6,
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  fontSize: 11.5,
                  fontFamily: 'var(--font-mono, monospace)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {liveCreateTableSQL}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="op-btn" onClick={() => setShowNewTableModal(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="op-btn primary"
                onClick={() => void handleExecuteCreateTable()}
                style={{ padding: '6px 14px', fontWeight: 600 }}
              >
                Criar Tabela Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Coluna (+ Coluna) */}
      {showAddColModal && activeTableObj && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9800,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              width: 'min(440px, 94%)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                Nova Coluna em "{activeTableObj.name}"
              </span>
              <button type="button" className="op-btn" onClick={() => setShowAddColModal(false)}>
                <X size={13} />
              </button>
            </div>

            <input
              type="text"
              className="search-input"
              placeholder="Nome da nova coluna"
              value={addColName}
              onChange={(e) => setAddColName(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 12.5 }}
            />

            <select
              className="search-input"
              value={addColType}
              onChange={(e) => setAddColType(e.target.value as typeof addColType)}
              style={{ padding: '6px 10px', fontSize: 12.5 }}
            >
              <option value="TEXT">TEXT</option>
              <option value="INTEGER">INTEGER</option>
              <option value="REAL">REAL</option>
              <option value="NUMERIC">NUMERIC</option>
              <option value="BLOB">BLOB</option>
            </select>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={addColNotNull}
                onChange={(e) => setAddColNotNull(e.target.checked)}
              />
              Exigir preenchimento (NOT NULL)
            </label>

            <input
              type="text"
              className="search-input"
              placeholder="Valor padrão (DEFAULT opcional)"
              value={addColDefault}
              onChange={(e) => setAddColDefault(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 12 }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="op-btn" onClick={() => setShowAddColModal(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="op-btn primary"
                onClick={() => void handleExecuteAddColumn()}
                disabled={!addColName.trim()}
              >
                Adicionar Coluna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estado sem banco aberto: Tela de Boas-Vindas Dual Card (Abrir Existente + Criar Novo Banco) */}
      {!dbPath ? (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 640 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Database size={30} style={{ color: '#10b981' }} />
              <span style={{ fontSize: 20, fontWeight: 800 }}>Pulsares DB Studio</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Ambiente completo para criação, modelagem relacional, edição de dados e execução SQL em bancos SQLite.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
              gap: 20,
              width: 'min(1120px, 98%)',
              alignItems: 'start',
            }}
          >
            {/* Card 1: Abrir Banco Existente & Recentes */}
            <div
              style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 700 }}>
                <FolderOpen size={17} style={{ color: 'var(--accent)' }} />
                <span>Abrir Banco de Dados Existente</span>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Caminho do arquivo (.db, .sqlite, .sqlite3)..."
                  value={manualPathInput}
                  onChange={(e) => setManualPathInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualPathInput.trim()) {
                      void openDatabase(manualPathInput.trim(), { forceInline: true });
                    }
                  }}
                  style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
                />
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => {
                    if (manualPathInput.trim()) {
                      void openDatabase(manualPathInput.trim(), { forceInline: true });
                    }
                  }}
                  style={{ padding: '6px 12px', fontSize: 12 }}
                >
                  Abrir
                </button>
              </div>

              <button
                type="button"
                className="op-btn primary"
                onClick={() => void browseAndOpenDatabase()}
                style={{
                  padding: '8px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                }}
              >
                <FolderOpen size={14} /> Procurar Arquivo SQLite no Computador...
              </button>

              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.4px' }}>
                  BANCOS ABERTOS RECENTEMENTE
                </div>
                {recentDatabases.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '12px 0' }}>
                    Nenhum banco aberto recentemente.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {recentDatabases.map((rPath) => {
                      const fileName = rPath.split(/[/\\]/).pop() || rPath;
                      return (
                        <div
                          key={rPath}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 9px',
                            borderRadius: 6,
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            gap: 8,
                          }}
                        >
                          <div
                            onClick={() => void openDatabase(rPath, { forceInline: true })}
                            style={{ flex: 1, minWidth: 0, cursor: 'default' }}
                            title={rPath}
                          >
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)' }}>{fileName}</div>
                            <div
                              style={{
                                fontSize: 10.5,
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {rPath}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="op-btn"
                            onClick={() => removeRecentDatabase(rPath)}
                            title="Remover do histórico recente"
                            style={{ padding: '3px 6px', border: 'none' }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Criar Novo Banco de Dados SQLite */}
            <div
              style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 700 }}>
                <Sparkles size={17} style={{ color: '#10b981' }} />
                <span>Criar Novo Banco de Dados SQLite</span>
              </div>
              {renderCreationCardContent()}
            </div>
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
              width: 265,
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
              {/* Seção TABELAS + Botão Nova Tabela */}
              <div
                style={{
                  padding: '4px 10px 4px 12px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>TABELAS ({filteredTables.length})</span>
                <button
                  type="button"
                  className="op-btn"
                  onClick={() => setShowNewTableModal(true)}
                  title="Criar nova tabela visualmente"
                  style={{
                    padding: '2px 7px',
                    fontSize: 10.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    color: '#10b981',
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <Plus size={11} /> Nova Tabela
                </button>
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
                        cursor: 'default',
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
                          cursor: 'default',
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
                        cursor: 'default',
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
                {/* Barra de Filtro, Ações CRUD e Paginação da Tabela */}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Table2 size={14} style={{ color: '#10b981' }} />
                      {activeTable || 'Nenhuma tabela'}
                    </span>
                    <div style={{ position: 'relative', flex: 1, maxWidth: 280, display: 'flex', alignItems: 'center' }}>
                      <Search
                        size={13}
                        style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }}
                      />
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Filtrar linhas (Enter)..."
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
                            cursor: 'default',
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

                    {activeTableObj && activeTableObj.type === 'table' && (
                      <>
                        <button
                          type="button"
                          className="op-btn primary"
                          onClick={handleOpenInsertRow}
                          style={{ padding: '4px 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Plus size={12} /> Inserir Registro
                        </button>
                        <button
                          type="button"
                          className="op-btn"
                          onClick={() => setShowAddColModal(true)}
                          style={{ padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Plus size={12} /> Coluna
                        </button>
                        <button
                          type="button"
                          className="op-btn"
                          onClick={() => void exportSQLDump(activeTableObj.name)}
                          title="Exportar instruções CREATE + INSERT (.SQL) desta tabela"
                          style={{ padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Download size={12} /> Dump .SQL
                        </button>
                      </>
                    )}
                  </div>

                  {/* Controles de Paginação */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                    {tableData && (() => {
                      const total = Number(
                        tableData.totalRows ||
                        tableData.totalCount ||
                        activeTableObj?.rowCount ||
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
                            tableData.totalRows ||
                            tableData.totalCount ||
                            activeTableObj?.rowCount ||
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

                {/* Painel Inline para Inserir Novo Registro */}
                {showInsertRowPanel && activeTableObj && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--bg-panel)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>
                        Inserir Novo Registro em "{activeTableObj.name}"
                      </span>
                      <button
                        type="button"
                        className="op-btn"
                        onClick={() => setShowInsertRowPanel(false)}
                        style={{ padding: '2px 6px' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                        gap: 8,
                        maxHeight: 170,
                        overflowY: 'auto',
                      }}
                    >
                      {(activeTableObj.columns || []).map((col) => {
                        const isNullChecked = !!insertRowNulls[col.name];
                        return (
                          <div
                            key={col.name}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                              padding: 6,
                              borderRadius: 6,
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                              <span style={{ fontWeight: 600 }}>
                                {col.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>({col.type})</span>
                              </span>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--text-muted)' }}>
                                <input
                                  type="checkbox"
                                  checked={isNullChecked}
                                  onChange={(e) =>
                                    setInsertRowNulls((prev) => ({ ...prev, [col.name]: e.target.checked }))
                                  }
                                />
                                NULL / Auto
                              </label>
                            </div>
                            <input
                              type="text"
                              className="search-input"
                              disabled={isNullChecked}
                              placeholder={isNullChecked ? 'NULL / Automático' : 'Valor...'}
                              value={insertRowValues[col.name] || ''}
                              onChange={(e) =>
                                setInsertRowValues((prev) => ({ ...prev, [col.name]: e.target.value }))
                              }
                              style={{ padding: '4px 7px', fontSize: 11.5 }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button type="button" className="op-btn" onClick={() => setShowInsertRowPanel(false)}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="op-btn primary"
                        onClick={() => void handleConfirmInsertRow()}
                        style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600 }}
                      >
                        Salvar Registro
                      </button>
                    </div>
                  </div>
                )}

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
                        'Selecione uma tabela na barra lateral ou crie uma nova tabela.'
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
                                  cursor: 'default',
                                  userSelect: 'none',
                                  whiteSpace: 'nowrap',
                                  backgroundColor: isSorted ? 'var(--bg-selected)' : 'var(--bg-subtle)',
                                }}
                                title="Clique para ordenar por esta coluna (duplo clique nas células para editar)"
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
                          {activeTableObj?.type === 'table' && (
                            <th
                              style={{
                                width: 42,
                                padding: '7px 6px',
                                textAlign: 'center',
                                borderBottom: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                fontSize: 10.5,
                              }}
                            >
                              Ações
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.rows.map((row, rIdx) => {
                          const pkColIdx = Math.max(0, tableData.columns.indexOf(primaryKeyColName));
                          const pkVal = row[pkColIdx] ?? '';
                          return (
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
                                const isEditingThis =
                                  editingCell?.rowIndex === rIdx && editingCell?.colName === colName;

                                return (
                                  <td
                                    key={cIdx}
                                    onClick={() => setSelectedCellValue({ col: colName, val: cell })}
                                    onDoubleClick={() => {
                                      if (activeTableObj?.type !== 'table' || !primaryKeyColName) return;
                                      setEditingCell({
                                        rowIndex: rIdx,
                                        colName,
                                        pkCol: primaryKeyColName,
                                        pkVal,
                                        value: isNull ? '' : cell,
                                      });
                                    }}
                                    style={{
                                      padding: isEditingThis ? '2px 4px' : '5px 10px',
                                      borderRight: '1px solid var(--border-subtle)',
                                      maxWidth: 320,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      cursor: 'default',
                                      color: isNull ? 'var(--text-muted)' : 'var(--text-primary)',
                                      fontStyle: isNull ? 'italic' : 'normal',
                                    }}
                                    title="Duplo clique para editar valor inline"
                                  >
                                    {isEditingThis ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <input
                                          type="text"
                                          autoFocus
                                          className="search-input"
                                          value={editingCell.value}
                                          onChange={(e) =>
                                            setEditingCell((prev) =>
                                              prev ? { ...prev, value: e.target.value } : null
                                            )
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              void handleCommitInlineCell(false);
                                            } else if (e.key === 'Escape') {
                                              setEditingCell(null);
                                            }
                                          }}
                                          style={{ flex: 1, padding: '2px 6px', fontSize: 11.5 }}
                                        />
                                        <button
                                          type="button"
                                          className="op-btn primary"
                                          onClick={() => void handleCommitInlineCell(false)}
                                          title="Salvar (Enter)"
                                          style={{ padding: '2px 5px', fontSize: 10 }}
                                        >
                                          <Check size={11} />
                                        </button>
                                        <button
                                          type="button"
                                          className="op-btn"
                                          onClick={() => void handleCommitInlineCell(true)}
                                          title="Definir como NULL"
                                          style={{ padding: '2px 5px', fontSize: 9.5 }}
                                        >
                                          NULL
                                        </button>
                                        <button
                                          type="button"
                                          className="op-btn"
                                          onClick={() => setEditingCell(null)}
                                          title="Cancelar (Esc)"
                                          style={{ padding: '2px 4px' }}
                                        >
                                          <X size={11} />
                                        </button>
                                      </div>
                                    ) : isNull ? (
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
                              {activeTableObj?.type === 'table' && (
                                <td
                                  style={{
                                    padding: '3px 6px',
                                    textAlign: 'center',
                                    borderRight: '1px solid var(--border-subtle)',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="op-btn danger"
                                    onClick={() => {
                                      if (primaryKeyColName && pkVal !== undefined) {
                                        void deleteTableRow(activeTableObj.name, primaryKeyColName, pkVal);
                                      }
                                    }}
                                    title={`Excluir linha (${primaryKeyColName} = ${pkVal})`}
                                    style={{ padding: '2px 5px', border: 'none' }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
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
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Edit3 size={11} /> Duplo clique na célula para editar
                      </span>
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
                {/* Barra de Abas SQL Multi-Tab + Favoritos */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 10px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-sidebar)',
                    gap: 8,
                    overflowX: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }}>
                    {sqlTabs.map((tab) => {
                      const active = tab.id === activeSqlTabId;
                      return (
                        <div
                          key={tab.id}
                          onClick={() => selectSqlTab(tab.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: active ? 700 : 500,
                            background: active ? 'var(--bg-selected)' : 'transparent',
                            color: active ? 'var(--accent)' : 'var(--text-muted)',
                            border: active ? '1px solid var(--accent)' : '1px solid transparent',
                            cursor: 'default',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Terminal size={11} />
                          <span>{tab.title}</span>
                          {sqlTabs.length > 1 && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                closeSqlTab(tab.id);
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.7 }}
                            >
                              <X size={11} />
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="op-btn"
                      onClick={() => addSqlTab()}
                      title="Nova aba de consulta SQL"
                      style={{ padding: '3px 7px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    >
                      <Plus size={11} /> Nova Aba SQL
                    </button>
                  </div>

                  {/* Salvar Consulta nos Favoritos */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {showSaveQueryPrompt ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="text"
                          className="search-input"
                          placeholder="Nome da consulta..."
                          value={favoriteQueryName}
                          onChange={(e) => setFavoriteQueryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              saveFavoriteQuery(favoriteQueryName);
                              setFavoriteQueryName('');
                              setShowSaveQueryPrompt(false);
                            }
                          }}
                          style={{ padding: '3px 7px', fontSize: 11, width: 150 }}
                        />
                        <button
                          type="button"
                          className="op-btn primary"
                          onClick={() => {
                            saveFavoriteQuery(favoriteQueryName);
                            setFavoriteQueryName('');
                            setShowSaveQueryPrompt(false);
                          }}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="op-btn"
                          onClick={() => setShowSaveQueryPrompt(false)}
                          style={{ padding: '3px 6px' }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="op-btn"
                        onClick={() => setShowSaveQueryPrompt(true)}
                        style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Bookmark size={11} /> Salvar Consulta
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de Snippets SQL e Execução */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 12px',
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

                {/* Editor SQL com Autocomplete Contextual */}
                <div style={{ height: 185, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                  <textarea
                    ref={sqlTextareaRef}
                    value={sqlQuery}
                    onChange={(e) => {
                      setSqlQuery(e.target.value);
                      updateCursorWordFromTextarea(e.target);
                    }}
                    onKeyUp={(e) => updateCursorWordFromTextarea(e.currentTarget)}
                    onClick={(e) => updateCursorWordFromTextarea(e.currentTarget)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void runCustomSQL();
                        return;
                      }
                      if (e.key === 'Tab' && sqlSuggestions.length > 0) {
                        e.preventDefault();
                        applyAutocompleteSuggestion(sqlSuggestions[0].label);
                      }
                    }}
                    placeholder="Digite sua consulta SQL (SELECT, PRAGMA, INSERT, UPDATE, DELETE, CREATE...) — Tab autocompleta tabelas/colunas, Ctrl+Enter executa"
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

                  {/* Sugestões de Autocomplete SQL */}
                  {sqlSuggestions.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 10px',
                        borderTop: '1px solid var(--border)',
                        background: 'var(--bg-panel)',
                        overflowX: 'auto',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
                        Autocompletar (Tab):
                      </span>
                      {sqlSuggestions.map((s) => (
                        <button
                          key={`${s.kind}-${s.label}`}
                          type="button"
                          className="op-btn"
                          onClick={() => applyAutocompleteSuggestion(s.label)}
                          style={{
                            padding: '2px 7px',
                            fontSize: 10.5,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            flexShrink: 0,
                          }}
                        >
                          <span style={{ opacity: 0.65, fontSize: 9.5 }}>
                            {s.kind === 'table' ? 'TBL' : s.kind === 'column' ? 'COL' : 'SQL'}
                          </span>
                          <span style={{ fontWeight: 600 }}>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Favoritos e Histórico */}
                  {(savedQueries.length > 0 || queryHistory.length > 0) && (
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
                      {savedQueries.length > 0 && (
                        <>
                          <span style={{ color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>Favoritas:</span>
                          {savedQueries.map((fav) => (
                            <span
                              key={fav.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 7px',
                                borderRadius: 5,
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border)',
                                fontSize: 10.5,
                                flexShrink: 0,
                              }}
                            >
                              <span
                                onClick={() => setSqlQuery(fav.query)}
                                style={{ cursor: 'default', fontWeight: 600 }}
                                title={fav.query}
                              >
                                {fav.name}
                              </span>
                              <span
                                onClick={() => deleteFavoriteQuery(fav.id)}
                                style={{ cursor: 'default', opacity: 0.65 }}
                                title="Remover favorito"
                              >
                                <X size={10} />
                              </span>
                            </span>
                          ))}
                        </>
                      )}

                      {queryHistory.length > 0 && (
                        <>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>
                            Histórico:
                          </span>
                          {queryHistory.slice(0, 6).map((h) => (
                            <button
                              key={h.id}
                              type="button"
                              className="op-btn"
                              onClick={() => setSqlQuery(h.query)}
                              style={{
                                padding: '2px 7px',
                                fontSize: 10.5,
                                maxWidth: 200,
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
                        </>
                      )}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                          Colunas de {activeTableObj.name} ({activeTableObj.columns?.length || 0})
                        </div>
                        {activeTableObj.type === 'table' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="op-btn primary"
                              onClick={() => setShowAddColModal(true)}
                              style={{ padding: '4px 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Plus size={12} /> Adicionar Coluna
                            </button>
                            <button
                              type="button"
                              className="op-btn"
                              onClick={() => void exportSQLDump(activeTableObj.name)}
                              style={{ padding: '4px 10px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Download size={12} /> Exportar Dump .SQL
                            </button>
                          </div>
                        )}
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
                            <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>Chaves</th>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {col.pk && (
                                    <span style={{ color: '#f59e0b', fontWeight: 700, backgroundColor: 'rgba(245,158,11,0.15)', padding: '1px 5px', borderRadius: 3, fontSize: 10.5 }}>
                                      PK
                                    </span>
                                  )}
                                  {col.fk && (
                                    <span
                                      title={`Chave Estrangeira → ${col.fkTarget || 'referência'}`}
                                      style={{ color: '#a78bfa', fontWeight: 700, backgroundColor: 'rgba(167,139,250,0.15)', padding: '1px 5px', borderRadius: 3, fontSize: 10.5 }}
                                    >
                                      FK {col.fkTarget ? `→ ${col.fkTarget}` : ''}
                                    </span>
                                  )}
                                  {!col.pk && !col.fk && (
                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                  )}
                                </div>
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

            {activeTabMode === 'erd' && (
              <ERDiagramView
                schema={schema}
                onSelectTable={(tableName) => {
                  void selectTable(tableName);
                }}
                onOpenTableData={(tableName) => {
                  void selectTable(tableName);
                  setActiveTabMode('data');
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
