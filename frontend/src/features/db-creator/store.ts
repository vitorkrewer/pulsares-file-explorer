import { create } from 'zustand';
import {
  dbCreatorInspectSource,
  dbCreatorExecute,
  DBCreatorInspection,
  DBCreatorColumnDef,
  DBCreatorProgressEvent,
  DBCreatorResult,
  subscribeEvent,
  showSaveFileDialog,
} from '../../lib/wails';

const CONVERTIBLE_EXTENSIONS = new Set([
  'csv',
  'tsv',
  'tab',
  'json',
  'jsonl',
  'ndjson',
]);

export function isConvertibleToDB(nameOrPath: string): boolean {
  if (!nameOrPath) return false;
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = base.slice(dot + 1);
  return CONVERTIBLE_EXTENSIONS.has(ext);
}

export type DBCreatorViewMode = 'simple' | 'developer';
export type DBCreatorStep = 'config' | 'importing' | 'completed' | 'error';

export interface DBCreatorState {
  isOpen: boolean;
  sourcePath: string;
  viewMode: DBCreatorViewMode;
  step: DBCreatorStep;
  loadingInspection: boolean;
  inspection: DBCreatorInspection | null;
  errorMessage: string | null;

  // Formulário de configuração
  destinationPath: string;
  tableName: string;
  columns: DBCreatorColumnDef[];
  addAutoId: boolean;
  delimiter: string;
  hasHeader: boolean;
  batchSize: number;
  enableWal: boolean;
  customDdl: string;

  // Execução e Progresso
  progress: DBCreatorProgressEvent | null;
  logs: string[];
  result: DBCreatorResult | null;

  // Ações
  openCreator: (sourcePath: string) => Promise<void>;
  closeCreator: () => void;
  setViewMode: (mode: DBCreatorViewMode) => void;
  setDestinationPath: (path: string) => void;
  browseDestination: () => Promise<void>;
  setTableName: (name: string) => void;
  setAddAutoId: (val: boolean) => void;
  setDelimiter: (val: string) => void;
  setHasHeader: (val: boolean) => void;
  setBatchSize: (val: number) => void;
  setEnableWal: (val: boolean) => void;
  setCustomDdl: (val: string) => void;
  updateColumn: (index: number, patch: Partial<DBCreatorColumnDef>) => void;
  startCreation: () => Promise<void>;
  reset: () => void;
}

export function generateLiveDDL(
  tableName: string,
  columns: DBCreatorColumnDef[],
  addAutoId: boolean
): string {
  const safeTable = (tableName || 'tabela').replace(/[^a-zA-Z0-9_]/g, '_');
  const lines: string[] = [];

  if (addAutoId) {
    lines.push('  "id" INTEGER PRIMARY KEY AUTOINCREMENT');
  }

  for (const col of columns) {
    const safeCol = (col.name || 'col').replace(/[^a-zA-Z0-9_]/g, '_');
    let line = `  "${safeCol}" ${col.dataType || 'TEXT'}`;
    if (col.isPrimaryKey && !addAutoId) {
      line += ' PRIMARY KEY';
    }
    if (col.notNull) {
      line += ' NOT NULL';
    }
    lines.push(line);
  }

  return `CREATE TABLE IF NOT EXISTS "${safeTable}" (\n${lines.join(',\n')}\n);`;
}

let unsubscribeProgress: (() => void) | null = null;

