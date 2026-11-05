import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  useEditorStore,
  computeDiagnostics,
  EditorTab,
} from './store';
import { useBrowserStore } from '../browser/store';

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
      insertText: 'type MeuTipo struct {\n\tID   string `json:"id"`\n\tNome string `json:"nome"`\n}',
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
      insertText: 'export async function executeTask(): Promise<void> {\n  try {\n    \n  } catch (err) {\n    console.error(err);\n  }\n}',
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
      detail: 'Log de depuração',
      insertText: "console.log('[DEBUG]:', );",
    },
  ],
  python: [
    {
      label: 'def',
      detail: 'Função Python com tipagem',
      insertText: 'def processar_dados(itens: list[str]) -> list[str]:\n    return [x.strip() for x in itens]\n',
    },
    {
      label: 'main',
      detail: 'Bloco __main__ Python',
      insertText: 'if __name__ == "__main__":\n    main()\n',
    },
  ],
  markdown: [
    {
      label: 'table',
      detail: 'Tabela Markdown',
      insertText: '| Coluna 1 | Coluna 2 | Status |\n| :--- | :--- | :--- |\n| Item A | Valor 1 | OK |\n| Item B | Valor 2 | Pendente |',
    },
    {
      label: 'codeblock',
      detail: 'Bloco de código cercado',
      insertText: '```ts\n// código aqui\n```',
    },
    {
      label: 'checklist',
      detail: 'Lista de tarefas Markdown',
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

export const CodeEditorModal: React.FC = () => {
  const {
    isOpen,
    isMinimized,
    isMaximized,
    tabs,
    activeTabId,
    fontSize,
    tabSize,
    wordWrap,
    showMinimap,
    showSplitPreview,
    findBarOpen,
    statusMessage,
    openNewUntitledTab,
    closeTab,
    setActiveTab,
    updateTabContent,
    updateCursor,
    setTabLanguage,
    toggleLineEnding,
    saveTab,
    saveAllTabs,
    formatActiveTab,
    transformActiveTab,
    setEditorOpen,
    setMinimized,
    toggleMaximized,
    setFontSize,
    setTabSize,
    toggleWordWrap,
    toggleMinimap,
    toggleSplitPreview,
    setFindBarOpen,
  } = useEditorStore();

  const { currentPath, refresh } = useBrowserStore();

  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 80, y: 48 });
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: Math.min(1080, Math.max(720, typeof window !== 'undefined' ? window.innerWidth - 160 : 960)),
    height: Math.min(720, Math.max(480, typeof window !== 'undefined' ? window.innerHeight - 110 : 620)),
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
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [scrollRatio, setScrollRatio] = useState(0);

  const activeTab: EditorTab | null =
    tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

  const lines = useMemo(() => {
    if (!activeTab) return [''];
    return activeTab.content.replace(/\r\n/g, '\n').split('\n');
  }, [activeTab]);

  const diagnostics = useMemo(() => {
    if (!activeTab) return [];
    return computeDiagnostics(activeTab.content, activeTab.language);
  }, [activeTab]);

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
      detail: 'Identificador no documento',
      insertText: w,
    }));
    return [...baseSnippets, ...wordItems];
  }, [activeTab]);

  const matchCount = useMemo(() => {
    if (!activeTab || !findQuery) return 0;
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
  }, [activeTab, findQuery, caseSensitive]);

  useEffect(() => {
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
  }, []);

  if (!isOpen) return null;

  const dirtyCount = tabs.filter((t) => t.content !== t.savedContent).length;

  // Modo minimizado (pílula flutuante desacoplada no canto inferior direito)
  if (isMinimized) {
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
        <span style={{ fontSize: '14px' }}>📝</span>
        <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
          Monaco Dev Editor ({tabs.length} {tabs.length === 1 ? 'aba' : 'abas'}
          {dirtyCount > 0 ? ` • ${dirtyCount} não salvo` : ''})
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditorOpen(false);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          ✕
        </button>
      </div>
    );
  }

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

    // Autocomplete popup navigation
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

    // Ctrl+Space -> IntelliSense / Snippets
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      setSuggestIdx(0);
      setSuggestOpen((v) => !v);
      return;
    }

    // Ctrl+S -> Salvar arquivo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void (async () => {
        const ok = await saveTab(activeTab.id, currentPath);
        if (ok) void refresh();
      })();
      return;
    }

    // Ctrl+F / Ctrl+H -> Localizar e substituir
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) {
      e.preventDefault();
      setFindBarOpen(!findBarOpen);
      return;
    }

    // Ctrl+N -> Nova aba sem título
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      openNewUntitledTab(currentPath, activeTab.language);
      return;
    }

    // Shift+Alt+F -> Formatar documento (estilo Monaco)
    if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      formatActiveTab();
      return;
    }

    // Ctrl+/ -> Alternar comentário na linha ou seleção
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

    // Tab / Shift+Tab -> Indentação inteligente de bloco ou linha
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

    // Auto-fechamento de pares (parênteses, colchetes, chaves, aspas)
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
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, flags);
    updateTabContent(activeTab.id, activeTab.content.replace(regex, replaceQuery));
  };

  const handleReplaceAll = () => {
    if (!activeTab || !findQuery) return;
    const flags = caseSensitive ? 'g' : 'gi';
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, flags);
    updateTabContent(activeTab.id, activeTab.content.replace(regex, replaceQuery));
  };

  const lineHeightPx = Math.round(fontSize * 1.55);

  const windowStyle: React.CSSProperties = isMaximized
    ? {
        position: 'fixed',
        inset: '12px',
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
    <div role="dialog" aria-label="Monaco Code & Text Editor" style={windowStyle}>
      {/* Barra de título arrastável do modal desacoplado */}
      <div
        onMouseDown={(e) => {
          if (isMaximized) return;
          if ((e.target as HTMLElement).closest('button, select, input')) return;
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: pos.x,
            origY: pos.y,
          };
        }}
        onDoubleClick={toggleMaximized}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          backgroundColor: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: isMaximized ? 'default' : 'move',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>⚡</span>
          <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>
            Pulsares Studio Editor
          </span>
          <span
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '999px',
              backgroundColor: 'var(--accent-subtle)',
              color: 'var(--accent-text)',
              fontWeight: 600,
            }}
          >
            Monaco Dev Engine
          </span>
          {activeTab?.path && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                maxWidth: '380px',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => openNewUntitledTab(currentPath, activeTab?.language || 'plaintext')}
            title="Novo arquivo (Ctrl+N)"
            style={headerBtnStyle}
          >
            + Novo
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeTab) return;
              void (async () => {
                const ok = await saveTab(activeTab.id, currentPath);
                if (ok) void refresh();
              })();
            }}
            title="Salvar (Ctrl+S)"
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
            💾 Salvar
          </button>
          {dirtyCount > 1 && (
            <button
              type="button"
              onClick={() => void saveAllTabs(currentPath)}
              title="Salvar todas as abas"
              style={headerBtnStyle}
            >
              Salvar Tudo ({dirtyCount})
            </button>
          )}
          <button
            type="button"
            onClick={formatActiveTab}
            title="Formatar documento (Shift+Alt+F)"
            style={headerBtnStyle}
          >
            ✨ Formatar
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
            🔍 Buscar
          </button>
          <button
            type="button"
            onClick={() => {
              setSuggestIdx(0);
              setSuggestOpen((v) => !v);
            }}
            title="Snippets & IntelliSense (Ctrl+Space)"
            style={headerBtnStyle}
          >
            💡 Snippets
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
            ◫ Split Preview
          </button>
          <button
            type="button"
            onClick={toggleMinimap}
            title="Mostrar/ocultar Minimapa Monaco"
            style={{
              ...headerBtnStyle,
              borderColor: showMinimap ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            🗺️ Minimap
          </button>

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
            onClick={() => setMinimized(true)}
            title="Minimizar para pílula flutuante (continua editando em segundo plano)"
            style={windowCtrlBtnStyle}
          >
            —
          </button>
          <button
            type="button"
            onClick={toggleMaximized}
            title={isMaximized ? 'Restaurar janela' : 'Maximizar janela'}
            style={windowCtrlBtnStyle}
          >
            {isMaximized ? '🗗' : '▢'}
          </button>
          <button
            type="button"
            onClick={() => setEditorOpen(false)}
            title="Fechar editor"
            style={{ ...windowCtrlBtnStyle, color: 'var(--status-danger)' }}
          >
            ✕
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
              <span style={{ fontSize: '11px' }}>
                {tab.language === 'markdown'
                  ? '📘'
                  : tab.language === 'json'
                  ? '📋'
                  : tab.language === 'go'
                  ? '🐹'
                  : tab.language === 'typescript' || tab.language === 'javascript'
                  ? '⚡'
                  : '📄'}
              </span>
              <span style={{ fontWeight: isActive ? 600 : 400 }}>{tab.name}</span>
              {isDirty && (
                <span
                  title="Alterações não salvas"
                  style={{ color: 'var(--accent-primary)', fontSize: '12px' }}
                >
                  ●
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: '0 2px',
                }}
              >
                ✕
              </button>
            </div>
          );
        })}

        {/* Transformações rápidas de desenvolvedor */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select
            aria-label="Transformações de texto para desenvolvedor"
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value as
                | 'sortAsc'
                | 'sortDesc'
                | 'dedupe'
                | 'trimTrailing'
                | 'upper'
                | 'lower'
                | '';
              if (val) {
                transformActiveTab(val);
                e.target.value = '';
              }
            }}
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
            }}
          >
            <option value="" disabled>
              🛠️ Ações de Código...
            </option>
            <option value="sortAsc">Ordenar linhas (A → Z)</option>
            <option value="sortDesc">Ordenar linhas (Z → A)</option>
            <option value="dedupe">Remover linhas duplicadas</option>
            <option value="trimTrailing">Remover espaços no fim da linha</option>
            <option value="upper">Converter para MAIÚSCULAS</option>
            <option value="lower">Converter para minúsculas</option>
          </select>
        </div>
      </div>

      {/* Barra de Localizar & Substituir (Ctrl+F / Ctrl+H) */}
      {findBarOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            backgroundColor: 'var(--bg-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            value={findQuery}
            autoFocus
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFindNext();
              if (e.key === 'Escape') setFindBarOpen(false);
            }}
            placeholder="Localizar no código..."
            style={findInputStyle}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '64px' }}>
            {matchCount} ocorr.
          </span>
          <button type="button" onClick={handleFindNext} style={headerBtnStyle}>
            Próximo ↵
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
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Aa
          </label>
          <button
            type="button"
            onClick={() => setFindBarOpen(false)}
            style={{ ...windowCtrlBtnStyle, marginLeft: 'auto' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Área principal do editor + Minimap + Split Preview */}
      {activeTab ? (
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
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
                  {diag ? '● ' : ''}
                  {ln}
                </div>
              );
            })}
          </div>

          {/* Camada combinada: Syntax Highlighting + Textarea transparente sincronizado */}
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

            {/* Popup de IntelliSense / Snippets (Ctrl+Space) */}
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
                  SUGESTÕES MONACO (Enter / Tab para inserir)
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

          {/* Minimapa interativo estilo Monaco */}
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
                width: '74px',
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
              {/* Indicador da janela visível no minimapa */}
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
                const widthPct = Math.min(100, Math.max(8, Math.round((trimmed.length / 60) * 100)));
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
        </div>
      ) : null}

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
          <span>⚠️ Diagnóstico:</span>
          <span>
            Linha {diagnostics[0].line}: {diagnostics[0].message}
          </span>
        </div>
      )}

      {/* Barra de status inferior estilo VS Code / Monaco */}
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
            <span>
              {diagnostics.length === 0 ? '✓ Sem problemas' : `⚠ ${diagnostics.length} alerta(s)`}
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

      {/* Alça de redimensionamento no canto inferior direito quando não maximizado */}
      {!isMaximized && (
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
                width: Math.max(580, origW + (ev.clientX - startX)),
                height: Math.max(360, origH + (ev.clientY - startY)),
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
  padding: '3px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: '11px',
  cursor: 'pointer',
};

const windowCtrlBtnStyle: React.CSSProperties = {
  padding: '2px 7px',
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
  width: '180px',
};

const statusLinkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: '11px',
  padding: '0 2px',
};
