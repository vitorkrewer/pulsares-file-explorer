import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileCode2,
  FileJson,
  FileText,
  FileTerminal,
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
} from 'lucide-react';
import {
  useEditorStore,
  computeDiagnostics,
  extractCodeSymbols,
  computeLineDiff,
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

function renderTabFileIcon(language: string) {
  switch (language) {
    case 'json':
    case 'yaml':
    case 'toml':
      return <FileJson size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />;
    case 'markdown':
    case 'plaintext':
      return <FileText size={13} style={{ color: '#38bdf8', flexShrink: 0 }} />;
    case 'shell':
    case 'powershell':
    case 'bat':
      return <FileTerminal size={13} style={{ color: '#22c55e', flexShrink: 0 }} />;
    default:
      return <FileCode2 size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />;
  }
}

function renderHighlightedLine(line: string, language: string): React.ReactNode {
  if (!line) return '\u00A0';

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

  const effectiveWorkspace = workspaceDir || currentPath || '/';

  const activeTab: EditorTab | null =
    tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

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

    if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      formatActiveTab();
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
              background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(124, 58, 237, 0.35)',
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
            title="Formatar código (Shift+Alt+F)"
            style={headerBtnStyle}
          >
            <Sparkles size={13} />
            <span>Formatar</span>
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
            title="Alternar prévia lado a lado (Markdown / HTML / JSON)"
            style={{
              ...headerBtnStyle,
              borderColor: showSplitPreview ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            <Columns2 size={13} />
            <span>Prévia</span>
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
              {renderTabFileIcon(tab.language)}
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
                        {entry.kind === 'dir' ? (
                          <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        ) : (
                          <FileCode2
                            size={13}
                            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
                          />
                        )}
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
                        wordBreak: wordWrap ? 'break-word' : 'normal',
                        overflow: 'hidden',
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
                        wordBreak: wordWrap ? 'break-word' : 'normal',
                        overflow: 'auto',
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

                  {/* Painel de Split Preview ao vivo (Markdown / HTML / JSON) */}
                  {showSplitPreview && (
                    <div
                      style={{
                        width: '44%',
                        borderLeft: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-surface)',
                        padding: '14px 18px',
                        overflowY: 'auto',
                        userSelect: 'text',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          marginBottom: '10px',
                          borderBottom: '1px solid var(--border-subtle)',
                          paddingBottom: '4px',
                        }}
                      >
                        Prévia em Tempo Real ({activeTab.language.toUpperCase()})
                      </div>
                      {activeTab.language === 'markdown' ? (
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
          ) : null}

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
      {activeTab && (
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
            {statusMessage && (
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                {statusMessage}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={toggleWordWrap}
              style={statusLinkBtnStyle}
              title="Alternar quebra automática de linha"
            >
              Wrap: {wordWrap ? 'ON' : 'OFF'}
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
              <option value="markdown">Markdown (.md)</option>
              <option value="typescript">TypeScript (.ts/.tsx)</option>
              <option value="javascript">JavaScript (.js/.jsx)</option>
              <option value="go">Go (.go)</option>
              <option value="python">Python (.py)</option>
              <option value="json">JSON (.json)</option>
              <option value="yaml">YAML (.yml)</option>
              <option value="html">HTML (.html)</option>
              <option value="css">CSS (.css)</option>
              <option value="sql">SQL (.sql)</option>
              <option value="shell">Shell (.sh)</option>
              <option value="powershell">PowerShell (.ps1)</option>
              <option value="rust">Rust (.rs)</option>
              <option value="cpp">C/C++ (.cpp)</option>
              <option value="xml">XML (.xml)</option>
              <option value="ini">INI / .env</option>
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
        </div>
      )}

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
