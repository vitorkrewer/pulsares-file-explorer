import { create } from 'zustand';
import {
  dbInspectSchema,
  dbQueryTable,
  dbExecuteSQL,
  openDBStudioWindowNative,
  writeTextFile,
  showSaveFileDialog,
  isWailsAvailable,
  DBSchemaInfo,
  DBQueryResult,
} from '../../lib/wails';

const DB_EXTENSIONS = new Set(['db', 'sqlite', 'sqlite3', 'db3', 's3db', 'sl3']);

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

export type DBStudioTabMode = 'data' | 'query' | 'schema';

export interface SQLHistoryItem {
  id: string;
  query: string;
  durationMs: number;
  rowCount: number;
  timestamp: string;
}

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
  queryResult: DBQueryResult | null;
  queryHistory: SQLHistoryItem[];
  loading: boolean;
  queryLoading: boolean;
  error: string | null;
  toastMessage: string | null;

  openDatabase: (path: string, opts?: { forceInline?: boolean }) => Promise<void>;
  refreshSchema: () => Promise<void>;
  selectTable: (tableName: string) => Promise<void>;
  setActiveTabMode: (mode: DBStudioTabMode) => void;
  setTablePage: (offset: number, limit?: number) => Promise<void>;
  setTableFilter: (filter: string) => Promise<void>;
  toggleTableSort: (colName: string) => Promise<void>;
  setSqlQuery: (sql: string) => void;
  runCustomSQL: (customSql?: string) => Promise<void>;
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
  preferSeparateWindow: false,
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
  sqlQuery: 'SELECT name, type, tbl_name FROM sqlite_master ORDER BY type, name;',
  queryResult: null,
  queryHistory: [],
  loading: false,
  queryLoading: false,
  error: null,
  toastMessage: null,

  openDatabase: async (path: string, opts?: { forceInline?: boolean }) => {
    const cleanPath = (path || '').trim();
    if (!cleanPath) {
      set({ isOpen: true, isMinimized: false });
      return;
    }

    if (!opts?.forceInline && !isStandaloneDBStudioWindow() && get().preferSeparateWindow) {
      const openedNative = await openDBStudioWindowNative(cleanPath);
      if (openedNative) {
        return;
      }
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

      set({
        schema,
        activeTable: firstObj,
        pageOffset: 0,
        tableFilter: '',
        sortCol: '',
        sortDir: 'ASC',
        sqlQuery: defaultQuery,
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

  setSqlQuery: (sql: string) => set({ sqlQuery: sql }),

  runCustomSQL: async (customSql?: string) => {
    const { dbPath, sqlQuery, queryHistory } = get();
    const targetSql = (customSql ?? sqlQuery).trim();
    if (!dbPath || !targetSql) return;
    if (customSql !== undefined) {
      set({ sqlQuery: customSql });
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

