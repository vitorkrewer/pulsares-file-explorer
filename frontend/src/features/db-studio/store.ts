import { create } from 'zustand';
import {
  dbInspectSchema,
  dbQueryTable,
  dbExecuteSQL,
  dbCreateDatabaseFromScratch,
  dbUpdateCell,
  dbInsertRow,
  dbDeleteRow,
  dbRunMaintenance,
  dbExportSQLDump,
  openDBStudioWindowNative,
  writeTextFile,
  showOpenFileDialog,
  showSaveFileDialog,
  isWailsAvailable,
  DBSchemaInfo,
  DBQueryResult,
} from '../../lib/wails';

const DB_EXTENSIONS = new Set(['db', 'sqlite', 'sqlite3', 'db3', 's3db', 'sl3']);
const RECENT_DBS_STORAGE_KEY = 'pulsares.dbstudio.recent.v1';
const SAVED_QUERIES_STORAGE_KEY = 'pulsares.dbstudio.savedQueries.v1';

export function isDatabaseFile(nameOrPath: string): boolean {
  if (!nameOrPath) return false;
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0) return false;
  return DB_EXTENSIONS.has(base.slice(dot + 1));
}

let dedicatedDBStudioWindowFlag = false;

export function setDedicatedDBStudioWindow(val: boolean): void {
  dedicatedDBStudioWindowFlag = val;
}

export function isStandaloneDBStudioWindow(): boolean {
  if (dedicatedDBStudioWindowFlag) return true;
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('dbstudio') === '1';
  } catch {
    return false;
  }
}

export type DBStudioTabMode = 'data' | 'query' | 'schema' | 'erd';

export interface SQLHistoryItem {
  id: string;
  query: string;
  durationMs: number;
  rowCount: number;
  timestamp: string;
}

export interface SQLTabItem {
  id: string;
  title: string;
  query: string;
}

export interface SavedSQLQueryItem {
  id: string;
  name: string;
  query: string;
}

function loadRecentDatabases(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_DBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 12);
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function saveRecentDatabases(list: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_DBS_STORAGE_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    // ignore storage errors
  }
}

