import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileCode2,
  Plus,
  Save,
  Sparkles,
  Search,
  Wand2,
  Columns2,
  Map as MapIcon,
  Minus,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  Play,
  GitCompare,
  FolderTree,
  ListTree,
  Wrench,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Pin,
  Folder,
  RefreshCw,
  Copy,
  Braces,
  Hash,
  Clock,
  ArrowUpDown,
  Regex,
  ChevronRight,
  Square,
  WrapText,
  Table2,
  Trash2,
} from 'lucide-react';
import {
  useEditorStore,
  computeDiagnostics,
  extractCodeSymbols,
  computeLineDiff,
  detectCsvDelimiter,
  parseCsvLine,
  parseCsvTable,
  serializeCsvTable,
  EditorTab,
  isStandaloneStudioWindow,
} from './store';
import { useBrowserStore } from '../browser/store';
import {
  Entry,
  listDirectorySnapshot,
  subscribeEvent,
  StudioOpenFileEvent,
  windowMinimize,
  windowToggleMaximize,
  windowClose,
} from '../../lib/wails';
import { FileTypeIcon } from '../../ui/FileTypeIcon';

interface SnippetItem {
  label: string;
  detail: string;
  insertText: string;
}

const LANGUAGE_SNIPPETS: Record<string, SnippetItem[]> = {
  go: [
    {
      label: 'func',
      detail: 'Declaração de função Go',
      insertText: 'func nomeFuncao(ctx context.Context) error {\n\treturn nil\n}',
    },
    {
      label: 'iferr',
      detail: 'Verificação padrão de erro Go',
      insertText: 'if err != nil {\n\treturn err\n}',
    },
    {
      label: 'struct',
      detail: 'Declaração de struct Go',
      insertText: 'type Entidade struct {\n\tID   string `json:"id"`\n\tNome string `json:"nome"`\n}',
    },
    {
      label: 'test',
      detail: 'Função de teste unitário Go',
      insertText: 'func TestOperacao(t *testing.T) {\n\t\n}',
    },
  ],
  typescript: [
    {
      label: 'interface',
      detail: 'Interface TypeScript',
      insertText: 'export interface Props {\n  id: string;\n  title: string;\n}',
    },
    {
      label: 'asyncFn',
      detail: 'Função assíncrona TypeScript',
      insertText:
        'export async function executeTask(): Promise<void> {\n  try {\n    \n  } catch (err) {\n    console.error(err);\n  }\n}',
    },
    {
      label: 'useEffect',
      detail: 'Hook React useEffect',
      insertText: 'useEffect(() => {\n  \n  return () => {};\n}, []);',
    },
  ],
  javascript: [
    {
      label: 'function',
      detail: 'Função JavaScript',
      insertText: 'function processData(items) {\n  return items.map((item) => item);\n}',
    },
    {
      label: 'console.log',
      detail: 'Log de inspeção',
      insertText: "console.log('[INFO]:', );",
    },
  ],
  python: [
    {
      label: 'def',
      detail: 'Função Python tipada',
      insertText: 'def processar_dados(itens: list[str]) -> list[str]:\n    return [x.strip() for x in itens]\n',
    },
    {
      label: 'main',
      detail: ' Ponto de entrada __main__',
      insertText: 'if __name__ == "__main__":\n    main()\n',
    },
  ],
  markdown: [
    {
      label: 'table',
      detail: 'Tabela Markdown',
      insertText:
        '| Coluna 1 | Coluna 2 | Status |\n| :--- | :--- | :--- |\n| Item A | Valor 1 | OK |\n| Item B | Valor 2 | Pendente |',
    },
    {
      label: 'codeblock',
      detail: 'Bloco de código cercado',
      insertText: '```ts\n// código aqui\n```',
    },
    {
      label: 'checklist',
      detail: 'Lista de tarefas',
      insertText: '- [x] Etapa concluída\n- [ ] Próxima etapa\n',
    },
  ],
  json: [
    {
      label: 'package',
      detail: 'Estrutura JSON inicial',
      insertText: '{\n  "name": "projeto",\n  "version": "1.0.0",\n  "private": true\n}',
    },
    {
      label: 'arrayObj',
      detail: 'Lista de registros JSON',
      insertText: '[\n  {\n    "id": 1,\n    "nome": "Item A",\n    "ativo": true\n  }\n]',
    },
  ],
  csv: [
    {
      label: 'header',
      detail: 'Cabeçalho CSV padrão',
      insertText: 'id,nome,email,status,criado_em\n1,Exemplo,exemplo@dominio.com,ativo,2026-01-01',
    },
    {
      label: 'row',
      detail: 'Nova linha CSV',
      insertText: '2,Novo Registro,contato@dominio.com,pendente,2026-01-02',
    },
  ],
  sql: [
    {
      label: 'select',
      detail: 'Consulta SELECT com filtro e ordenação',
      insertText: 'SELECT id, nome, criado_em\nFROM usuarios\nWHERE ativo = 1\nORDER BY criado_em DESC\nLIMIT 50;',
    },
    {
      label: 'createTable',
      detail: 'Criação de tabela SQL',
      insertText:
        'CREATE TABLE IF NOT EXISTS registros (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  nome TEXT NOT NULL,\n  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP\n);',
    },
  ],
  html: [
    {
      label: 'html5',
      detail: 'Estrutura base HTML5',
      insertText:
        '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8" />\n  <title>Documento</title>\n</head>\n<body>\n  <h1>Olá Mundo</h1>\n</body>\n</html>',
    },
  ],
};

function commentPrefixForLanguage(lang: string): string {
  switch (lang) {
    case 'python':
    case 'shell':
    case 'powershell':
    case 'yaml':
    case 'toml':
    case 'ini':
    case 'dockerfile':
    case 'makefile':
      return '# ';
    case 'sql':
      return '-- ';
    case 'bat':
      return 'REM ';
    default:
      return '// ';
  }
}

const CSV_RAINBOW_COLORS = [
  '#38bdf8',
  '#f59e0b',
  '#34d399',
  '#c084fc',
  '#fb7185',
  '#a3e635',
  '#60a5fa',
  '#fbbf24',
];

function renderHighlightedLine(line: string, language: string): React.ReactNode {
  if (!line) return '\u00A0';

  if (language === 'csv') {
    const delim = detectCsvDelimiter(line);
    const cells = parseCsvLine(line, delim);
    if (cells.length <= 1) return line;
    // Renderiza Rainbow CSV preservando o texto exato da linha para manter alinhamento com o textarea
    const segments: React.ReactNode[] = [];
    let colIdx = 0;
    let currentToken = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        currentToken += ch;
      } else if (ch === delim && !inQuotes) {
        const color = CSV_RAINBOW_COLORS[colIdx % CSV_RAINBOW_COLORS.length];
        segments.push(
          <span key={`c-${i}`} style={{ color }}>
            {currentToken}
          </span>
        );
        segments.push(
          <span key={`d-${i}`} style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
            {ch}
          </span>
        );
        currentToken = '';
        colIdx++;
      } else {
        currentToken += ch;
      }
    }
    if (currentToken) {
      const color = CSV_RAINBOW_COLORS[colIdx % CSV_RAINBOW_COLORS.length];
      segments.push(
        <span key="c-end" style={{ color }}>
          {currentToken}
        </span>
      );
    }
    return segments;
  }

  const trimmed = line.trimStart();
  if (
    (trimmed.startsWith('//') &&
      ['javascript', 'typescript', 'go', 'rust', 'c', 'cpp', 'java', 'csharp', 'json'].includes(
        language
      )) ||
    (trimmed.startsWith('#') &&
      ['python', 'shell', 'powershell', 'yaml', 'toml', 'ini', 'dockerfile'].includes(language)) ||
    (trimmed.startsWith('--') && language === 'sql')
  ) {
    return <span style={{ color: '#6a9955', fontStyle: 'italic' }}>{line}</span>;
  }

  if (language === 'markdown') {
    if (/^#{1,6}\s/.test(trimmed)) {
      return <span style={{ color: '#569cd6', fontWeight: 700 }}>{line}</span>;
    }
    if (/^(\s*[-*+]|\s*\d+\.)\s/.test(line)) {
      return <span style={{ color: '#ce9178' }}>{line}</span>;
    }
    if (trimmed.startsWith('>')) {
      return <span style={{ color: '#6a9955', fontStyle: 'italic' }}>{line}</span>;
    }
    if (trimmed.startsWith('```')) {
      return <span style={{ color: '#c586c0' }}>{line}</span>;
    }
  }

  const tokenRegex =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:func|package|import|return|if|else|for|range|switch|case|default|type|struct|interface|var|const|defer|go|select|chan|map|export|from|async|await|function|class|extends|new|try|catch|finally|throw|let|true|false|null|nil|undefined|def|elif|except|with|as|pass|yield|lambda|None|True|False|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|ORDER|GROUP|BY|LIMIT|fn|pub|mut|impl|use|mod|match)\b|\b\d+(?:\.\d+)?\b)/g;

  const parts = line.split(tokenRegex);
  if (parts.length === 1) return line;

  return parts.map((part, i) => {
    if (!part) return null;
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'")) ||
      (part.startsWith('`') && part.endsWith('`'))
    ) {
      return (
        <span key={i} style={{ color: '#ce9178' }}>
          {part}
        </span>
      );
    }
    if (/^\d+(?:\.\d+)?$/.test(part)) {
      return (
        <span key={i} style={{ color: '#b5cea8' }}>
          {part}
        </span>
      );
    }
    if (tokenRegex.test(part)) {
      tokenRegex.lastIndex = 0;
      return (
        <span key={i} style={{ color: '#569cd6', fontWeight: 600 }}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function renderMarkdownPreview(md: string): React.ReactNode {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const elements: React.ReactNode[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];

  lines.forEach((line, idx) => {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre
            key={`code-${idx}`}
            style={{
              backgroundColor: 'var(--bg-app)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              overflowX: 'auto',
              margin: '8px 0',
            }}
          >
            {codeBuffer.join('\n')}
          </pre>
        );
        codeBuffer = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeBuffer.push(line);
      return;
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h1
          key={idx}
          style={{
            fontSize: '20px',
            fontWeight: 700,
            margin: '12px 0 6px',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '4px',
          }}
        >
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={idx} style={{ fontSize: '17px', fontWeight: 700, margin: '10px 0 4px' }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={idx} style={{ fontSize: '15px', fontWeight: 600, margin: '8px 0 4px' }}>
          {line.slice(4)}
        </h3>
      );
    } else if (/^\s*[-*+]\s/.test(line)) {
      elements.push(
        <li key={idx} style={{ marginLeft: '18px', marginBottom: '3px' }}>
          {line.replace(/^\s*[-*+]\s/, '')}
        </li>
      );
    } else if (line.trim().startsWith('>')) {
      elements.push(
        <blockquote
          key={idx}
          style={{
            borderLeft: '3px solid var(--accent-primary)',
            paddingLeft: '10px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            margin: '6px 0',
          }}
        >
          {line.replace(/^\s*>\s?/, '')}
        </blockquote>
      );
    } else if (line.trim() === '---' || line.trim() === '***') {
      elements.push(
        <hr
          key={idx}
          style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '10px 0' }}
        />
      );
    } else if (line.trim().length === 0) {
      elements.push(<div key={idx} style={{ height: '8px' }} />);
    } else {
      elements.push(
        <p key={idx} style={{ marginBottom: '6px', lineHeight: 1.55 }}>
          {line}
        </p>
      );
    }
  });

  return elements;
}