export const useDBCreatorStore = create<DBCreatorState>((set, get) => ({
  isOpen: false,
  sourcePath: '',
  viewMode: 'simple',
  step: 'config',
  loadingInspection: false,
  inspection: null,
  errorMessage: null,

  destinationPath: '',
  tableName: '',
  columns: [],
  addAutoId: true,
  delimiter: ',',
  hasHeader: true,
  batchSize: 2500,
  enableWal: true,
  customDdl: '',

  progress: null,
  logs: [],
  result: null,

  openCreator: async (sourcePath: string) => {
    // Configurar listener para progresso em tempo real se ainda não configurado
    if (!unsubscribeProgress) {
      unsubscribeProgress = subscribeEvent<DBCreatorProgressEvent>(
        'dbcreator:progress',
        (evt) => {
          set((state) => {
            const newLogs = evt.currentLog
              ? [...state.logs, evt.currentLog]
              : state.logs;
            return {
              progress: evt,
              logs: newLogs,
            };
          });
        }
      );
    }

    const baseDir = sourcePath.replace(/[/\\][^/\\]+$/, '');
    const sep = sourcePath.includes('\\') ? '\\' : '/';
    const baseName = sourcePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'banco';
    const initialDest = `${baseDir}${sep}${baseName}.db`;

    set({
      isOpen: true,
      sourcePath,
      step: 'config',
      loadingInspection: true,
      inspection: null,
      errorMessage: null,
      destinationPath: initialDest,
      tableName: baseName.replace(/[^a-zA-Z0-9_]/g, '_'),
      columns: [],
      addAutoId: true,
      delimiter: ',',
      hasHeader: true,
      batchSize: 2500,
      enableWal: true,
      customDdl: '',
      progress: null,
      logs: [],
      result: null,
    });

    try {
      const inspection = await dbCreatorInspectSource(sourcePath);
      const initialDdl = generateLiveDDL(
        inspection.suggestedTable,
        inspection.columns,
        true
      );
      set({
        loadingInspection: false,
        inspection,
        tableName: inspection.suggestedTable,
        columns: inspection.columns,
        delimiter: inspection.detectedDelim || ',',
        hasHeader: inspection.hasHeader,
        customDdl: initialDdl,
        logs: [
          `[INSPECT] Arquivo analisado: ${sourcePath}`,
          `[INSPECT] Formato detectado: ${inspection.format.toUpperCase()} (${(inspection.fileSize / 1024).toFixed(1)} KB, ~${inspection.estimatedRows.toLocaleString()} linhas)`,
          `[INSPECT] Colunas inferidas: ${inspection.columns.map((c) => `${c.name} (${c.dataType})`).join(', ')}`,
        ],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        loadingInspection: false,
        errorMessage: `Não foi possível analisar o arquivo fonte: ${msg}`,
      });
    }
  },

  closeCreator: () => {
    set({ isOpen: false });
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  setDestinationPath: (path) => set({ destinationPath: path }),

  browseDestination: async () => {
    const { destinationPath, sourcePath } = get();
    const baseDir = destinationPath
      ? destinationPath.replace(/[/\\][^/\\]+$/, '')
      : sourcePath.replace(/[/\\][^/\\]+$/, '');
    const currentFilename = destinationPath
      ? destinationPath.split(/[/\\]/).pop() || 'banco.db'
      : 'banco.db';

    try {
      const chosen = await showSaveFileDialog({
        title: 'Escolher local do Banco de Dados SQLite',
        defaultDirectory: baseDir,
        defaultFilename: currentFilename,
        filterDisplayName: 'Banco de Dados SQLite (*.db;*.sqlite)',
        filterPattern: '*.db;*.sqlite;*.sqlite3',
      });
      if (chosen) {
        set({ destinationPath: chosen });
      }
    } catch {
      // Ignorar cancelamento
    }
  },

  setTableName: (name) => {
    const safe = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const { columns, addAutoId } = get();
    set({
      tableName: safe,
      customDdl: generateLiveDDL(safe, columns, addAutoId),
    });
  },

  setAddAutoId: (val) => {
    const { tableName, columns } = get();
    set({
      addAutoId: val,
      customDdl: generateLiveDDL(tableName, columns, val),
    });
  },

  setDelimiter: (val) => set({ delimiter: val }),
  setHasHeader: (val) => set({ hasHeader: val }),
  setBatchSize: (val) => set({ batchSize: val }),
  setEnableWal: (val) => set({ enableWal: val }),
  setCustomDdl: (val) => set({ customDdl: val }),

  updateColumn: (index, patch) => {
    const { columns, tableName, addAutoId } = get();
    const next = [...columns];
    if (next[index]) {
      next[index] = { ...next[index], ...patch };
      set({
        columns: next,
        customDdl: generateLiveDDL(tableName, next, addAutoId),
      });
    }
  },

  startCreation: async () => {
    const {
      sourcePath,
      destinationPath,
      tableName,
      columns,
      addAutoId,
      delimiter,
      hasHeader,
      batchSize,
      enableWal,
      customDdl,
    } = get();

    if (!destinationPath.trim()) {
      set({ errorMessage: 'Por favor, informe o local de salvamento do banco.' });
      return;
    }
    if (!tableName.trim()) {
      set({ errorMessage: 'Por favor, informe o nome da tabela.' });
      return;
    }

    set({
      step: 'importing',
      errorMessage: null,
      progress: {
        stage: 'analyzing',
        processedRows: 0,
        totalRows: 0,
        percentage: 0,
        speedRowsSec: 0,
        elapsedMs: 0,
        estimatedRemMs: 0,
        currentLog: '[INIT] Iniciando injeção de dados no SQLite...',
      },
    });

    try {
      const result = await dbCreatorExecute({
        sourcePath,
        destinationPath,
        tableName,
        columns,
        addAutoId,
        delimiter,
        hasHeader,
        batchSize,
        enableWal,
        customDdl,
      });

      set({
        step: 'completed',
        result,
        logs: [
          ...get().logs,
          `[FINAL] Banco criado com sucesso: ${result.destinationPath}`,
          `[FINAL] Total de ${result.totalRows.toLocaleString()} registros importados em ${(result.totalDurationMs / 1000).toFixed(2)}s.`,
        ],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        step: 'error',
        errorMessage: `Erro durante a criação do banco de dados: ${msg}`,
      });
    }
  },

  reset: () => {
    set({
      isOpen: false,
      step: 'config',
      inspection: null,
      errorMessage: null,
      progress: null,
      logs: [],
      result: null,
    });
  },
}));