function loadSavedQueries(): SavedSQLQueryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_QUERIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (x): x is SavedSQLQueryItem =>
          x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.query === 'string'
      );
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function persistSavedQueries(list: SavedSQLQueryItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVED_QUERIES_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

const INITIAL_SQL = 'SELECT name, type, tbl_name FROM sqlite_master ORDER BY type, name;';
const INITIAL_TAB_ID = 'sql-tab-1';

interface DBStudioState {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  preferSeparateWindow: boolean;
  dbPath: string;
  schema: DBSchemaInfo | null;
  activeTable: string;
  activeTabMode: DBStudioTabMode;
  tableData: DBQueryResult | null;
  pageLimit: number;
  pageOffset: number;
  tableFilter: string;
  sortCol: string;
  sortDir: 'ASC' | 'DESC';
  sqlQuery: string;
  sqlTabs: SQLTabItem[];
  activeSqlTabId: string;
  savedQueries: SavedSQLQueryItem[];
  recentDatabases: string[];
  queryResult: DBQueryResult | null;
  queryHistory: SQLHistoryItem[];
  loading: boolean;
  queryLoading: boolean;
  error: string | null;
  toastMessage: string | null;

  openDatabase: (path: string, opts?: { forceInline?: boolean }) => Promise<void>;
  browseAndOpenDatabase: () => Promise<void>;
  createNewDatabase: (destPath: string, initialSQL: string, enableWAL: boolean) => Promise<boolean>;
  removeRecentDatabase: (path: string) => void;
  refreshSchema: () => Promise<void>;
  selectTable: (tableName: string) => Promise<void>;
  setActiveTabMode: (mode: DBStudioTabMode) => void;
  setTablePage: (offset: number, limit?: number) => Promise<void>;
  setTableFilter: (filter: string) => Promise<void>;
  toggleTableSort: (colName: string) => Promise<void>;
  setSqlQuery: (sql: string) => void;
  addSqlTab: (title?: string, initialQuery?: string) => void;
  selectSqlTab: (tabId: string) => void;
  closeSqlTab: (tabId: string) => void;
  saveFavoriteQuery: (name: string, query?: string) => void;
  deleteFavoriteQuery: (id: string) => void;
  runCustomSQL: (customSql?: string) => Promise<void>;
  updateCellValue: (
    tableName: string,
    pkCol: string,
    pkVal: string,
    targetCol: string,
    newVal: string,
    isNull: boolean
  ) => Promise<boolean>;
  insertTableRow: (
    tableName: string,
    values: Record<string, string>,
    nullCols: string[]
  ) => Promise<boolean>;
  deleteTableRow: (tableName: string, pkCol: string, pkVal: string) => Promise<boolean>;
  runMaintenance: (
    action: 'vacuum' | 'analyze' | 'integrity' | 'foreign_keys' | 'wal_checkpoint'
  ) => Promise<void>;
  exportSQLDump: (targetTable?: string) => Promise<void>;
  detachToSeparateWindow: () => Promise<void>;
  exportCurrentResult: (format: 'csv' | 'json') => Promise<void>;
  setMinimized: (val: boolean) => void;
  toggleMaximize: () => void;
  closeDBStudio: () => void;
}

export const useDBStudioStore = create<DBStudioState>((set, get) => ({
  isOpen: isStandaloneDBStudioWindow(),
  isMinimized: false,
  isMaximized: false,
  preferSeparateWindow: true,
  dbPath: '',
  schema: null,
  activeTable: '',
  activeTabMode: 'data',
  tableData: null,
  pageLimit: 100,
  pageOffset: 0,
  tableFilter: '',
  sortCol: '',
  sortDir: 'ASC',
  sqlQuery: INITIAL_SQL,
  sqlTabs: [{ id: INITIAL_TAB_ID, title: 'Consulta 1', query: INITIAL_SQL }],
  activeSqlTabId: INITIAL_TAB_ID,
  savedQueries: loadSavedQueries(),
  recentDatabases: loadRecentDatabases(),
  queryResult: null,
  queryHistory: [],
  loading: false,
  queryLoading: false,
  error: null,
  toastMessage: null,

  openDatabase: async (path: string, opts?: { forceInline?: boolean }) => {
    const cleanPath = (path || '').trim();

    if (!opts?.forceInline && !isStandaloneDBStudioWindow() && get().preferSeparateWindow) {
      const openedNative = await openDBStudioWindowNative(cleanPath);
      if (openedNative) {
        return;
      }
    }

    if (!cleanPath) {
      set({ isOpen: true, isMinimized: false, dbPath: '' });
      return;
    }

    set({
      isOpen: true,
      isMinimized: false,
      dbPath: cleanPath,
      loading: true,
      error: null,
    });

    try {
      const schema = await dbInspectSchema(cleanPath);
      const firstObj = schema.tables?.[0]?.name || schema.views?.[0]?.name || '';
      const defaultQuery = firstObj
        ? `SELECT * FROM "${firstObj.replace(/"/g, '""')}" LIMIT 50;`
        : 'SELECT name, type, sql FROM sqlite_master;';

      const nextRecent = [
        cleanPath,
        ...get().recentDatabases.filter((p) => p.toLowerCase() !== cleanPath.toLowerCase()),
      ].slice(0, 12);
      saveRecentDatabases(nextRecent);

      const currentTabs = get().sqlTabs;
      const activeId = get().activeSqlTabId;
      const updatedTabs =
        currentTabs.length > 0
          ? currentTabs.map((t) => (t.id === activeId ? { ...t, query: defaultQuery } : t))
          : [{ id: INITIAL_TAB_ID, title: 'Consulta 1', query: defaultQuery }];

      set({
        schema,
        activeTable: firstObj,
        pageOffset: 0,
        tableFilter: '',
        sortCol: '',
        sortDir: 'ASC',
        sqlQuery: defaultQuery,
        sqlTabs: updatedTabs,
        recentDatabases: nextRecent,
        loading: false,
      });

      if (firstObj) {
        await get().selectTable(firstObj);
      } else {
        set({ tableData: null, activeTabMode: 'query' });
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  browseAndOpenDatabase: async () => {
    try {
      const currentDb = get().dbPath;
      const baseDir = currentDb ? currentDb.replace(/[/\\][^/\\]+$/, '') : '';
      const picked = await showOpenFileDialog({
        title: 'Abrir Banco de Dados SQLite',
        defaultDirectory: baseDir,
        defaultFilename: '',
        filterDisplayName: 'Bancos SQLite (*.db, *.sqlite, *.sqlite3)',
        filterPattern: '*.db;*.sqlite;*.sqlite3;*.db3',
      });
      if (picked && picked.trim()) {
        await get().openDatabase(picked.trim(), { forceInline: true });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  createNewDatabase: async (destPath: string, initialSQL: string, enableWAL: boolean) => {
    const cleanDest = (destPath || '').trim();
    if (!cleanDest) {
      set({ error: 'Informe o caminho de destino para criar o banco de dados.' });
      return false;
    }
    set({ loading: true, error: null });
    try {
      const createdPath = await dbCreateDatabaseFromScratch(cleanDest, initialSQL, enableWAL);
      await get().openDatabase(createdPath || cleanDest, { forceInline: true });
      set({ toastMessage: `Banco de dados criado com sucesso: ${createdPath || cleanDest}` });
      setTimeout(() => set({ toastMessage: null }), 4000);
      return true;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  removeRecentDatabase: (path: string) => {
    const next = get().recentDatabases.filter((p) => p !== path);
    saveRecentDatabases(next);
    set({ recentDatabases: next });
  },

  refreshSchema: async () => {
    const { dbPath, activeTable } = get();
    if (!dbPath) return;
    set({ loading: true, error: null });
    try {
      const schema = await dbInspectSchema(dbPath);
      const stillExists =
        schema.tables?.some((t) => t.name === activeTable) ||
        schema.views?.some((v) => v.name === activeTable);
      const nextTable = stillExists
        ? activeTable
        : schema.tables?.[0]?.name || schema.views?.[0]?.name || '';
      set({ schema, activeTable: nextTable, loading: false });
      if (nextTable) {
        const res = await dbQueryTable(
          dbPath,
          nextTable,
          get().pageLimit,
          get().pageOffset,
          get().tableFilter,
          get().sortCol,
          get().sortDir
        );
        set({ tableData: res });
      } else {
        set({ tableData: null });
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  selectTable: async (tableName: string) => {
    const { dbPath, pageLimit } = get();
    if (!dbPath || !tableName) return;
    set({
      activeTable: tableName,
      pageOffset: 0,
      tableFilter: '',
      sortCol: '',
      sortDir: 'ASC',
      queryLoading: true,
      error: null,
    });
    try {
      const res = await dbQueryTable(dbPath, tableName, pageLimit, 0, '', '', 'ASC');
      set({
        tableData: res,
        queryLoading: false,
      });
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setActiveTabMode: (mode) => set({ activeTabMode: mode }),

  setTablePage: async (offset: number, limit?: number) => {
    const { dbPath, activeTable, pageLimit, tableFilter, sortCol, sortDir } = get();
    if (!dbPath || !activeTable) return;
    const nextLimit = limit ?? pageLimit;
    const nextOffset = Math.max(0, offset);
    set({ pageOffset: nextOffset, pageLimit: nextLimit, queryLoading: true, error: null });
    try {
      const res = await dbQueryTable(
        dbPath,
        activeTable,
        nextLimit,
        nextOffset,
        tableFilter,
        sortCol,
        sortDir
      );
      set({ tableData: res, queryLoading: false });
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setTableFilter: async (filter: string) => {
    const { dbPath, activeTable, pageLimit, sortCol, sortDir } = get();
    set({ tableFilter: filter, pageOffset: 0 });
    if (!dbPath || !activeTable) return;
    set({ queryLoading: true, error: null });
    try {
      const res = await dbQueryTable(dbPath, activeTable, pageLimit, 0, filter, sortCol, sortDir);
      set({ tableData: res, queryLoading: false });
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  toggleTableSort: async (colName: string) => {
    const { dbPath, activeTable, pageLimit, pageOffset, tableFilter, sortCol, sortDir } = get();
    if (!dbPath || !activeTable) return;
    let nextCol = colName;
    let nextDir: 'ASC' | 'DESC' = 'ASC';
    if (sortCol === colName) {
      if (sortDir === 'ASC') {
        nextDir = 'DESC';
      } else {
        nextCol = '';
        nextDir = 'ASC';
      }
    }
    set({ sortCol: nextCol, sortDir: nextDir, queryLoading: true, error: null });
    try {
      const res = await dbQueryTable(
        dbPath,
        activeTable,
        pageLimit,
        pageOffset,
        tableFilter,
        nextCol,
        nextDir
      );
      set({ tableData: res, queryLoading: false });
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setSqlQuery: (sql: string) => {
    const { sqlTabs, activeSqlTabId } = get();
    const nextTabs = sqlTabs.map((t) => (t.id === activeSqlTabId ? { ...t, query: sql } : t));
    set({ sqlQuery: sql, sqlTabs: nextTabs });
  },

  addSqlTab: (title?: string, initialQuery?: string) => {
    const { sqlTabs, activeTable } = get();
    const nextNum = sqlTabs.length + 1;
    const newId = `sql-tab-${Date.now()}-${nextNum}`;
    const defaultSql =
      initialQuery ??
      (activeTable
        ? `SELECT * FROM "${activeTable.replace(/"/g, '""')}" LIMIT 50;`
        : 'SELECT name, type, tbl_name FROM sqlite_master ORDER BY type, name;');
    const newTab: SQLTabItem = {
      id: newId,
      title: title || `Consulta ${nextNum}`,
      query: defaultSql,
    };
    set({
      sqlTabs: [...sqlTabs, newTab],
      activeSqlTabId: newId,
      sqlQuery: defaultSql,
    });
  },

  selectSqlTab: (tabId: string) => {
    const target = get().sqlTabs.find((t) => t.id === tabId);
    if (!target) return;
    set({
      activeSqlTabId: target.id,
      sqlQuery: target.query,
    });
  },

  closeSqlTab: (tabId: string) => {
    const { sqlTabs, activeSqlTabId } = get();
    if (sqlTabs.length <= 1) return;
    const idx = sqlTabs.findIndex((t) => t.id === tabId);
    const remaining = sqlTabs.filter((t) => t.id !== tabId);
    if (activeSqlTabId === tabId) {
      const nextActive = remaining[Math.max(0, idx - 1)] || remaining[0];
      set({
        sqlTabs: remaining,
        activeSqlTabId: nextActive.id,
        sqlQuery: nextActive.query,
      });
    } else {
      set({ sqlTabs: remaining });
    }
  },

  saveFavoriteQuery: (name: string, query?: string) => {
    const targetQuery = (query ?? get().sqlQuery).trim();
    const cleanName = (name || '').trim() || `Consulta #${get().savedQueries.length + 1}`;
    if (!targetQuery) return;
    const newItem: SavedSQLQueryItem = {
      id: `fav-${Date.now()}`,
      name: cleanName,
      query: targetQuery,
    };
    const next = [newItem, ...get().savedQueries];
    persistSavedQueries(next);
    set({
      savedQueries: next,
      toastMessage: `Consulta "${cleanName}" salva nos favoritos`,
    });
    setTimeout(() => set({ toastMessage: null }), 3000);
  },

  deleteFavoriteQuery: (id: string) => {
    const next = get().savedQueries.filter((q) => q.id !== id);
    persistSavedQueries(next);
    set({ savedQueries: next });
  },

  runCustomSQL: async (customSql?: string) => {
    const { dbPath, sqlQuery, queryHistory, sqlTabs, activeSqlTabId } = get();
    const targetSql = (customSql ?? sqlQuery).trim();
    if (!dbPath || !targetSql) return;
    if (customSql !== undefined) {
      const nextTabs = sqlTabs.map((t) =>
        t.id === activeSqlTabId ? { ...t, query: customSql } : t
      );
      set({ sqlQuery: customSql, sqlTabs: nextTabs });
    }
    set({ queryLoading: true, error: null, activeTabMode: 'query' });
    try {
      const res = await dbExecuteSQL(dbPath, targetSql);
      const historyItem: SQLHistoryItem = {
        id: `${Date.now()}`,
        query: targetSql,
        durationMs: res.durationMs,
        rowCount: res.isSelect ? res.totalRows : res.rowsAffected,
        timestamp: new Date().toLocaleTimeString(),
      };
      set({
        queryResult: res,
        queryHistory: [historyItem, ...queryHistory.filter((h) => h.query !== targetSql)].slice(0, 25),
        queryLoading: false,
      });
      if (!res.isSelect) {
        await get().refreshSchema();
      }
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  updateCellValue: async (
    tableName: string,
    pkCol: string,
    pkVal: string,
    targetCol: string,
    newVal: string,
    isNull: boolean
  ) => {
    const { dbPath, pageLimit, pageOffset, tableFilter, sortCol, sortDir } = get();
    if (!dbPath || !tableName) return false;
    set({ queryLoading: true, error: null });
    try {
      await dbUpdateCell(dbPath, tableName, pkCol, pkVal, targetCol, newVal, isNull);
      const res = await dbQueryTable(
        dbPath,
        tableName,
        pageLimit,
        pageOffset,
        tableFilter,
        sortCol,
        sortDir
      );
      set({
        tableData: res,
        queryLoading: false,
        toastMessage: `Célula [${targetCol}] atualizada com sucesso`,
      });
      setTimeout(() => set({ toastMessage: null }), 2500);
      return true;
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  insertTableRow: async (
    tableName: string,
    values: Record<string, string>,
    nullCols: string[]
  ) => {
    const { dbPath } = get();
    if (!dbPath || !tableName) return false;
    set({ queryLoading: true, error: null });
    try {
      await dbInsertRow(dbPath, tableName, values, nullCols);
      await get().refreshSchema();
      set({
        queryLoading: false,
        toastMessage: `Novo registro inserido em "${tableName}"`,
      });
      setTimeout(() => set({ toastMessage: null }), 3000);
      return true;
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  deleteTableRow: async (tableName: string, pkCol: string, pkVal: string) => {
    const { dbPath } = get();
    if (!dbPath || !tableName) return false;
    set({ queryLoading: true, error: null });
    try {
      await dbDeleteRow(dbPath, tableName, pkCol, pkVal);
      await get().refreshSchema();
      set({
        queryLoading: false,
        toastMessage: `Registro removido de "${tableName}"`,
      });
      setTimeout(() => set({ toastMessage: null }), 2800);
      return true;
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  runMaintenance: async (
    action: 'vacuum' | 'analyze' | 'integrity' | 'foreign_keys' | 'wal_checkpoint'
  ) => {
    const { dbPath } = get();
    if (!dbPath) return;
    set({ queryLoading: true, error: null });
    try {
      const res = await dbRunMaintenance(dbPath, action);
      await get().refreshSchema();
      set({
        activeTabMode: 'query',
        queryResult: res,
        queryLoading: false,
        toastMessage: res.message || `Manutenção (${action.toUpperCase()}) concluída (${res.durationMs} ms)`,
      });
      setTimeout(() => set({ toastMessage: null }), 4000);
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  exportSQLDump: async (targetTable?: string) => {
    const { dbPath } = get();
    if (!dbPath) return;
    set({ queryLoading: true, error: null });
    try {
      const sqlContent = await dbExportSQLDump(dbPath, targetTable || '');
      set({ queryLoading: false });

      const baseDir = dbPath.replace(/[/\\][^/\\]+$/, '');
      const dbBase = (dbPath.split(/[/\\]/).pop() || 'database').replace(/\.[^.]+$/, '');
      const suffix = targetTable ? `_${targetTable.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '_dump';
      const defaultFilename = `${dbBase}${suffix}.sql`;

      if (isWailsAvailable()) {
        const chosenPath = await showSaveFileDialog({
          title: 'Salvar Dump SQL',
          defaultDirectory: baseDir,
          defaultFilename,
          filterDisplayName: 'Script SQL (*.sql)',
          filterPattern: '*.sql',
        });
        if (!chosenPath) return;
        await writeTextFile(chosenPath, sqlContent);
        set({ toastMessage: `Dump SQL exportado para ${chosenPath}` });
        setTimeout(() => set({ toastMessage: null }), 3500);
        return;
      }

      const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultFilename;
      a.click();
      URL.revokeObjectURL(url);
      set({ toastMessage: `Dump SQL exportado (${defaultFilename})` });
      setTimeout(() => set({ toastMessage: null }), 3500);
    } catch (err) {
      set({
        queryLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  detachToSeparateWindow: async () => {
    const { dbPath } = get();
    const opened = await openDBStudioWindowNative(dbPath);
    if (opened && !isStandaloneDBStudioWindow()) {
      set({ isOpen: false });
    }
  },

  exportCurrentResult: async (format: 'csv' | 'json') => {
    const { activeTabMode, tableData, queryResult, dbPath, activeTable } = get();
    const activeRes = activeTabMode === 'query' ? queryResult : tableData;
    if (!activeRes || !activeRes.columns || activeRes.columns.length === 0) return;

    let content = '';
    const ext = format;
    if (format === 'csv') {
      const escapeCsv = (val: string) => {
        const s = val ?? '';
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const lines = [
        activeRes.columns.map(escapeCsv).join(','),
        ...activeRes.rows.map((r) => r.map(escapeCsv).join(',')),
      ];
      content = lines.join('\n');
    } else {
      const objs = activeRes.rows.map((row) => {
        const obj: Record<string, string | null> = {};
        activeRes.columns.forEach((col, idx) => {
          obj[col] = row[idx] === 'NULL' ? null : row[idx];
        });
        return obj;
      });
      content = JSON.stringify(objs, null, 2);
    }

    const baseDir = dbPath ? dbPath.replace(/[/\\][^/\\]+$/, '') : '';
    const safeTable = (activeTable || 'query_export').replace(/[^a-zA-Z0-9_-]/g, '_');
    const defaultFilename = `${safeTable}_export.${ext}`;

    // 1. Tentar diálogo nativo do sistema operacional (Wails)
    if (isWailsAvailable()) {
      let chosenPath = '';
      try {
        chosenPath = await showSaveFileDialog({
          title: format === 'csv' ? 'Salvar Exportação CSV' : 'Salvar Exportação JSON',
          defaultDirectory: baseDir,
          defaultFilename,
          filterDisplayName: format === 'csv' ? 'Arquivos CSV (*.csv)' : 'Arquivos JSON (*.json)',
          filterPattern: `*.${ext}`,
        });
      } catch (err) {
        console.error('Erro ao abrir diálogo de salvamento:', err);
      }

      // Se o usuário cancelou o diálogo de seleção de arquivo
      if (!chosenPath) {
        return;
      }

      try {
        await writeTextFile(chosenPath, content);
        set({ toastMessage: `Exportado com sucesso para ${chosenPath}` });
        setTimeout(() => set({ toastMessage: null }), 3500);
      } catch (err) {
        console.error('Falha ao salvar arquivo exportado:', err);
        set({ toastMessage: `Erro ao exportar para ${chosenPath}` });
        setTimeout(() => set({ toastMessage: null }), 3500);
      }
      return;
    }

    // 2. Fallback para navegador web (desenvolvimento / browser puro)
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as unknown as {
          showSaveFilePicker: (options: unknown) => Promise<{
            createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
          }>;
        }).showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [
            {
              description: format === 'csv' ? 'Arquivo CSV (*.csv)' : 'Arquivo JSON (*.json)',
              accept: {
                [format === 'csv' ? 'text/csv' : 'application/json']: [`.${ext}`],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        set({ toastMessage: `Exportado com sucesso` });
        setTimeout(() => set({ toastMessage: null }), 3500);
        return;
      } catch (pickerErr: unknown) {
        if ((pickerErr as { name?: string })?.name === 'AbortError') return;
      }
    }

    const blob = new Blob([content], {
      type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    a.click();
    URL.revokeObjectURL(url);
  },

  setMinimized: (val) => set({ isMinimized: val }),
  toggleMaximize: () => set((s) => ({ isMaximized: !s.isMaximized, isMinimized: false })),
  closeDBStudio: () => set({ isOpen: false, isMinimized: false }),
}));