interface CodeEditorModalProps {
  standalone?: boolean;
}

export const CodeEditorModal: React.FC<CodeEditorModalProps> = ({ standalone = false }) => {
  const {
    isOpen,
    isMinimized,
    isMaximized,
    workspaceDir,
    tabs,
    activeTabId,
    fontSize,
    tabSize,
    wordWrap,
    showMinimap,
    showSplitPreview,
    showDiffView,
    sidebarTab,
    findBarOpen,
    runnerOpen,
    runnerLoading,
    runnerCommand,
    runnerResult,
    statusMessage,
    openFileInEditor,
    openNewUntitledTab,
    detachToSeparateWindow,
    closeTab,
    closeOtherTabs,
    togglePinTab,
    setActiveTab,
    updateTabContent,
    revertTabContent,
    updateCursor,
    setTabLanguage,
    toggleLineEnding,
    saveTab,
    saveAllTabs,
    formatActiveTab,
    transformActiveTab,
    runStudioScript,
    setWorkspaceDir,
    setEditorOpen,
    setMinimized,
    toggleMaximized,
    setFontSize,
    setTabSize,
    toggleWordWrap,
    toggleMinimap,
    toggleSplitPreview,
    toggleDiffView,
    setSidebarTab,
    setFindBarOpen,
    setRunnerOpen,
    setRunnerCommand,
  } = useEditorStore();

  const { currentPath, refresh } = useBrowserStore();
  const isDedicatedWindow = standalone || isStandaloneStudioWindow();

  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 64, y: 40 });
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: Math.min(1160, Math.max(760, typeof window !== 'undefined' ? window.innerWidth - 130 : 1020)),
    height: Math.min(760, Math.max(500, typeof window !== 'undefined' ? window.innerHeight - 90 : 660)),
  });

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegexFind, setUseRegexFind] = useState(false);
  const [goToLineInput, setGoToLineInput] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [scrollRatio, setScrollRatio] = useState(0);

  // Explorador lateral do projeto dentro do Studio
  const [workspaceEntries, setWorkspaceEntries] = useState<Entry[]>([]);
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [regexTestPattern, setRegexTestPattern] = useState('');
  const [studioMinHovered, setStudioMinHovered] = useState(false);
  const [studioMaxHovered, setStudioMaxHovered] = useState(false);
  const [studioCloseHovered, setStudioCloseHovered] = useState(false);
  const [csvFilterQuery, setCsvFilterQuery] = useState('');
  const [csvSortCol, setCsvSortCol] = useState<number | null>(null);
  const [csvSortAsc, setCsvSortAsc] = useState(true);
  const [jsonFilterQuery, setJsonFilterQuery] = useState('');

  const effectiveWorkspace = workspaceDir || currentPath || '/';

  const activeTab: EditorTab | null =
    tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

  const parsedCsv = useMemo(() => {
    if (!activeTab || activeTab.language !== 'csv') return null;
    return parseCsvTable(activeTab.content);
  }, [activeTab]);

  const parsedJsonPreview = useMemo(() => {
    if (!activeTab || activeTab.language !== 'json') return null;
    const raw = activeTab.content.trim();
    if (!raw) return { ok: true as const, value: null, error: null };
    try {
      const value = JSON.parse(raw);
      return { ok: true as const, value, error: null };
    } catch (err) {
      return {
        ok: false as const,
        value: null,
        error: err instanceof Error ? err.message : 'JSON inválido',
      };
    }
  }, [activeTab]);

  // Atalhos globais do Pulsares Studio Editor (funcionam mesmo quando o foco não está no textarea)
  useEffect(() => {
    if (!isOpen && !isDedicatedWindow) return;
    if (isMinimized && !isDedicatedWindow) return;

    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      // Alt+Z: Alternar Quebra Automática de Linha (Word Wrap)
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        toggleWordWrap();
        return;
      }

      // Shift+Alt+F: Formatar documento na linguagem ativa
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        formatActiveTab();
        return;
      }

      // Ctrl+S / Ctrl+Shift+S: Salvar aba ativa ou todas
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!activeTab) return;
        void (async () => {
          if (e.shiftKey) {
            await saveAllTabs(effectiveWorkspace);
          } else {
            await saveTab(activeTab.id, effectiveWorkspace);
          }
          if (!isDedicatedWindow) void refresh();
        })();
        return;
      }

      // Ctrl+F: Localizar e Substituir
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindBarOpen(!findBarOpen);
        return;
      }

      // Ctrl+N: Nova aba
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openNewUntitledTab(effectiveWorkspace, activeTab?.language || 'typescript', true);
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [
    isOpen,
    isDedicatedWindow,
    isMinimized,
    activeTab,
    effectiveWorkspace,
    findBarOpen,
    toggleWordWrap,
    formatActiveTab,
    saveTab,
    saveAllTabs,
    refresh,
    setFindBarOpen,
    openNewUntitledTab,
  ]);

  // Carrega arquivos da pasta do projeto quando a aba lateral 'files' estiver aberta
  useEffect(() => {
    if ((!isOpen && !isDedicatedWindow) || sidebarTab !== 'files' || !effectiveWorkspace) return;
    void listDirectorySnapshot(effectiveWorkspace, false).then((items) => {
      const sorted = [...items].sort((a, b) => {
        if (a.kind === 'dir' && b.kind !== 'dir') return -1;
        if (a.kind !== 'dir' && b.kind === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });
      setWorkspaceEntries(sorted);
    });
  }, [isOpen, isDedicatedWindow, sidebarTab, effectiveWorkspace]);

  // Escuta eventos entre janelas (Explorer <-> Pulsares Studio Window via Wails IPC, BroadcastChannel e localStorage)
  useEffect(() => {
    const unsubWailsIPC = subscribeEvent<StudioOpenFileEvent>('studio:open-file', (ev) => {
      if (!isDedicatedWindow || !ev) return;
      if (ev.workspaceDir) {
        setWorkspaceDir(ev.workspaceDir);
      }
      if (ev.targetPath) {
        void openFileInEditor(ev.targetPath, true);
      }
      window.focus();
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pulsares.studio.openQueue.v1' && e.newValue && isDedicatedWindow) {
        try {
          const payload = JSON.parse(e.newValue) as {
            targetPath?: string;
            workspaceDir?: string;
          };
          if (payload.workspaceDir) {
            setWorkspaceDir(payload.workspaceDir);
          }
          if (payload.targetPath) {
            void openFileInEditor(payload.targetPath, true);
          }
          window.focus();
        } catch {
          // ignora
        }
      }
    };

    let ch: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel('pulsares_studio_ipc');
      ch.onmessage = (ev) => {
        const data = ev.data as {
          type?: string;
          targetPath?: string;
          workspaceDir?: string;
        };
        if (data?.type === 'STUDIO_OPEN_REQUEST' && isDedicatedWindow) {
          if (data.workspaceDir) {
            setWorkspaceDir(data.workspaceDir);
          }
          if (data.targetPath) {
            void openFileInEditor(data.targetPath, true);
          }
          window.focus();
        } else if (data?.type === 'STUDIO_FILE_SAVED' && !isDedicatedWindow) {
          void refresh();
        }
      };
    }

    window.addEventListener('storage', onStorage);
    return () => {
      unsubWailsIPC();
      window.removeEventListener('storage', onStorage);
      if (ch) ch.close();
    };
  }, [isDedicatedWindow, openFileInEditor, refresh, setWorkspaceDir]);

  const lines = useMemo(() => {
    if (!activeTab) return [''];
    return activeTab.content.replace(/\r\n/g, '\n').split('\n');
  }, [activeTab]);

  const diagnostics = useMemo(() => {
    if (!activeTab) return [];
    return computeDiagnostics(activeTab.content, activeTab.language);
  }, [activeTab]);

  const codeSymbols = useMemo(() => {
    if (!activeTab) return [];
    return extractCodeSymbols(activeTab.content, activeTab.language);
  }, [activeTab]);

  const diffLines = useMemo(() => {
    if (!activeTab || !showDiffView) return [];
    return computeLineDiff(activeTab.savedContent, activeTab.content);
  }, [activeTab, showDiffView]);

  const regexMatchesCount = useMemo(() => {
    if (!activeTab || !regexTestPattern.trim()) return 0;
    try {
      const rx = new RegExp(regexTestPattern, 'gm');
      const m = activeTab.content.match(rx);
      return m ? m.length : 0;
    } catch {
      return -1;
    }
  }, [activeTab, regexTestPattern]);

  const suggestions = useMemo<SnippetItem[]>(() => {
    if (!activeTab) return [];
    const baseSnippets = LANGUAGE_SNIPPETS[activeTab.language] || [];
    const wordSet = new Set<string>();
    const matches = activeTab.content.match(/\b[A-Za-z_][A-Za-z0-9_]{3,32}\b/g) || [];
    for (const w of matches) {
      wordSet.add(w);
      if (wordSet.size >= 15) break;
    }
    const wordItems: SnippetItem[] = Array.from(wordSet).map((w) => ({
      label: w,
      detail: 'Símbolo no documento',
      insertText: w,
    }));
    return [...baseSnippets, ...wordItems];
  }, [activeTab]);

  const matchCount = useMemo(() => {
    if (!activeTab || !findQuery) return 0;
    if (useRegexFind) {
      try {
        const rx = new RegExp(findQuery, caseSensitive ? 'g' : 'gi');
        return (activeTab.content.match(rx) || []).length;
      } catch {
        return 0;
      }
    }
    const hay = caseSensitive ? activeTab.content : activeTab.content.toLowerCase();
    const needle = caseSensitive ? findQuery : findQuery.toLowerCase();
    if (!needle) return 0;
    let count = 0;
    let idx = 0;
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      count++;
      idx += needle.length;
    }
    return count;
  }, [activeTab, findQuery, caseSensitive, useRegexFind]);

  useEffect(() => {
    if (isDedicatedWindow) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 220, dragRef.current.origX + dx)),
        y: Math.max(8, Math.min(window.innerHeight - 80, dragRef.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDedicatedWindow]);

  if (!isOpen && !isDedicatedWindow) return null;

  const dirtyCount = tabs.filter((t) => t.content !== t.savedContent).length;

  // Modo minimizado (pílula flutuante quando acoplado no Explorer)
  if (isMinimized && !isDedicatedWindow) {
    return (
      <div
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '34px',
          zIndex: 9500,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 14px',
          borderRadius: '999px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--accent-primary)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          cursor: 'pointer',
        }}
        onClick={() => setMinimized(false)}
      >
        <FileCode2 size={15} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
          Pulsares Studio ({tabs.length} {tabs.length === 1 ? 'aba' : 'abas'}
          {dirtyCount > 0 ? ` • ${dirtyCount} não salvo` : ''})
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void detachToSeparateWindow();
          }}
          title="Destacar em Janela Separada"
          style={statusLinkBtnStyle}
        >
          <ExternalLink size={13} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditorOpen(false);
          }}
          style={statusLinkBtnStyle}
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  const lineHeightPx = Math.round(fontSize * 1.55);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
    const maxScroll = Math.max(1, ta.scrollHeight - ta.clientHeight);
    setScrollRatio(ta.scrollTop / maxScroll);
  };

  const syncCursorFromTextarea = () => {
    const ta = textareaRef.current;
    if (!ta || !activeTab) return;
    const posIdx = ta.selectionStart || 0;
    const before = ta.value.slice(0, posIdx).split('\n');
    const line = before.length;
    const col = (before[before.length - 1]?.length || 0) + 1;
    updateCursor(activeTab.id, line, col);
  };

  const jumpToLine = (targetLine: number) => {
    const ta = textareaRef.current;
    if (!ta || !activeTab) return;
    const clamped = Math.max(1, Math.min(lines.length, targetLine));
    let charOffset = 0;
    for (let i = 0; i < clamped - 1; i++) {
      charOffset += lines[i].length + 1;
    }
    ta.focus();
    ta.setSelectionRange(charOffset, charOffset + (lines[clamped - 1]?.length || 0));
    ta.scrollTop = Math.max(0, (clamped - 5) * lineHeightPx);
    syncScroll();
    updateCursor(activeTab.id, clamped, 1);
  };

  const insertSnippetAtCursor = (snippet: string) => {
    const ta = textareaRef.current;
    if (!ta || !activeTab) return;
    const start = ta.selectionStart ?? activeTab.content.length;
    const end = ta.selectionEnd ?? start;
    const next =
      activeTab.content.slice(0, start) + snippet + activeTab.content.slice(end);
    updateTabContent(activeTab.id, next);
    setSuggestOpen(false);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + snippet.length;
      ta.setSelectionRange(cursor, cursor);
      syncCursorFromTextarea();
    });
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeTab) return;
    const ta = e.currentTarget;

    if (suggestOpen && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSnippetAtCursor(suggestions[suggestIdx].insertText);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestOpen(false);
        return;
      }
    }

    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      setSuggestIdx(0);
      setSuggestOpen((v) => !v);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void runStudioScript(effectiveWorkspace);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void (async () => {
        if (e.shiftKey) {
          await saveAllTabs(effectiveWorkspace);
        } else {
          await saveTab(activeTab.id, effectiveWorkspace);
        }
        if (!isDedicatedWindow) void refresh();
      })();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) {
      e.preventDefault();
      setFindBarOpen(!findBarOpen);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openNewUntitledTab(effectiveWorkspace, activeTab.language, true);
      return;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      toggleWordWrap();
      return;
    }

    if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      formatActiveTab();
      return;
    }

    // Alt+ArrowUp / Alt+ArrowDown: mover a linha atual para cima ou para baixo
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const curIdx = activeTab.cursorLine - 1;
      const sep = activeTab.lineEnding === 'CRLF' ? '\r\n' : '\n';
      const arr = [...lines];
      if (e.key === 'ArrowUp' && curIdx > 0) {
        const tmp = arr[curIdx - 1];
        arr[curIdx - 1] = arr[curIdx];
        arr[curIdx] = tmp;
        updateTabContent(activeTab.id, arr.join(sep));
        requestAnimationFrame(() => jumpToLine(curIdx));
      } else if (e.key === 'ArrowDown' && curIdx < arr.length - 1) {
        const tmp = arr[curIdx + 1];
        arr[curIdx + 1] = arr[curIdx];
        arr[curIdx] = tmp;
        updateTabContent(activeTab.id, arr.join(sep));
        requestAnimationFrame(() => jumpToLine(curIdx + 2));
      }
      return;
    }

    // Shift+Alt+ArrowDown: duplicar a linha atual abaixo
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowDown') {
      e.preventDefault();
      const curIdx = Math.max(0, Math.min(lines.length - 1, activeTab.cursorLine - 1));
      const sep = activeTab.lineEnding === 'CRLF' ? '\r\n' : '\n';
      const arr = [...lines];
      arr.splice(curIdx + 1, 0, arr[curIdx]);
      updateTabContent(activeTab.id, arr.join(sep));
      requestAnimationFrame(() => jumpToLine(curIdx + 2));
      return;
    }

    // Ctrl+Shift+K: excluir a linha atual
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const curIdx = Math.max(0, Math.min(lines.length - 1, activeTab.cursorLine - 1));
      const sep = activeTab.lineEnding === 'CRLF' ? '\r\n' : '\n';
      const arr = lines.length > 1 ? lines.filter((_, idx) => idx !== curIdx) : [''];
      updateTabContent(activeTab.id, arr.join(sep));
      requestAnimationFrame(() => jumpToLine(Math.min(arr.length, curIdx + 1)));
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = activeTab.content;
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const actualEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const block = val.slice(lineStart, actualEnd);
      const prefix = commentPrefixForLanguage(activeTab.language);
      const blockLines = block.split('\n');
      const allCommented = blockLines.every((l) => l.trimStart().startsWith(prefix.trim()));
      const toggled = blockLines
        .map((l) => {
          if (allCommented) {
            const idx = l.indexOf(prefix.trim());
            if (idx >= 0) {
              const removeLen = l.slice(idx).startsWith(prefix)
                ? prefix.length
                : prefix.trim().length;
              return l.slice(0, idx) + l.slice(idx + removeLen);
            }
            return l;
          }
          return prefix + l;
        })
        .join('\n');
      const nextVal = val.slice(0, lineStart) + toggled + val.slice(actualEnd);
      updateTabContent(activeTab.id, nextVal);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const spaces = ' '.repeat(tabSize);
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = activeTab.content;

      if (start !== end || e.shiftKey) {
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = val.indexOf('\n', end);
        const actualEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
        const selectedLines = val.slice(lineStart, actualEnd).split('\n');
        const modified = selectedLines
          .map((l) => {
            if (e.shiftKey) {
              if (l.startsWith(spaces)) return l.slice(spaces.length);
              if (l.startsWith('\t')) return l.slice(1);
              return l.replace(/^ {1,2}/, '');
            }
            return spaces + l;
          })
          .join('\n');
        const nextVal = val.slice(0, lineStart) + modified + val.slice(actualEnd);
        updateTabContent(activeTab.id, nextVal);
        requestAnimationFrame(() => {
          ta.setSelectionRange(lineStart, lineStart + modified.length);
        });
      } else {
        const nextVal = val.slice(0, start) + spaces + val.slice(end);
        updateTabContent(activeTab.id, nextVal);
        requestAnimationFrame(() => {
          ta.setSelectionRange(start + spaces.length, start + spaces.length);
        });
      }
      return;
    }

    const pairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'",
      '`': '`',
    };
    if (pairs[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = activeTab.content;
      const closeChar = pairs[e.key];
      if (start !== end) {
        e.preventDefault();
        const wrapped = e.key + val.slice(start, end) + closeChar;
        updateTabContent(activeTab.id, val.slice(0, start) + wrapped + val.slice(end));
        requestAnimationFrame(() => {
          ta.setSelectionRange(start + 1, end + 1);
        });
      }
    }
  };

  const handleFindNext = () => {
    const ta = textareaRef.current;
    if (!ta || !activeTab || !findQuery) return;
    const hay = caseSensitive ? activeTab.content : activeTab.content.toLowerCase();
    const needle = caseSensitive ? findQuery : findQuery.toLowerCase();
    const fromIdx = ta.selectionEnd || 0;
    let foundIdx = hay.indexOf(needle, fromIdx);
    if (foundIdx === -1) {
      foundIdx = hay.indexOf(needle, 0);
    }
    if (foundIdx !== -1) {
      ta.focus();
      ta.setSelectionRange(foundIdx, foundIdx + findQuery.length);
      syncCursorFromTextarea();
    }
  };

  const handleReplaceOne = () => {
    if (!activeTab || !findQuery) return;
    const flags = caseSensitive ? '' : 'i';
    const pattern = useRegexFind
      ? findQuery
      : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const regex = new RegExp(pattern, flags);
      updateTabContent(activeTab.id, activeTab.content.replace(regex, replaceQuery));
    } catch {
      // ignora regex inválida
    }
  };

  const handleReplaceAll = () => {
    if (!activeTab || !findQuery) return;
    const flags = caseSensitive ? 'g' : 'gi';
    const pattern = useRegexFind
      ? findQuery
      : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const regex = new RegExp(pattern, flags);
      updateTabContent(activeTab.id, activeTab.content.replace(regex, replaceQuery));
    } catch {
      // ignora regex inválida
    }
  };

  const filteredWorkspaceEntries = workspaceEntries.filter((e) =>
    !workspaceFilter.trim()
      ? true
      : e.name.toLowerCase().includes(workspaceFilter.trim().toLowerCase())
  );

  const windowStyle: React.CSSProperties = isDedicatedWindow
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9500,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        overflow: 'hidden',
      }
    : isMaximized
    ? {
        position: 'fixed',
        inset: '10px',
        zIndex: 9500,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
      }
    : {
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 9500,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 22px 54px rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
      };

  return (
    <div role="dialog" aria-label="Pulsares Studio Editor" style={windowStyle}>
      {/* Titlebar Própria do Pulsares Studio Editor (Frameless Window + Controles Nativos) */}
      <div
        onMouseDown={(e) => {
          if (isDedicatedWindow || isMaximized) return;
          if ((e.target as HTMLElement).closest('button, select, input')) return;
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: pos.x,
            origY: pos.y,
          };
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button, select, input')) return;
          if (isDedicatedWindow) {
            void windowToggleMaximize();
          } else {
            toggleMaximized();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '38px',
          paddingLeft: '12px',
          paddingRight: 0,
          backgroundColor: 'var(--bg-app)',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: isDedicatedWindow || isMaximized ? 'default' : 'move',
          userSelect: 'none',
          gap: '8px',
          ...(isDedicatedWindow ? { '--wails-draggable': 'drag' } : {}),
        } as React.CSSProperties}
      >
        {/* Identidade visual do Pulsares Studio */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.35)',
            }}
          >
            <FileCode2 size={13} color="#ffffff" />
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '0.02em',
              color: 'var(--text-primary)',
              flexShrink: 0,
            }}
          >
            Pulsares Studio
          </span>
          {activeTab?.path && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                maxWidth: '340px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={activeTab.path}
            >
              {activeTab.path}
            </span>
          )}
        </div>

        {/* Ferramentas de Desenvolvedor da Titlebar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
            '--wails-draggable': 'no-drag',
          } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() =>
              openNewUntitledTab(effectiveWorkspace, activeTab?.language || 'typescript', true)
            }
            title="Novo arquivo (Ctrl+N)"
            style={headerBtnStyle}
          >
            <Plus size={13} />
            <span>Novo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!activeTab) return;
              void (async () => {
                const ok = await saveTab(activeTab.id, effectiveWorkspace);
                if (ok && !isDedicatedWindow) void refresh();
              })();
            }}
            title="Salvar arquivo (Ctrl+S)"
            style={{
              ...headerBtnStyle,
              backgroundColor:
                activeTab && activeTab.content !== activeTab.savedContent
                  ? 'var(--accent-primary)'
                  : 'var(--bg-surface)',
              color:
                activeTab && activeTab.content !== activeTab.savedContent
                  ? '#ffffff'
                  : 'var(--text-primary)',
            }}
          >
            <Save size={13} />
            <span>Salvar</span>
          </button>

          {dirtyCount > 1 && (
            <button
              type="button"
              onClick={() => void saveAllTabs(effectiveWorkspace)}
              title="Salvar todas as abas (Ctrl+Shift+S)"
              style={headerBtnStyle}
            >
              <Save size={13} />
              <span>Salvar Tudo ({dirtyCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void runStudioScript(effectiveWorkspace)}
            title="Executar arquivo ou script no Console (Ctrl+Enter)"
            style={{
              ...headerBtnStyle,
              borderColor: runnerOpen ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            <Play size={13} style={{ color: 'var(--status-success)' }} />
            <span>Executar</span>
          </button>

          <button
            type="button"
            onClick={formatActiveTab}
            title={`Formatar código e estrutura (${(activeTab?.language || 'texto').toUpperCase()}) — Shift+Alt+F`}
            style={headerBtnStyle}
          >
            <Sparkles size={13} style={{ color: 'var(--accent)' }} />
            <span>Formatar</span>
          </button>

          <button
            type="button"
            onClick={toggleWordWrap}
            title="Alternar quebra automática de linha (Alt+Z)"
            style={{
              ...headerBtnStyle,
              borderColor: wordWrap ? 'var(--accent-primary)' : 'var(--border-subtle)',
              backgroundColor: wordWrap ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              color: wordWrap ? 'var(--accent-text)' : 'var(--text-primary)',
            }}
          >
            <WrapText size={13} />
            <span>Quebra</span>
          </button>

          <button
            type="button"
            onClick={toggleDiffView}
            title="Comparar alterações com o arquivo salvo em disco (Diff)"
            style={{
              ...headerBtnStyle,
              borderColor: showDiffView ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            <GitCompare size={13} />
            <span>Diff</span>
          </button>

          <button
            type="button"
            onClick={() => setFindBarOpen(!findBarOpen)}
            title="Localizar e Substituir (Ctrl+F)"
            style={{
              ...headerBtnStyle,
              borderColor: findBarOpen ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            <Search size={13} />
            <span>Buscar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSuggestIdx(0);
              setSuggestOpen((v) => !v);
            }}
            title="Inserir Snippet de código (Ctrl+Space)"
            style={headerBtnStyle}
          >
            <Wand2 size={13} />
            <span>Snippets</span>
          </button>

          <button
            type="button"
            onClick={toggleSplitPreview}
            title="Alternar painel interativo lado a lado (Tabela CSV / Inspetor JSON / Markdown / HTML)"
            style={{
              ...headerBtnStyle,
              borderColor: showSplitPreview ? 'var(--accent-primary)' : 'var(--border-subtle)',
              backgroundColor: showSplitPreview ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              color: showSplitPreview ? 'var(--accent-text)' : 'var(--text-primary)',
            }}
          >
            {activeTab?.language === 'csv' ? <Table2 size={13} /> : <Columns2 size={13} />}
            <span>
              {activeTab?.language === 'csv'
                ? 'Tabela CSV'
                : activeTab?.language === 'json'
                ? 'Inspetor JSON'
                : 'Prévia'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleMinimap}
            title="Mostrar/ocultar Minimapa de código"
            style={{
              ...headerBtnStyle,
              borderColor: showMinimap ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            <MapIcon size={13} />
          </button>

          {!isDedicatedWindow && (
            <>
              <div
                style={{
                  width: '1px',
                  height: '16px',
                  backgroundColor: 'var(--border-subtle)',
                  margin: '0 2px',
                }}
              />

              <button
                type="button"
                onClick={() => void detachToSeparateWindow()}
                title="Destacar Pulsares Studio em Janela Separada"
                style={{
                  ...headerBtnStyle,
                  borderColor: 'var(--accent-primary)',
                  color: 'var(--accent)',
                }}
              >
                <ExternalLink size={13} />
                <span>Janela Separada</span>
              </button>
            </>
          )}
        </div>

        {/* Controles da Janela da Titlebar Própria (Minimizar, Maximizar/Restaurar, Fechar) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            height: '100%',
            flexShrink: 0,
            marginLeft: '6px',
            '--wails-draggable': 'no-drag',
          } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => {
              if (isDedicatedWindow) {
                void windowMinimize();
              } else {
                setMinimized(true);
              }
            }}
            onMouseEnter={() => setStudioMinHovered(true)}
            onMouseLeave={() => setStudioMinHovered(false)}
            title="Minimizar"
            aria-label="Minimizar"
            style={{
              ...studioTitlebarWinBtnStyle,
              backgroundColor: studioMinHovered ? 'var(--bg-hover)' : 'transparent',
            }}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (isDedicatedWindow) {
                void windowToggleMaximize();
              } else {
                toggleMaximized();
              }
            }}
            onMouseEnter={() => setStudioMaxHovered(true)}
            onMouseLeave={() => setStudioMaxHovered(false)}
            title="Maximizar / Restaurar"
            aria-label="Maximizar"
            style={{
              ...studioTitlebarWinBtnStyle,
              backgroundColor: studioMaxHovered ? 'var(--bg-hover)' : 'transparent',
            }}
          >
            {isDedicatedWindow ? (
              <Square size={12} />
            ) : isMaximized ? (
              <Minimize2 size={13} />
            ) : (
              <Maximize2 size={13} />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (isDedicatedWindow) {
                void windowClose();
              } else {
                setEditorOpen(false);
              }
            }}
            onMouseEnter={() => setStudioCloseHovered(true)}
            onMouseLeave={() => setStudioCloseHovered(false)}
            title="Fechar"
            aria-label="Fechar"
            style={{
              ...studioTitlebarWinBtnStyle,
              backgroundColor: studioCloseHovered ? '#dc2626' : 'transparent',
              color: studioCloseHovered ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Barra de abas de arquivos abertos */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          backgroundColor: 'var(--bg-app)',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab?.id;
          const isDirty = tab.content !== tab.savedContent;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => togglePinTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '12px',
                backgroundColor: isActive ? 'var(--bg-surface)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: isActive
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--border-subtle)',
                flexShrink: 0,
              }}
            >
              <FileTypeIcon name={tab.name} kind="file" size={13} showBadge={false} />
              <span style={{ fontWeight: isActive ? 600 : 400 }}>{tab.name}</span>
              {tab.pinned && <Pin size={11} style={{ color: 'var(--accent)' }} />}
              {isDirty && (
                <span
                  title="Alterações não salvas"
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '999px',
                    backgroundColor: 'var(--accent-primary)',
                    display: 'inline-block',
                  }}
                />
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                title="Fechar aba"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-muted)',
                  padding: '2px',
                }}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}

        {activeTab && tabs.length > 1 && (
          <button
            type="button"
            onClick={() => closeOtherTabs(activeTab.id)}
            title="Fechar outras abas"
            style={{
              marginLeft: 'auto',
              fontSize: '11px',
              color: 'var(--text-muted)',
              padding: '2px 6px',
              flexShrink: 0,
            }}
          >
            Fechar outras
          </button>
        )}
      </div>

      {/* Barra de Localizar, Substituir e Ir para Linha */}
      {findBarOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: 'var(--bg-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={findQuery}
            autoFocus
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFindNext();
              if (e.key === 'Escape') setFindBarOpen(false);
            }}
            placeholder="Localizar..."
            style={findInputStyle}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '58px' }}>
            {matchCount} ocorr.
          </span>
          <button type="button" onClick={handleFindNext} style={headerBtnStyle}>
            Próximo
          </button>
          <input
            type="text"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Substituir por..."
            style={findInputStyle}
          />
          <button type="button" onClick={handleReplaceOne} style={headerBtnStyle}>
            Substituir
          </button>
          <button type="button" onClick={handleReplaceAll} style={headerBtnStyle}>
            Substituir Tudo
          </button>
          <button
            type="button"
            onClick={() => setCaseSensitive(!caseSensitive)}
            title="Diferenciar maiúsculas/minúsculas"
            style={{
              ...headerBtnStyle,
              borderColor: caseSensitive ? 'var(--accent-primary)' : 'var(--border-subtle)',
              fontWeight: 700,
            }}
          >
            Aa
          </button>
          <button
            type="button"
            onClick={() => setUseRegexFind(!useRegexFind)}
            title="Usar Expressão Regular (Regex)"
            style={{
              ...headerBtnStyle,
              borderColor: useRegexFind ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            <Regex size={12} />
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginLeft: '8px',
            }}
          >
            <input
              type="number"
              min={1}
              max={lines.length}
              value={goToLineInput}
              onChange={(e) => setGoToLineInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && goToLineInput) {
                  jumpToLine(Number(goToLineInput));
                }
              }}
              placeholder="Ir p/ linha..."
              style={{ ...findInputStyle, width: '92px' }}
            />
          </div>

          <button
            type="button"
            onClick={() => setFindBarOpen(false)}
            style={{ ...windowCtrlBtnStyle, marginLeft: 'auto' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Corpo central: Activity Bar + Sidebar do Desenvolvedor + Editor/Diff/Preview */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Activity Bar lateral esquerda de ícones */}
        <div
          style={{
            width: '38px',
            backgroundColor: 'var(--bg-app)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '8px 0',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setSidebarTab(sidebarTab === 'files' ? null : 'files')}
            title="Arquivos do Projeto"
            style={{
              ...activityBtnStyle,
              color: sidebarTab === 'files' ? 'var(--accent)' : 'var(--text-muted)',
              borderLeft:
                sidebarTab === 'files' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <FolderTree size={16} />
          </button>

          <button
            type="button"
            onClick={() => setSidebarTab(sidebarTab === 'symbols' ? null : 'symbols')}
            title="Outline & Símbolos do Código"
            style={{
              ...activityBtnStyle,
              color: sidebarTab === 'symbols' ? 'var(--accent)' : 'var(--text-muted)',
              borderLeft:
                sidebarTab === 'symbols' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <ListTree size={16} />
          </button>

          <button
            type="button"
            onClick={() => setSidebarTab(sidebarTab === 'tools' ? null : 'tools')}
            title="Utilitários de Desenvolvedor (JSON, Base64, JWT, Regex, Case)"
            style={{
              ...activityBtnStyle,
              color: sidebarTab === 'tools' ? 'var(--accent)' : 'var(--text-muted)',
              borderLeft:
                sidebarTab === 'tools' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <Wrench size={16} />
          </button>

          <button
            type="button"
            onClick={() => setRunnerOpen(!runnerOpen)}
            title="Console de Execução (Output)"
            style={{
              ...activityBtnStyle,
              marginTop: 'auto',
              color: runnerOpen ? 'var(--accent)' : 'var(--text-muted)',
              borderLeft: runnerOpen ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <Terminal size={16} />
          </button>
        </div>

        {/* Painel Lateral retrátil do Studio (Arquivos / Símbolos / Utilitários Dev) */}
        {sidebarTab && (
          <div
            style={{
              width: '235px',
              backgroundColor: 'var(--bg-sidebar)',
              borderRight: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              flexShrink: 0,
            }}
          >
            {sidebarTab === 'files' && (
              <>
                <div style={sidebarHeaderStyle}>
                  <span>ARQUIVOS DO PROJETO</span>
                  <button
                    type="button"
                    onClick={() =>
                      void listDirectorySnapshot(effectiveWorkspace, false).then(
                        setWorkspaceEntries
                      )
                    }
                    title="Atualizar lista"
                    style={statusLinkBtnStyle}
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
                <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <input
                    type="text"
                    value={workspaceFilter}
                    onChange={(e) => setWorkspaceFilter(e.target.value)}
                    placeholder="Filtrar arquivos..."
                    style={{ ...findInputStyle, width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                  {effectiveWorkspace && effectiveWorkspace !== '/' && (
                    <div
                      onClick={() => {
                        const parent = effectiveWorkspace.replace(/[/\\][^/\\]+$/, '');
                        if (parent && parent !== effectiveWorkspace) {
                          setWorkspaceDir(parent);
                        }
                      }}
                      style={sidebarItemStyle}
                      title="Subir pasta"
                    >
                      <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span>..</span>
                    </div>
                  )}
                  {filteredWorkspaceEntries.map((entry) => {
                    const isCurrentFile = activeTab?.path === entry.location.path;
                    return (
                      <div
                        key={entry.location.path}
                        onClick={() => {
                          if (entry.kind === 'dir') {
                            setWorkspaceDir(entry.location.path);
                          } else {
                            void openFileInEditor(entry.location.path, true);
                          }
                        }}
                        style={{
                          ...sidebarItemStyle,
                          backgroundColor: isCurrentFile ? 'var(--bg-selected)' : 'transparent',
                          fontWeight: isCurrentFile ? 600 : 400,
                        }}
                        title={entry.location.path}
                      >
                        <FileTypeIcon
                          name={entry.name}
                          kind={entry.kind}
                          size={13}
                          showBadge={false}
                        />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {sidebarTab === 'symbols' && (
              <>
                <div style={sidebarHeaderStyle}>
                  <span>SÍMBOLOS ({codeSymbols.length})</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                  {codeSymbols.length === 0 ? (
                    <div style={{ padding: '12px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Nenhum símbolo estruturado detectado neste arquivo.
                    </div>
                  ) : (
                    codeSymbols.map((sym, idx) => (
                      <div
                        key={`${sym.name}-${sym.line}-${idx}`}
                        onClick={() => jumpToLine(sym.line)}
                        style={sidebarItemStyle}
                        title={`Ir para linha ${sym.line}`}
                      >
                        <Braces size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        <span
                          style={{
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {sym.name}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          :{sym.line}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {sidebarTab === 'tools' && (
              <>
                <div style={sidebarHeaderStyle}>
                  <span>FERRAMENTAS DEV</span>
                </div>
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={toolSectionLabelStyle}>
                    <Braces size={12} />
                    <span>JSON & Serialização</span>
                  </div>
                  <div style={toolGridStyle}>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('jsonPretty')}
                      style={toolBtnStyle}
                    >
                      JSON Pretty
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('jsonMinify')}
                      style={toolBtnStyle}
                    >
                      JSON Minify
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('jsonEscape')}
                      style={toolBtnStyle}
                    >
                      Escape JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('jsonUnescape')}
                      style={toolBtnStyle}
                    >
                      Unescape
                    </button>
                  </div>

                  <div style={toolSectionLabelStyle}>
                    <Table2 size={12} />
                    <span>CSV & Tabelas de Dados</span>
                  </div>
                  <div style={toolGridStyle}>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('csvToJson')}
                      style={toolBtnStyle}
                      title="Converter conteúdo CSV atual para array JSON"
                    >
                      CSV → JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('jsonToCsv')}
                      style={toolBtnStyle}
                      title="Converter array/objeto JSON atual para CSV"
                    >
                      JSON → CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('csvAlign')}
                      style={{ ...toolBtnStyle, gridColumn: 'span 2' }}
                      title="Alinhar colunas CSV com espaçamento fixo"
                    >
                      Alinhar Colunas CSV
                    </button>
                  </div>

                  <div style={toolSectionLabelStyle}>
                    <Hash size={12} />
                    <span>Codificação & Tokens</span>
                  </div>
                  <div style={toolGridStyle}>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('base64Encode')}
                      style={toolBtnStyle}
                    >
                      Base64 Enc
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('base64Decode')}
                      style={toolBtnStyle}
                    >
                      Base64 Dec
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('urlEncode')}
                      style={toolBtnStyle}
                    >
                      URL Encode
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('urlDecode')}
                      style={toolBtnStyle}
                    >
                      URL Decode
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('jwtDecode')}
                      style={{ ...toolBtnStyle, gridColumn: 'span 2' }}
                    >
                      Decodificar Token JWT
                    </button>
                  </div>

                  <div style={toolSectionLabelStyle}>
                    <ArrowUpDown size={12} />
                    <span>Linhas & Convenção de Nomes</span>
                  </div>
                  <div style={toolGridStyle}>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('sortAsc')}
                      style={toolBtnStyle}
                    >
                      Ordenar A→Z
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('sortDesc')}
                      style={toolBtnStyle}
                    >
                      Ordenar Z→A
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('dedupe')}
                      style={toolBtnStyle}
                    >
                      Sem Duplicadas
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('removeEmpty')}
                      style={toolBtnStyle}
                    >
                      Sem Vazias
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('camelCase')}
                      style={toolBtnStyle}
                    >
                      camelCase
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('snakeCase')}
                      style={toolBtnStyle}
                    >
                      snake_case
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('kebabCase')}
                      style={toolBtnStyle}
                    >
                      kebab-case
                    </button>
                    <button
                      type="button"
                      onClick={() => transformActiveTab('trimTrailing')}
                      style={toolBtnStyle}
                    >
                      Trim Espaços
                    </button>
                  </div>

                  <div style={toolSectionLabelStyle}>
                    <Clock size={12} />
                    <span>Geradores Rápidos</span>
                  </div>
                  <div style={toolGridStyle}>
                    <button
                      type="button"
                      onClick={() => {
                        const uuid =
                          typeof crypto !== 'undefined' && crypto.randomUUID
                            ? crypto.randomUUID()
                            : '00000000-0000-4000-8000-000000000000';
                        insertSnippetAtCursor(uuid);
                      }}
                      style={toolBtnStyle}
                    >
                      Inserir UUID
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippetAtCursor(new Date().toISOString())}
                      style={toolBtnStyle}
                    >
                      ISO-8601
                    </button>
                  </div>

                  <div style={toolSectionLabelStyle}>
                    <Regex size={12} />
                    <span>Testador de Regex</span>
                  </div>
                  <input
                    type="text"
                    value={regexTestPattern}
                    onChange={(e) => setRegexTestPattern(e.target.value)}
                    placeholder="Ex: \bfunc\s+\w+"
                    style={{ ...findInputStyle, width: '100%', fontFamily: 'var(--font-mono)' }}
                  />
                  {regexTestPattern.trim() && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {regexMatchesCount < 0
                        ? 'Expressão regular inválida'
                        : `${regexMatchesCount} correspondência(s) no arquivo`}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Coluna direita: Editor + Diff + Split Preview + Console de Execução */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {activeTab ? (
            <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
              {showDiffView ? (
                /* Visualizador de Diff (Disco vs Buffer Atual) */
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'var(--bg-surface)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      backgroundColor: 'var(--bg-subtle)',
                      borderBottom: '1px solid var(--border-subtle)',
                      fontSize: '11px',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      Comparação de Alterações (Versão Salva vs Edição Atual)
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => revertTabContent(activeTab.id)}
                        style={headerBtnStyle}
                        title="Descartar alterações e voltar para a versão salva em disco"
                      >
                        <RotateCcw size={12} />
                        <span>Reverter Alterações</span>
                      </button>
                      <button type="button" onClick={toggleDiffView} style={headerBtnStyle}>
                        Voltar ao Editor
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      fontFamily: 'var(--font-mono)',
                      fontSize: `${fontSize}px`,
                      lineHeight: `${lineHeightPx}px`,
                      padding: '8px 0',
                      userSelect: 'text',
                    }}
                  >
                    {diffLines.map((dl, idx) => {
                      const bg =
                        dl.type === 'added'
                          ? 'rgba(22, 163, 74, 0.16)'
                          : dl.type === 'removed'
                          ? 'rgba(220, 38, 38, 0.16)'
                          : 'transparent';
                      const sign = dl.type === 'added' ? '+' : dl.type === 'removed' ? '-' : ' ';
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            backgroundColor: bg,
                            padding: '0 12px',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          <span
                            style={{
                              width: '44px',
                              color: 'var(--text-muted)',
                              textAlign: 'right',
                              paddingRight: '8px',
                              userSelect: 'none',
                            }}
                          >
                            {dl.newLine ?? dl.oldLine ?? ''}
                          </span>
                          <span
                            style={{
                              width: '18px',
                              fontWeight: 700,
                              color:
                                dl.type === 'added'
                                  ? 'var(--status-success)'
                                  : dl.type === 'removed'
                                  ? 'var(--status-danger)'
                                  : 'var(--text-muted)',
                            }}
                          >
                            {sign}
                          </span>
                          <span style={{ flex: 1 }}>{dl.text || '\u00A0'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  {/* Gutter de numeração de linhas */}
                  <div
                    ref={gutterRef}
                    style={{
                      width: '54px',
                      padding: '10px 6px 10px 0',
                      backgroundColor: 'var(--bg-app)',
                      borderRight: '1px solid var(--border-subtle)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: `${fontSize}px`,
                      lineHeight: `${lineHeightPx}px`,
                      textAlign: 'right',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      userSelect: 'none',
                      flexShrink: 0,
                    }}
                  >
                    {lines.map((_, i) => {
                      const ln = i + 1;
                      const isCurrent = ln === activeTab.cursorLine;
                      const diag = diagnostics.find((d) => d.line === ln);
                      return (
                        <div
                          key={ln}
                          title={diag?.message}
                          style={{
                            height: `${lineHeightPx}px`,
                            paddingRight: '6px',
                            color: diag
                              ? 'var(--status-danger)'
                              : isCurrent
                              ? 'var(--accent-primary)'
                              : 'var(--text-muted)',
                            fontWeight: isCurrent || diag ? 700 : 400,
                          }}
                        >
                          {ln}
                        </div>
                      );
                    })}
                  </div>

                  {/* Camada de Syntax Highlighting + Textarea sincronizado */}
                  <div style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
                    <div
                      ref={highlightRef}
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        padding: '10px 14px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: `${fontSize}px`,
                        lineHeight: `${lineHeightPx}px`,
                        whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                        overflowWrap: wordWrap ? 'anywhere' : 'normal',
                        wordBreak: wordWrap ? 'break-word' : 'normal',
                        overflowY: 'scroll',
                        overflowX: wordWrap ? 'hidden' : 'auto',
                        pointerEvents: 'none',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {lines.map((lineText, idx) => {
                        const isCurrent = idx + 1 === activeTab.cursorLine;
                        return (
                          <div
                            key={idx}
                            style={{
                              minHeight: `${lineHeightPx}px`,
                              backgroundColor: isCurrent
                                ? 'rgba(59, 130, 246, 0.08)'
                                : 'transparent',
                            }}
                          >
                            {renderHighlightedLine(lineText, activeTab.language)}
                          </div>
                        );
                      })}
                    </div>

                    <textarea
                      ref={textareaRef}
                      value={activeTab.content}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoComplete="off"
                      onChange={(e) => {
                        updateTabContent(activeTab.id, e.target.value);
                        syncCursorFromTextarea();
                      }}
                      onScroll={syncScroll}
                      onClick={syncCursorFromTextarea}
                      onKeyUp={syncCursorFromTextarea}
                      onKeyDown={handleEditorKeyDown}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        resize: 'none',
                        border: 'none',
                        outline: 'none',
                        padding: '10px 14px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: `${fontSize}px`,
                        lineHeight: `${lineHeightPx}px`,
                        whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                        overflowWrap: wordWrap ? 'anywhere' : 'normal',
                        wordBreak: wordWrap ? 'break-word' : 'normal',
                        overflowY: 'scroll',
                        overflowX: wordWrap ? 'hidden' : 'auto',
                        backgroundColor: 'transparent',
                        color: 'transparent',
                        caretColor: 'var(--accent-primary)',
                      }}
                    />

                    {/* Popup de Snippets & Autocomplete (Ctrl+Space) */}
                    {suggestOpen && suggestions.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '24px',
                          top: `${Math.min(260, activeTab.cursorLine * lineHeightPx + 14)}px`,
                          width: '320px',
                          maxHeight: '210px',
                          overflowY: 'auto',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--accent-primary)',
                          borderRadius: 'var(--radius-md)',
                          boxShadow: '0 12px 28px rgba(0, 0, 0, 0.4)',
                          zIndex: 30,
                          padding: '4px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            padding: '2px 6px 4px',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          SNIPPETS & SÍMBOLOS (Enter / Tab para inserir)
                        </div>
                        {suggestions.map((item, idx) => {
                          const active = idx === suggestIdx;
                          return (
                            <div
                              key={`${item.label}-${idx}`}
                              onClick={() => insertSnippetAtCursor(item.insertText)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '5px 8px',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                                color: active ? 'var(--accent-text)' : 'var(--text-primary)',
                                fontSize: '12px',
                              }}
                            >
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                {item.label}
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {item.detail}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Minimapa interativo de código */}
                  {showMinimap && (
                    <div
                      onClick={(e) => {
                        const ta = textareaRef.current;
                        if (!ta) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickRatio = Math.max(
                          0,
                          Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))
                        );
                        ta.scrollTop = clickRatio * (ta.scrollHeight - ta.clientHeight);
                        syncScroll();
                      }}
                      title="Minimapa do código (clique para navegar)"
                      style={{
                        width: '72px',
                        backgroundColor: 'var(--bg-app)',
                        borderLeft: '1px solid var(--border-subtle)',
                        padding: '8px 6px',
                        overflow: 'hidden',
                        position: 'relative',
                        cursor: 'pointer',
                        userSelect: 'none',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: `${Math.round(scrollRatio * 75)}%`,
                          height: '22%',
                          backgroundColor: 'rgba(59, 130, 246, 0.16)',
                          borderTop: '1px solid rgba(59, 130, 246, 0.45)',
                          borderBottom: '1px solid rgba(59, 130, 246, 0.45)',
                          pointerEvents: 'none',
                        }}
                      />
                      {lines.slice(0, 160).map((ln, idx) => {
                        const trimmed = ln.trim();
                        const indent = Math.min(20, ln.length - ln.trimStart().length);
                        const widthPct = Math.min(
                          100,
                          Math.max(8, Math.round((trimmed.length / 60) * 100))
                        );
                        const isComment = trimmed.startsWith('//') || trimmed.startsWith('#');
                        return (
                          <div
                            key={idx}
                            style={{
                              height: '2px',
                              marginBottom: '2px',
                              marginLeft: `${indent}px`,
                              width: trimmed ? `${widthPct}%` : '0%',
                              borderRadius: '1px',
                              backgroundColor: isComment
                                ? 'rgba(106, 153, 85, 0.55)'
                                : idx + 1 === activeTab.cursorLine
                                ? 'var(--accent-primary)'
                                : 'var(--text-muted)',
                              opacity: 0.55,
                            }}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Painel de Split Preview ao vivo (Tabela CSV / Inspetor JSON / Markdown / HTML) */}
                  {showSplitPreview && (
                    <div
                      style={{
                        width: activeTab.language === 'csv' || activeTab.language === 'json' ? '50%' : '44%',
                        borderLeft: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-surface)',
                        padding: '12px 14px',
                        overflow: 'auto',
                        userSelect: 'text',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          borderBottom: '1px solid var(--border-subtle)',
                          paddingBottom: '6px',
                          gap: '8px',
                          flexShrink: 0,
                        }}
                      >
                        <span>
                          {activeTab.language === 'csv'
                            ? 'Editor de Tabela CSV Interativa'
                            : activeTab.language === 'json'
                            ? 'Inspetor & Tabela JSON'
                            : `Prévia em Tempo Real (${activeTab.language.toUpperCase()})`}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {activeTab.language === 'csv' && (
                            <>
                              <button
                                type="button"
                                onClick={() => transformActiveTab('csvAlign')}
                                style={headerBtnStyle}
                                title="Alinhar colunas no texto CSV"
                              >
                                Alinhar
                              </button>
                              <button
                                type="button"
                                onClick={() => transformActiveTab('csvToJson')}
                                style={headerBtnStyle}
                                title="Converter CSV para JSON"
                              >
                                CSV → JSON
                              </button>
                            </>
                          )}
                          {activeTab.language === 'json' && (
                            <>
                              <button
                                type="button"
                                onClick={formatActiveTab}
                                style={headerBtnStyle}
                                title="Formatar JSON (Shift+Alt+F)"
                              >
                                Formatar
                              </button>
                              <button
                                type="button"
                                onClick={() => transformActiveTab('jsonMinify')}
                                style={headerBtnStyle}
                                title="Compactar JSON em linha única"
                              >
                                Minificar
                              </button>
                              <button
                                type="button"
                                onClick={() => transformActiveTab('jsonToCsv')}
                                style={headerBtnStyle}
                                title="Converter JSON para Tabela CSV"
                              >
                                JSON → CSV
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {activeTab.language === 'csv' && parsedCsv ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              value={csvFilterQuery}
                              onChange={(e) => setCsvFilterQuery(e.target.value)}
                              placeholder="Filtrar linhas na tabela..."
                              style={{ ...findInputStyle, flex: 1, minWidth: '130px' }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {parsedCsv.rows.length} reg. × {parsedCsv.maxCols} col. (sep:{' '}
                              {parsedCsv.delimiter === '\t' ? 'TAB' : `"${parsedCsv.delimiter}"`})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const cols = Math.max(1, parsedCsv.maxCols || 3);
                                const nextHeaders =
                                  parsedCsv.headers.length > 0
                                    ? parsedCsv.headers
                                    : ['id', 'nome', 'valor'];
                                const nextRows = [
                                  ...parsedCsv.rows,
                                  new Array<string>(cols).fill(''),
                                ];
                                updateTabContent(
                                  activeTab.id,
                                  serializeCsvTable(
                                    nextHeaders,
                                    nextRows,
                                    parsedCsv.delimiter,
                                    activeTab.lineEnding
                                  )
                                );
                              }}
                              style={headerBtnStyle}
                              title="Adicionar nova linha ao CSV"
                            >
                              <Plus size={12} />
                              <span>Linha</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const nextColNum = parsedCsv.maxCols + 1;
                                const nextHeaders = [
                                  ...parsedCsv.headers,
                                  `coluna_${nextColNum}`,
                                ];
                                const nextRows = parsedCsv.rows.map((r) => {
                                  const copy = [...r];
                                  while (copy.length < parsedCsv.maxCols) copy.push('');
                                  copy.push('');
                                  return copy;
                                });
                                updateTabContent(
                                  activeTab.id,
                                  serializeCsvTable(
                                    nextHeaders,
                                    nextRows,
                                    parsedCsv.delimiter,
                                    activeTab.lineEnding
                                  )
                                );
                              }}
                              style={headerBtnStyle}
                              title="Adicionar nova coluna ao CSV"
                            >
                              <Plus size={12} />
                              <span>Coluna</span>
                            </button>
                          </div>

                          <div
                            style={{
                              flex: 1,
                              overflow: 'auto',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                            }}
                          >
                            {parsedCsv.headers.length === 0 ? (
                              <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                Arquivo CSV vazio. Clique em "+ Linha" para iniciar uma tabela.
                              </div>
                            ) : (
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  fontSize: '12px',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                <thead>
                                  <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                                    <th
                                      style={{
                                        padding: '5px 8px',
                                        borderBottom: '1px solid var(--border-subtle)',
                                        borderRight: '1px solid var(--border-subtle)',
                                        color: 'var(--text-muted)',
                                        width: '36px',
                                        textAlign: 'center',
                                      }}
                                    >
                                      #
                                    </th>
                                    {Array.from({ length: parsedCsv.maxCols }, (_, colIdx) => {
                                      const headerVal = parsedCsv.headers[colIdx] ?? '';
                                      const isSorted = csvSortCol === colIdx;
                                      const colColor =
                                        CSV_RAINBOW_COLORS[colIdx % CSV_RAINBOW_COLORS.length];
                                      return (
                                        <th
                                          key={colIdx}
                                          style={{
                                            padding: '4px 6px',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            borderRight: '1px solid var(--border-subtle)',
                                            textAlign: 'left',
                                            minWidth: '105px',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <input
                                              type="text"
                                              value={headerVal}
                                              onChange={(e) => {
                                                const nextHeaders = [...parsedCsv.headers];
                                                while (nextHeaders.length <= colIdx) {
                                                  nextHeaders.push(`Col_${nextHeaders.length + 1}`);
                                                }
                                                nextHeaders[colIdx] = e.target.value;
                                                updateTabContent(
                                                  activeTab.id,
                                                  serializeCsvTable(
                                                    nextHeaders,
                                                    parsedCsv.rows,
                                                    parsedCsv.delimiter,
                                                    activeTab.lineEnding
                                                  )
                                                );
                                              }}
                                              style={{
                                                border: 'none',
                                                background: 'transparent',
                                                color: colColor,
                                                fontWeight: 700,
                                                fontSize: '11px',
                                                fontFamily: 'var(--font-mono)',
                                                width: '100%',
                                                outline: 'none',
                                              }}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (csvSortCol === colIdx) {
                                                  setCsvSortAsc(!csvSortAsc);
                                                } else {
                                                  setCsvSortCol(colIdx);
                                                  setCsvSortAsc(true);
                                                }
                                              }}
                                              title="Ordenar por esta coluna"
                                              style={{
                                                ...statusLinkBtnStyle,
                                                color: isSorted
                                                  ? 'var(--accent-primary)'
                                                  : 'var(--text-muted)',
                                              }}
                                            >
                                              {isSorted ? (csvSortAsc ? '▲' : '▼') : '↕'}
                                            </button>
                                          </div>
                                        </th>
                                      );
                                    })}
                                    <th
                                      style={{
                                        width: '28px',
                                        borderBottom: '1px solid var(--border-subtle)',
                                      }}
                                    />
                                  </tr>
                                </thead>
                                <tbody>
                                  {parsedCsv.rows
                                    .map((row, idx) => ({ row, realRowIdx: idx }))
                                    .filter(({ row }) =>
                                      !csvFilterQuery.trim()
                                        ? true
                                        : row.some((c) =>
                                            c
                                              .toLowerCase()
                                              .includes(csvFilterQuery.trim().toLowerCase())
                                          )
                                    )
                                    .sort((a, b) => {
                                      if (csvSortCol === null) return 0;
                                      const va = a.row[csvSortCol] ?? '';
                                      const vb = b.row[csvSortCol] ?? '';
                                      const na = Number(va);
                                      const nb = Number(vb);
                                      const cmp =
                                        !Number.isNaN(na) &&
                                        !Number.isNaN(nb) &&
                                        va.trim() !== '' &&
                                        vb.trim() !== ''
                                          ? na - nb
                                          : va.localeCompare(vb);
                                      return csvSortAsc ? cmp : -cmp;
                                    })
                                    .map(({ row, realRowIdx }) => (
                                      <tr key={realRowIdx}>
                                        <td
                                          style={{
                                            padding: '3px 6px',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            borderRight: '1px solid var(--border-subtle)',
                                            textAlign: 'center',
                                            color: 'var(--text-muted)',
                                            fontSize: '11px',
                                          }}
                                        >
                                          {realRowIdx + 1}
                                        </td>
                                        {Array.from({ length: parsedCsv.maxCols }, (_, colIdx) => {
                                          const cellVal = row[colIdx] ?? '';
                                          return (
                                            <td
                                              key={colIdx}
                                              style={{
                                                padding: '2px 5px',
                                                borderBottom: '1px solid var(--border-subtle)',
                                                borderRight: '1px solid var(--border-subtle)',
                                              }}
                                            >
                                              <input
                                                type="text"
                                                value={cellVal}
                                                onChange={(e) => {
                                                  const nextHeaders = [...parsedCsv.headers];
                                                  while (nextHeaders.length <= colIdx) {
                                                    nextHeaders.push(
                                                      `Col_${nextHeaders.length + 1}`
                                                    );
                                                  }
                                                  const nextRows = parsedCsv.rows.map((r, rIdx) => {
                                                    if (rIdx !== realRowIdx) return r;
                                                    const copy = [...r];
                                                    while (copy.length <= colIdx) copy.push('');
                                                    copy[colIdx] = e.target.value;
                                                    return copy;
                                                  });
                                                  updateTabContent(
                                                    activeTab.id,
                                                    serializeCsvTable(
                                                      nextHeaders,
                                                      nextRows,
                                                      parsedCsv.delimiter,
                                                      activeTab.lineEnding
                                                    )
                                                  );
                                                }}
                                                style={{
                                                  border: 'none',
                                                  background: 'transparent',
                                                  color: 'var(--text-primary)',
                                                  fontSize: '12px',
                                                  fontFamily: 'var(--font-mono)',
                                                  width: '100%',
                                                  outline: 'none',
                                                }}
                                              />
                                            </td>
                                          );
                                        })}
                                        <td
                                          style={{
                                            borderBottom: '1px solid var(--border-subtle)',
                                            textAlign: 'center',
                                          }}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const nextRows = parsedCsv.rows.filter(
                                                (_, rIdx) => rIdx !== realRowIdx
                                              );
                                              updateTabContent(
                                                activeTab.id,
                                                serializeCsvTable(
                                                  parsedCsv.headers,
                                                  nextRows,
                                                  parsedCsv.delimiter,
                                                  activeTab.lineEnding
                                                )
                                              );
                                            }}
                                            title="Remover linha"
                                            style={{
                                              ...statusLinkBtnStyle,
                                              color: 'var(--status-danger)',
                                            }}
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      ) : activeTab.language === 'json' && parsedJsonPreview ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
                          {!parsedJsonPreview.ok ? (
                            <div
                              style={{
                                padding: '10px 12px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'rgba(220, 38, 38, 0.12)',
                                border: '1px solid var(--status-danger)',
                                color: 'var(--status-danger)',
                                fontSize: '12px',
                              }}
                            >
                              <strong>Erro de sintaxe JSON:</strong> {parsedJsonPreview.error}
                            </div>
                          ) : (
                            <>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                  fontSize: '11px',
                                }}
                              >
                                <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>
                                  ✓ JSON Válido (
                                  {Array.isArray(parsedJsonPreview.value)
                                    ? `Array com ${parsedJsonPreview.value.length} itens`
                                    : parsedJsonPreview.value &&
                                      typeof parsedJsonPreview.value === 'object'
                                    ? `Objeto com ${Object.keys(parsedJsonPreview.value as Record<string, unknown>).length} chaves`
                                    : typeof parsedJsonPreview.value}
                                  )
                                </span>
                                <input
                                  type="text"
                                  value={jsonFilterQuery}
                                  onChange={(e) => setJsonFilterQuery(e.target.value)}
                                  placeholder="Filtrar chaves/valores..."
                                  style={{ ...findInputStyle, width: '165px' }}
                                />
                              </div>

                              {/* Se for um Array de Objetos, exibe tabela automática dos registros */}
                              {Array.isArray(parsedJsonPreview.value) &&
                                parsedJsonPreview.value.length > 0 &&
                                typeof parsedJsonPreview.value[0] === 'object' &&
                                parsedJsonPreview.value[0] !== null && (
                                  <div
                                    style={{
                                      maxHeight: '240px',
                                      overflow: 'auto',
                                      border: '1px solid var(--border-subtle)',
                                      borderRadius: 'var(--radius-sm)',
                                    }}
                                  >
                                    {(() => {
                                      const items = parsedJsonPreview.value as Record<
                                        string,
                                        unknown
                                      >[];
                                      const cols = Array.from(
                                        items.reduce((acc, item) => {
                                          if (item && typeof item === 'object') {
                                            Object.keys(item).forEach((k) => acc.add(k));
                                          }
                                          return acc;
                                        }, new Set<string>())
                                      );
                                      const filteredItems = items.filter((item) =>
                                        !jsonFilterQuery.trim()
                                          ? true
                                          : JSON.stringify(item)
                                              .toLowerCase()
                                              .includes(jsonFilterQuery.trim().toLowerCase())
                                      );
                                      return (
                                        <table
                                          style={{
                                            width: '100%',
                                            borderCollapse: 'collapse',
                                            fontSize: '11px',
                                            fontFamily: 'var(--font-mono)',
                                          }}
                                        >
                                          <thead>
                                            <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                                              {cols.map((c) => (
                                                <th
                                                  key={c}
                                                  style={{
                                                    padding: '4px 8px',
                                                    borderBottom: '1px solid var(--border-subtle)',
                                                    borderRight: '1px solid var(--border-subtle)',
                                                    textAlign: 'left',
                                                    color: 'var(--accent)',
                                                  }}
                                                >
                                                  {c}
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {filteredItems.slice(0, 100).map((rowObj, rIdx) => (
                                              <tr key={rIdx}>
                                                {cols.map((c) => {
                                                  const v = rowObj?.[c];
                                                  const text =
                                                    v === null || v === undefined
                                                      ? ''
                                                      : typeof v === 'object'
                                                      ? JSON.stringify(v)
                                                      : String(v);
                                                  return (
                                                    <td
                                                      key={c}
                                                      style={{
                                                        padding: '3px 8px',
                                                        borderBottom:
                                                          '1px solid var(--border-subtle)',
                                                        borderRight:
                                                          '1px solid var(--border-subtle)',
                                                      }}
                                                    >
                                                      {text}
                                                    </td>
                                                  );
                                                })}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      );
                                    })()}
                                  </div>
                                )}

                              <pre
                                style={{
                                  flex: 1,
                                  overflow: 'auto',
                                  margin: 0,
                                  padding: '10px',
                                  backgroundColor: 'var(--bg-app)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '12px',
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {JSON.stringify(parsedJsonPreview.value, null, 2)
                                  .split('\n')
                                  .filter((l) =>
                                    !jsonFilterQuery.trim()
                                      ? true
                                      : l
                                          .toLowerCase()
                                          .includes(jsonFilterQuery.trim().toLowerCase())
                                  )
                                  .join('\n')}
                              </pre>
                            </>
                          )}
                        </div>
                      ) : activeTab.language === 'markdown' ? (
                        <div>{renderMarkdownPreview(activeTab.content)}</div>
                      ) : activeTab.language === 'html' ? (
                        <iframe
                          title="HTML Live Preview"
                          sandbox=""
                          srcDoc={activeTab.content}
                          style={{
                            width: '100%',
                            height: '92%',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: '#ffffff',
                          }}
                        />
                      ) : (
                        <pre
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {activeTab.content}
                        </pre>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  backgroundColor: 'var(--bg-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-primary)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                }}
              >
                <FileCode2 size={36} />
              </div>

              {statusMessage && statusMessage.startsWith('Não foi possível') ? (
                <div
                  style={{
                    maxWidth: '520px',
                    padding: '14px 18px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    border: '1px solid rgba(220, 38, 38, 0.3)',
                    color: 'var(--status-danger)',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '6px' }}>
                    <AlertTriangle size={16} />
                    <span>Aviso do Pulsares Studio</span>
                  </div>
                  <div>{statusMessage}</div>
                </div>
              ) : (
                <div style={{ maxWidth: '420px' }}>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: 'var(--text-primary)', fontWeight: 600 }}>
                    Nenhum documento aberto
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', color: 'var(--text-muted)' }}>
                    Crie um novo documento ou selecione um arquivo de texto no explorador para visualizá-lo e editá-lo no Pulsares Studio.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => openNewUntitledTab(effectiveWorkspace)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <Plus size={14} />
                  <span>Novo Documento</span>
                </button>
              </div>
            </div>
          )}

          {/* Console de Execução Integrado (Task & Script Runner) */}
          {runnerOpen && (
            <div
              style={{
                height: '185px',
                borderTop: '1px solid var(--border-strong)',
                backgroundColor: 'var(--bg-app)',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 10px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <Terminal size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '11px', fontWeight: 700 }}>CONSOLE DE EXECUÇÃO</span>
                <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={runnerCommand}
                  onChange={(e) => setRunnerCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void runStudioScript(effectiveWorkspace, runnerCommand);
                    }
                  }}
                  placeholder="Comando para executar (ex: go test ./..., node index.js)..."
                  style={{
                    ...findInputStyle,
                    flex: 1,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <button
                  type="button"
                  disabled={runnerLoading}
                  onClick={() => void runStudioScript(effectiveWorkspace, runnerCommand)}
                  style={headerBtnStyle}
                >
                  <Play size={12} style={{ color: 'var(--status-success)' }} />
                  <span>{runnerLoading ? 'Executando...' : 'Rodar'}</span>
                </button>
                {runnerResult && (
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard?.writeText) {
                        void navigator.clipboard.writeText(
                          `${runnerResult.stdout}\n${runnerResult.stderr}`.trim()
                        );
                      }
                    }}
                    title="Copiar saída"
                    style={headerBtnStyle}
                  >
                    <Copy size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRunnerOpen(false)}
                  style={windowCtrlBtnStyle}
                >
                  <X size={12} />
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '8px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  userSelect: 'text',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {runnerLoading ? (
                  <span style={{ color: 'var(--text-muted)' }}>Executando comando...</span>
                ) : runnerResult ? (
                  <>
                    {runnerResult.stdout && (
                      <div style={{ color: 'var(--text-primary)' }}>{runnerResult.stdout}</div>
                    )}
                    {runnerResult.stderr && (
                      <div style={{ color: 'var(--status-danger)', marginTop: '4px' }}>
                        {runnerResult.stderr}
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '11px',
                        color:
                          runnerResult.exitCode === 0
                            ? 'var(--status-success)'
                            : 'var(--status-danger)',
                      }}
                    >
                      Processo finalizado com código {runnerResult.exitCode} ({runnerResult.durationMs}{' '}
                      ms)
                    </div>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    Pressione Ctrl+Enter ou clique em Executar para rodar o script atual.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra de diagnósticos se houver alertas/erros de sintaxe */}
      {diagnostics.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            backgroundColor: 'rgba(220, 38, 38, 0.12)',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--status-danger)',
          }}
        >
          <AlertTriangle size={13} />
          <span>
            Linha {diagnostics[0].line}: {diagnostics[0].message}
          </span>
        </div>
      )}

      {/* Barra de status inferior do Pulsares Studio */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px',
          backgroundColor: 'var(--bg-subtle)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeTab ? (
            <>
              <span>
                Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}
              </span>
              <span>
                {lines.length} linhas • {activeTab.content.length} caract.
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {diagnostics.length === 0 ? (
                  <>
                    <CheckCircle2 size={12} style={{ color: 'var(--status-success)' }} />
                    <span>Sem alertas</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} style={{ color: 'var(--status-warning)' }} />
                    <span>{diagnostics.length} alerta(s)</span>
                  </>
                )}
              </span>
            </>
          ) : (
            <span>Pulsares Studio</span>
          )}
          {statusMessage && (
            <span
              style={{
                color: statusMessage.startsWith('Não foi possível')
                  ? 'var(--status-danger)'
                  : 'var(--accent-primary)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {statusMessage.startsWith('Não foi possível') && <AlertTriangle size={12} />}
              {statusMessage}
            </span>
          )}
        </div>

        {activeTab && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={toggleWordWrap}
              style={statusLinkBtnStyle}
              title="Alternar quebra automática de linha (Alt+Z)"
            >
              Wrap (Alt+Z): {wordWrap ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => setTabSize(tabSize === 2 ? 4 : 2)}
              style={statusLinkBtnStyle}
              title="Alternar tamanho da indentação"
            >
              Spaces: {tabSize}
            </button>
            <button
              type="button"
              onClick={() => toggleLineEnding(activeTab.id)}
              style={statusLinkBtnStyle}
              title="Alternar fim de linha LF / CRLF"
            >
              {activeTab.lineEnding}
            </button>
            <span>{activeTab.encoding}</span>

            <select
              value={activeTab.language}
              onChange={(e) => setTabLanguage(activeTab.id, e.target.value)}
              aria-label="Linguagem do arquivo"
              style={{
                fontSize: '11px',
                padding: '1px 4px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="plaintext">Plain Text (.txt)</option>
              <option value="csv">CSV / TSV (.csv)</option>
              <option value="json">JSON / JSONL (.json)</option>
              <option value="markdown">Markdown (.md)</option>
              <option value="typescript">TypeScript (.ts/.tsx)</option>
              <option value="javascript">JavaScript (.js/.jsx)</option>
              <option value="go">Go (.go)</option>
              <option value="python">Python (.py)</option>
              <option value="sql">SQL (.sql)</option>
              <option value="html">HTML (.html)</option>
              <option value="css">CSS (.css)</option>
              <option value="yaml">YAML (.yml)</option>
              <option value="toml">TOML (.toml)</option>
              <option value="xml">XML (.xml)</option>
              <option value="ini">INI / .env</option>
              <option value="shell">Shell (.sh)</option>
              <option value="powershell">PowerShell (.ps1)</option>
              <option value="rust">Rust (.rs)</option>
              <option value="cpp">C/C++ (.cpp)</option>
              <option value="c">C (.c)</option>
              <option value="csharp">C# (.cs)</option>
              <option value="java">Java (.java)</option>
              <option value="php">PHP (.php)</option>
              <option value="dockerfile">Dockerfile</option>
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setFontSize(fontSize - 1)}
                style={statusLinkBtnStyle}
                title="Diminuir fonte"
              >
                A-
              </button>
              <span>{fontSize}px</span>
              <button
                type="button"
                onClick={() => setFontSize(fontSize + 1)}
                style={statusLinkBtnStyle}
                title="Aumentar fonte"
              >
                A+
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Alça de redimensionamento quando em modo flutuante */}
      {!isDedicatedWindow && !isMaximized && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const origW = size.width;
            const origH = size.height;
            const onMove = (ev: MouseEvent) => {
              setSize({
                width: Math.max(640, origW + (ev.clientX - startX)),
                height: Math.max(400, origH + (ev.clientY - startY)),
              });
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          title="Arraste para redimensionar"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: '14px',
            height: '14px',
            cursor: 'nwse-resize',
          }}
        />
      )}
    </div>
  );
};

const headerBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: '11px',
  cursor: 'pointer',
};

const studioTitlebarWinBtnStyle: React.CSSProperties = {
  width: '42px',
  height: '100%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  borderRadius: 0,
  border: 'none',
  transition: 'background-color 0.12s, color 0.12s',
};

const windowCtrlBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 6px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: '11px',
  cursor: 'pointer',
};

const findInputStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  width: '150px',
};

const statusLinkBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: '11px',
  padding: '0 2px',
};

const activityBtnStyle: React.CSSProperties = {
  width: '100%',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const sidebarHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-subtle)',
};

const sidebarItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '5px 8px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '12px',
  cursor: 'pointer',
  color: 'var(--text-primary)',
};

const toolSectionLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const toolGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '4px',
};

const toolBtnStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: '11px',
  cursor: 'pointer',
  textAlign: 'center',
};
