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
  ChevronDown,
  Square,
  WrapText,
  Table2,
  Trash2,
  FilePlus,
  FolderPlus,
  Pencil,
  FolderInput,
  Scissors,
  ClipboardPaste,
  Files,
  Eye,
  Monitor,
  Tablet,
  Smartphone,
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
  isStudioPdfFile,
  isStudioImageFile,
  isStudioAudioVideoFile,
  isBinaryMediaTab,
  isTabMediaPreviewActive,
  normalizeStudioFilePath,
} from './store';
import { StudioMediaViewer, formatStudioMediaBytes } from './StudioMediaViewer';
import { useBrowserStore } from '../browser/store';
import {
  Entry,
  listDirectorySnapshot,
  readTextFile,
  writeTextFile,
  createFile,
  createFolder,
  renameItem,
  runOperationAndWait,
  revealInSystemExplorer,
  resolveStudioProjectURL,
  syncStudioLiveFiles,
  studioSearchInProject,
  studioReplaceInProject,
  studioGetGitStatus,
  StudioProjectSearchMatch,
  StudioGitStatus,
  subscribeEvent,
  StudioOpenFileEvent,
  windowMinimize,
  windowToggleMaximize,
  windowClose,
} from '../../lib/wails';
import { FileTypeIcon } from '../../ui/FileTypeIcon';

function encodeBase64Url(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function normalizeRelativeAssetRef(ref: string): string {
  return ref
    .trim()
    .replace(/^[./\\]+/, '')
    .split(/[?#]/)[0]
    .toLowerCase();
}

function isExternalOrDataUrl(ref: string): boolean {
  const trimmed = ref.trim().toLowerCase();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  );
}

export function buildConnectedWebPreviewDoc(
  rawHtml: string,
  projectDir: string,
  siblingFilesMap: Record<string, string>,
  openTabs: EditorTab[]
): string {
  const assetContent = new Map<string, string>();
  Object.entries(siblingFilesMap).forEach(([fileName, content]) => {
    assetContent.set(normalizeRelativeAssetRef(fileName), content);
  });

  openTabs.forEach((t) => {
    if (t.name) {
      assetContent.set(normalizeRelativeAssetRef(t.name), t.content);
    }
    if (t.path && projectDir) {
      const cleanBase = projectDir.replace(/[\\/]+$/, '');
      if (t.path.toLowerCase().startsWith(cleanBase.toLowerCase())) {
        const rel = t.path.slice(cleanBase.length).replace(/^[/\\]+/, '');
        if (rel) {
          assetContent.set(normalizeRelativeAssetRef(rel), t.content);
        }
      }
    }
  });

  let html = rawHtml;

  // 1. Injeta <base href="/__project/<b64>/"> e ponte de console para resolver recursos relativos e capturar logs em tempo real
  const consoleBridgeScript = `<script>(function(){if(window.__pulsaresConsoleHooked)return;window.__pulsaresConsoleHooked=true;var orig={log:console.log,info:console.info,warn:console.warn,error:console.error};function fmt(a){try{if(typeof a==='object'&&a!==null)return JSON.stringify(a);return String(a);}catch(e){return String(a);}}function send(lvl,args){try{var msg=Array.prototype.slice.call(args).map(fmt).join(' ');window.parent.postMessage({type:'PULSARES_PREVIEW_CONSOLE',level:lvl,message:msg,ts:Date.now()},'*');}catch(e){}}['log','info','warn','error'].forEach(function(k){console[k]=function(){send(k,arguments);if(orig[k])orig[k].apply(console,arguments);};});window.addEventListener('error',function(ev){send('error',[ev.message||'Erro de script']);});})();</script>`;

  if (projectDir && typeof window !== 'undefined') {
    const b64 = encodeBase64Url(projectDir);
    if (b64) {
      const baseTag = `<base href="${window.location.origin}/__project/${b64}/" />\n  ${consoleBridgeScript}`;
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1>\n  ${baseTag}`);
      } else {
        html = `${baseTag}\n${html}`;
      }
    } else if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>\n  ${consoleBridgeScript}`);
    } else {
      html = `${consoleBridgeScript}\n${html}`;
    }
  } else if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  ${consoleBridgeScript}`);
  } else {
    html = `${consoleBridgeScript}\n${html}`;
  }

  // 2. Substitui <link ... rel="stylesheet" ... href="..."> locais pelo conteúdo CSS conectado em tempo real
  html = html.replace(/<link\b[^>]*>/gi, (fullTag) => {
    if (!/rel\s*=\s*["']?stylesheet["']?/i.test(fullTag)) return fullTag;
    const hrefMatch = fullTag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) return fullTag;
    const href = hrefMatch[1];
    if (isExternalOrDataUrl(href)) return fullTag;
    const key = normalizeRelativeAssetRef(href);
    const baseKey = key.split(/[/\\]/).pop() || key;
    const css = assetContent.get(key) ?? assetContent.get(baseKey);
    if (css !== undefined) {
      return `<style data-pulsares-source="${href}">\n${css}\n</style>`;
    }
    return fullTag;
  });

  // 3. Substitui <script ... src="..."></script> locais pelo conteúdo JS conectado em tempo real
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (fullTag, attrs: string) => {
    const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) return fullTag;
    const src = srcMatch[1];
    if (isExternalOrDataUrl(src)) return fullTag;
    const key = normalizeRelativeAssetRef(src);
    const baseKey = key.split(/[/\\]/).pop() || key;
    const js = assetContent.get(key) ?? assetContent.get(baseKey);
    if (js !== undefined) {
      const cleanAttrs = attrs.replace(/src\s*=\s*["'][^"']+["']/i, '').trim();
      return `<script ${cleanAttrs} data-pulsares-source="${src}">\n${js}\n</script>`;
    }
    return fullTag;
  });

  return html;
}

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

function resolveMarkdownAssetPath(rawRef: string, baseDir?: string): string {
  const trimmed = rawRef.trim();
  if (!trimmed || isExternalOrDataUrl(trimmed) || trimmed.startsWith('/__')) {
    return trimmed;
  }
  if (/^[a-zA-Z]:[/\\]/.test(trimmed) || trimmed.startsWith('\\\\')) {
    return `/__localmedia?path=${encodeURIComponent(trimmed)}`;
  }
  if (baseDir) {
    const cleanBase = baseDir.replace(/[/\\]+$/, '');
    const cleanRel = trimmed.replace(/^[./\\]+/, '').replace(/\//g, '\\');
    const sep = cleanBase.includes('\\') ? '\\' : '/';
    const joined = `${cleanBase}${sep}${cleanRel.replace(/\\/g, sep)}`;
    return `/__localmedia?path=${encodeURIComponent(joined)}`;
  }
  return trimmed;
}

function resolveMarkdownLinkTarget(rawHref: string, baseDir?: string): string {
  const trimmed = rawHref.trim().split('#')[0];
  if (!trimmed) return '';
  if (isExternalOrDataUrl(trimmed)) return trimmed;
  if (/^[a-zA-Z]:[/\\]/.test(trimmed) || trimmed.startsWith('\\\\')) {
    return trimmed;
  }
  if (baseDir) {
    const cleanBase = baseDir.replace(/[/\\]+$/, '');
    const sep = cleanBase.includes('\\') ? '\\' : '/';
    const rel = trimmed.replace(/^[./\\]+/, '').replace(/[/\\]/g, sep);
    return `${cleanBase}${sep}${rel}`;
  }
  return trimmed;
}

export function renderInlineMarkdown(
  text: string,
  keyPrefix: string,
  baseDir?: string,
  onOpenLink?: (targetPathOrUrl: string) => void
): React.ReactNode {
  if (!text) return null;

  // Tokeniza imagens, links, código inline (`` ou `), negrito+itálico, negrito, tachado, <kbd> e itálico
  const inlineRegex =
    /(!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\(([^)]+)\)|``([^`]+)``|`([^`]+)`|\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|<kbd>([^<]+)<\/kbd>|\*([^*\s][^*]*?)\*|\b_([^_\s][^_]*?)_\b)/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const k = `${keyPrefix}-i-${tokenIdx++}`;

    if (match[1].startsWith('![')) {
      const alt = match[2] || '';
      const rawSrc = match[3] || '';
      const title = match[4] || alt;
      const resolvedSrc = resolveMarkdownAssetPath(rawSrc, baseDir);
      nodes.push(
        <img
          key={k}
          src={resolvedSrc}
          alt={alt}
          title={title}
          style={{
            maxWidth: '100%',
            maxHeight: '360px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            margin: '6px 0',
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
        />
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      const label = match[5];
      const rawHref = match[6].trim();
      nodes.push(
        <a
          key={k}
          href={rawHref}
          title={rawHref}
          onClick={(e) => {
            e.preventDefault();
            if (rawHref.startsWith('#')) return;
            const resolved = resolveMarkdownLinkTarget(rawHref, baseDir);
            if (onOpenLink && resolved && !isExternalOrDataUrl(resolved)) {
              onOpenLink(resolved);
            } else if (isExternalOrDataUrl(rawHref)) {
              window.open(rawHref, '_blank', 'noopener,noreferrer');
            }
          }}
          style={{
            color: 'var(--accent)',
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {renderInlineMarkdown(label, `${k}-lbl`, baseDir, onOpenLink)}
        </a>
      );
    } else if (match[7] !== undefined || match[8] !== undefined) {
      const codeText = match[7] ?? match[8] ?? '';
      nodes.push(
        <code
          key={k}
          style={{
            padding: '1.5px 5px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.88em',
            color: 'var(--accent-text)',
          }}
        >
          {codeText}
        </code>
      );
    } else if (match[9] !== undefined || match[10] !== undefined) {
      const biText = match[9] ?? match[10] ?? '';
      nodes.push(
        <strong key={k} style={{ fontWeight: 700, fontStyle: 'italic', color: 'var(--text-primary)' }}>
          { renderInlineMarkdown(biText, `${k}-bi`, baseDir, onOpenLink) }
        </strong>
      );
    } else if (match[11] !== undefined || match[12] !== undefined) {
      const bText = match[11] ?? match[12] ?? '';
      nodes.push(
        <strong key={k} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
          {renderInlineMarkdown(bText, `${k}-b`, baseDir, onOpenLink)}
        </strong>
      );
    } else if (match[13] !== undefined) {
      nodes.push(
        <del key={k} style={{ opacity: 0.72 }}>
          {renderInlineMarkdown(match[13], `${k}-del`, baseDir, onOpenLink)}
        </del>
      );
    } else if (match[14] !== undefined) {
      nodes.push(
        <kbd
          key={k}
          style={{
            padding: '1px 5px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 1px 0 var(--border-strong)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.84em',
            color: 'var(--text-primary)',
          }}
        >
          {match[14]}
        </kbd>
      );
    } else if (match[15] !== undefined || match[16] !== undefined) {
      const iText = match[15] ?? match[16] ?? '';
      nodes.push(
        <em key={k} style={{ fontStyle: 'italic' }}>
          {renderInlineMarkdown(iText, `${k}-em`, baseDir, onOpenLink)}
        </em>
      );
    }

    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

function splitMarkdownTableRow(rowLine: string): string[] {
  const trimmed = rowLine.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
  const cells = splitMarkdownTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

export function renderMarkdownPreview(
  md: string,
  baseDir?: string,
  onOpenLink?: (targetPathOrUrl: string) => void
): React.ReactNode {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const elements: React.ReactNode[] = [];

  let i = 0;

  // 1. Suporte a YAML Frontmatter no topo do arquivo (--- ... ---)
  if (lines[0]?.trim() === '---') {
    let endFm = -1;
    for (let j = 1; j < Math.min(lines.length, 40); j++) {
      if (lines[j].trim() === '---' || lines[j].trim() === '...') {
        endFm = j;
        break;
      }
    }
    if (endFm > 0) {
      const fmPairs = lines
        .slice(1, endFm)
        .map((l) => {
          const colonIdx = l.indexOf(':');
          if (colonIdx <= 0) return null;
          return {
            key: l.slice(0, colonIdx).trim(),
            val: l.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, ''),
          };
        })
        .filter((item): item is { key: string; val: string } => Boolean(item));

      if (fmPairs.length > 0) {
        elements.push(
          <div
            key="md-frontmatter"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 12px',
              padding: '8px 12px',
              marginBottom: '12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11.5px',
            }}
          >
            {fmPairs.map((pair, pIdx) => (
              <span key={pIdx}>
                <strong style={{ color: 'var(--text-muted)' }}>{pair.key}:</strong>{' '}
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {pair.val}
                </span>
              </span>
            ))}
          </div>
        );
      }
      i = endFm + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 2. Blocos de código cercados (```lang ou ~~~lang)
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const fenceMarker = fenceMatch[1].slice(0, 3);
      const codeLang = (fenceMatch[2] || '').trim().split(/\s+/)[0].toLowerCase();
      const codeLines: string[] = [];
      const startIdx = i;
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fenceMarker)) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // Consome linha de fechamento
      const rawCode = codeLines.join('\n');

      elements.push(
        <div
          key={`code-${startIdx}`}
          style={{
            margin: '10px 0',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-app)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 10px',
              backgroundColor: 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
              fontSize: '10.5px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ fontWeight: 700, textTransform: 'uppercase' }}>
              {codeLang || 'código'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(rawCode);
                }
              }}
              style={{
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
                padding: '1px 6px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
              title="Copiar bloco de código"
            >
              Copiar
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              padding: '10px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              lineHeight: 1.5,
              overflowX: 'auto',
              color: 'var(--text-primary)',
            }}
          >
            {codeLines.map((cLine, cIdx) => (
              <div key={cIdx}>{renderHighlightedLine(cLine, codeLang)}</div>
            ))}
          </pre>
        </div>
      );
      continue;
    }

    // 3. Tabelas GFM (| Col 1 | Col 2 | seguido de | --- | --- |)
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isMarkdownTableSeparator(lines[i + 1])
    ) {
      const tableStart = i;
      const headers = splitMarkdownTableRow(lines[i]);
      const alignCells = splitMarkdownTableRow(lines[i + 1]);
      const aligns: Array<'left' | 'center' | 'right'> = alignCells.map((c) => {
        if (c.startsWith(':') && c.endsWith(':')) return 'center';
        if (c.endsWith(':')) return 'right';
        return 'left';
      });
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        bodyRows.push(splitMarkdownTableRow(lines[i]));
        i++;
      }

      elements.push(
        <div
          key={`tbl-${tableStart}`}
          style={{
            margin: '10px 0',
            overflowX: 'auto',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12.5px',
              lineHeight: 1.5,
            }}
          >
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    style={{
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border-strong)',
                      borderRight:
                        hIdx < headers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      textAlign: aligns[hIdx] || 'left',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {renderInlineMarkdown(
                      h,
                      `tbl-${tableStart}-h-${hIdx}`,
                      baseDir,
                      onOpenLink
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  style={{
                    backgroundColor: rIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent',
                  }}
                >
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      style={{
                        padding: '5px 10px',
                        borderBottom:
                          rIdx < bodyRows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                        borderRight:
                          cIdx < headers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                        textAlign: aligns[cIdx] || 'left',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {renderInlineMarkdown(
                        row[cIdx] ?? '',
                        `tbl-${tableStart}-r-${rIdx}-c-${cIdx}`,
                        baseDir,
                        onOpenLink
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 4. Blockquotes & Alertas GFM (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION])
    if (trimmed.startsWith('>')) {
      const bqStart = i;
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        bqLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const firstLine = (bqLines[0] || '').trim();
      const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
      if (alertMatch) {
        const kind = alertMatch[1].toUpperCase();
        const inlineRest = alertMatch[2];
        const bodyLines = inlineRest ? [inlineRest, ...bqLines.slice(1)] : bqLines.slice(1);
        const palette: Record<string, { border: string; bg: string; label: string }> = {
          NOTE: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', label: 'Nota' },
          TIP: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', label: 'Dica' },
          IMPORTANT: { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', label: 'Importante' },
          WARNING: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', label: 'Atenção' },
          CAUTION: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Cuidado' },
        };
        const styleInfo = palette[kind] || palette.NOTE;
        elements.push(
          <div
            key={`alert-${bqStart}`}
            style={{
              borderLeft: `4px solid ${styleInfo.border}`,
              backgroundColor: styleInfo.bg,
              padding: '8px 12px',
              borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
              margin: '8px 0',
              fontSize: '12.5px',
              lineHeight: 1.55,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: styleInfo.border,
                marginBottom: bodyLines.length > 0 ? '4px' : 0,
                fontSize: '11.5px',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              {styleInfo.label}
            </div>
            {bodyLines.map((bLine, bIdx) => (
              <div key={bIdx} style={{ color: 'var(--text-primary)' }}>
                {renderInlineMarkdown(
                  bLine,
                  `alert-${bqStart}-${bIdx}`,
                  baseDir,
                  onOpenLink
                )}
              </div>
            ))}
          </div>
        );
      } else {
        elements.push(
          <blockquote
            key={`bq-${bqStart}`}
            style={{
              borderLeft: '3px solid var(--accent-primary)',
              backgroundColor: 'var(--bg-subtle)',
              padding: '6px 12px',
              borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
              color: 'var(--text-secondary)',
              margin: '8px 0',
              lineHeight: 1.55,
            }}
          >
            {bqLines.map((bLine, bIdx) => (
              <div key={bIdx}>
                {renderInlineMarkdown(bLine, `bq-${bqStart}-${bIdx}`, baseDir, onOpenLink)}
              </div>
            ))}
          </blockquote>
        );
      }
      continue;
    }

    // 5. Linhas divisórias horizontais (---, ***, ___)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      elements.push(
        <hr
          key={`hr-${i}`}
          style={{
            border: 'none',
            borderTop: '1px solid var(--border-subtle)',
            margin: '12px 0',
          }}
        />
      );
      i++;
      continue;
    }

    // 6. Títulos (# H1 até ###### H6)
    const headingMatch = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].replace(/\s+#+\s*$/, '');
      const sizes = ['21px', '17.5px', '15px', '13.5px', '12.5px', '12px'];
      const margins = [
        '16px 0 8px',
        '14px 0 6px',
        '12px 0 5px',
        '10px 0 4px',
        '8px 0 3px',
        '6px 0 2px',
      ];
      elements.push(
        <div
          key={`h-${i}`}
          role="heading"
          aria-level={level}
          style={{
            fontSize: sizes[level - 1] || '13px',
            fontWeight: 700,
            margin: margins[level - 1] || '8px 0 4px',
            color: 'var(--text-primary)',
            borderBottom: level <= 2 ? '1px solid var(--border-subtle)' : 'none',
            paddingBottom: level <= 2 ? '4px' : 0,
            lineHeight: 1.35,
          }}
        >
          {renderInlineMarkdown(content, `h-${i}`, baseDir, onOpenLink)}
        </div>
      );
      i++;
      continue;
    }

    // 7. Listas de tarefas (- [x] / - [ ]) e listas com marcadores (- / * / +) com recuo multinível
    const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (unorderedMatch) {
      const indentSpaces = unorderedMatch[1].replace(/\t/g, '  ').length;
      const depth = Math.min(5, Math.floor(indentSpaces / 2));
      const itemText = unorderedMatch[3];
      const taskMatch = itemText.match(/^\[([ xX])\]\s+(.*)$/);

      if (taskMatch) {
        const checked = taskMatch[1].toLowerCase() === 'x';
        const taskLabel = taskMatch[2];
        elements.push(
          <div
            key={`task-${i}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              marginLeft: `${8 + depth * 18}px`,
              marginBottom: '4px',
              lineHeight: 1.55,
              fontSize: '13px',
            }}
          >
            <span
              style={{
                width: '15px',
                height: '15px',
                marginTop: '3px',
                borderRadius: '4px',
                border: checked
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--border-strong)',
                backgroundColor: checked ? 'var(--accent-primary)' : 'var(--bg-app)',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {checked ? '✓' : ''}
            </span>
            <span
              style={{
                flex: 1,
                color: checked ? 'var(--text-muted)' : 'var(--text-primary)',
                textDecoration: checked ? 'line-through' : 'none',
              }}
            >
              {renderInlineMarkdown(taskLabel, `task-${i}`, baseDir, onOpenLink)}
            </span>
          </div>
        );
      } else {
        const bullets = ['•', '◦', '▪', '▫'];
        const bulletChar = bullets[depth % bullets.length];
        elements.push(
          <div
            key={`ul-${i}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '7px',
              marginLeft: `${8 + depth * 18}px`,
              marginBottom: '4px',
              lineHeight: 1.55,
              fontSize: '13px',
              color: 'var(--text-primary)',
            }}
          >
            <span
              style={{
                color: 'var(--accent)',
                fontWeight: 700,
                flexShrink: 0,
                userSelect: 'none',
              }}
            >
              {bulletChar}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {renderInlineMarkdown(itemText, `ul-${i}`, baseDir, onOpenLink)}
            </span>
          </div>
        );
      }
      i++;
      continue;
    }

    // 8. Listas numeradas (1. / 2. / 1)) com recuo multinível
    const orderedMatch = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (orderedMatch) {
      const indentSpaces = orderedMatch[1].replace(/\t/g, '  ').length;
      const depth = Math.min(5, Math.floor(indentSpaces / 2));
      const numLabel = orderedMatch[2];
      const itemText = orderedMatch[3];
      elements.push(
        <div
          key={`ol-${i}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '7px',
            marginLeft: `${8 + depth * 18}px`,
            marginBottom: '4px',
            lineHeight: 1.55,
            fontSize: '13px',
            color: 'var(--text-primary)',
          }}
        >
          <span
            style={{
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              minWidth: '18px',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {numLabel}.
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {renderInlineMarkdown(itemText, `ol-${i}`, baseDir, onOpenLink)}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // 9. Linha em branco
    if (trimmed.length === 0) {
      elements.push(<div key={`sp-${i}`} style={{ height: '6px' }} />);
      i++;
      continue;
    }

    // 10. Parágrafo padrão com formatação inline completa
    elements.push(
      <p
        key={`p-${i}`}
        style={{
          margin: '0 0 6px 0',
          lineHeight: 1.6,
          fontSize: '13px',
          color: 'var(--text-primary)',
        }}
      >
        {renderInlineMarkdown(line, `p-${i}`, baseDir, onOpenLink)}
      </p>
    );
    i++;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-primary)',
        wordBreak: 'break-word',
      }}
    >
      {elements}
    </div>
  );
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
    openFolderInEditor,
    openNewUntitledTab,
    detachToSeparateWindow,
    closeTab,
    closeOtherTabs,
    syncTabAfterPathChange,
    closeTabsForDeletedPath,
    togglePinTab,
    setActiveTab,
    updateTabContent,
    revertTabContent,
    updateCursor,
    setTabLanguage,
    setTabSvgViewMode,
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
    setStatusMessage,
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
  const [siblingWebFiles, setSiblingWebFiles] = useState<Record<string, string>>({});
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [selectedProjectEntryPath, setSelectedProjectEntryPath] = useState<string>('');
  const [projectCtxMenu, setProjectCtxMenu] = useState<{
    x: number;
    y: number;
    entry: Entry | null;
  } | null>(null);
  const [studioFileClipboard, setStudioFileClipboard] = useState<{
    path: string;
    name: string;
    mode: 'copy' | 'cut';
  } | null>(null);
  const [projectModal, setProjectModal] = useState<{
    kind: 'newFile' | 'newFolder' | 'rename' | 'move' | 'delete';
    targetDir: string;
    entry: Entry | null;
    inputValue: string;
    error: string | null;
    busy: boolean;
  } | null>(null);
  const [draggedProjectEntry, setDraggedProjectEntry] = useState<Entry | null>(null);
  const [dropTargetFolderPath, setDropTargetFolderPath] = useState<string | null>(null);

  const [regexTestPattern, setRegexTestPattern] = useState('');
  const [studioMinHovered, setStudioMinHovered] = useState(false);
  const [studioMaxHovered, setStudioMaxHovered] = useState(false);
  const [studioCloseHovered, setStudioCloseHovered] = useState(false);
  const [csvFilterQuery, setCsvFilterQuery] = useState('');
  const [csvSortCol, setCsvSortCol] = useState<number | null>(null);
  const [csvSortAsc, setCsvSortAsc] = useState(true);
  const [jsonFilterQuery, setJsonFilterQuery] = useState('');
  const [liveWebPreviewUrl, setLiveWebPreviewUrl] = useState<string>('');
  const [liveWebPreviewRev, setLiveWebPreviewRev] = useState<number>(0);

  // Árvore multinível do projeto + Git Status
  const [expandedProjectDirs, setExpandedProjectDirs] = useState<Record<string, boolean>>({});
  const expandedProjectDirsRef = useRef<Record<string, boolean>>({});
  expandedProjectDirsRef.current = expandedProjectDirs;
  const [subDirEntriesMap, setSubDirEntriesMap] = useState<Record<string, Entry[]>>({});
  const [gitStatus, setGitStatus] = useState<StudioGitStatus>({
    isRepo: false,
    branch: '',
    files: {},
  });

  // Busca & Substituição Global no Projeto (Ctrl+Shift+F)
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [projectReplaceQuery, setProjectReplaceQuery] = useState('');
  const [projectSearchRegex, setProjectSearchRegex] = useState(false);
  const [projectSearchCase, setProjectSearchCase] = useState(false);
  const [projectSearchMatches, setProjectSearchMatches] = useState<StudioProjectSearchMatch[]>([]);
  const [projectSearchLoading, setProjectSearchLoading] = useState(false);
  const [projectReplaceBusy, setProjectReplaceBusy] = useState(false);

  // Viewport Responsiva & Console ao Vivo da Prévia Web (HTML)
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewConsoleOpen, setPreviewConsoleOpen] = useState(false);
  const [previewConsoleLogs, setPreviewConsoleLogs] = useState<
    Array<{ level: 'log' | 'info' | 'warn' | 'error'; message: string; ts: number }>
  >([]);

  const activeTab: EditorTab | null =
    tabs.find((t) => t.id === activeTabId) || tabs[0] || null;
  const isActiveMediaPreview = isTabMediaPreviewActive(activeTab);
  const isActiveSvg = Boolean(activeTab?.name.toLowerCase().endsWith('.svg'));

  const activeTabParentDir = useMemo(() => {
    if (activeTab?.path) {
      return activeTab.path.replace(/[/\\][^/\\]+$/, '');
    }
    return '';
  }, [activeTab?.path]);

  const effectiveWorkspace = workspaceDir || activeTabParentDir || currentPath || '/';

  const activeProjectDir = useMemo(() => {
    if (workspaceDir && activeTabParentDir) {
      const normWs = normalizeStudioFilePath(workspaceDir);
      const normParent = normalizeStudioFilePath(activeTabParentDir);
      if (normParent === normWs || normParent.startsWith(`${normWs}/`)) {
        return workspaceDir;
      }
    }
    if (activeTabParentDir) return activeTabParentDir;
    return effectiveWorkspace;
  }, [workspaceDir, activeTabParentDir, effectiveWorkspace]);

  const webPreviewEntry = useMemo<{
    entryRelPath: string;
    untitledHtml: string;
  } | null>(() => {
    if (!activeTab) return null;
    const toProjectRelative = (fullPath: string): string => {
      const normFull = fullPath.replace(/\\/g, '/');
      const normBase = activeProjectDir.replace(/\\/g, '/').replace(/\/+$/, '');
      if (normBase && normFull.toLowerCase().startsWith(`${normBase.toLowerCase()}/`)) {
        return normFull.slice(normBase.length + 1);
      }
      return normFull.split('/').pop() || 'index.html';
    };

    if (activeTab.language === 'html') {
      if (activeTab.path) {
        return { entryRelPath: toProjectRelative(activeTab.path), untitledHtml: '' };
      }
      return {
        entryRelPath: '',
        untitledHtml: activeTab.content || '<!DOCTYPE html><html><body></body></html>',
      };
    }

    if (activeTab.language === 'css' || activeTab.language === 'javascript') {
      const normProj = normalizeStudioFilePath(activeProjectDir);
      const openHtmlTab = tabs.find(
        (t) =>
          t.language === 'html' &&
          (!t.path ||
            normalizeStudioFilePath(t.path).startsWith(`${normProj}/`) ||
            normalizeStudioFilePath(t.path) === normProj)
      );
      if (openHtmlTab) {
        if (openHtmlTab.path) {
          return { entryRelPath: toProjectRelative(openHtmlTab.path), untitledHtml: '' };
        }
        return { entryRelPath: '', untitledHtml: openHtmlTab.content };
      }
      const hasIndexHtml =
        siblingWebFiles['index.html'] !== undefined ||
        workspaceEntries.some((e) => e.kind !== 'dir' && e.name.toLowerCase() === 'index.html');
      if (hasIndexHtml) {
        return { entryRelPath: 'index.html', untitledHtml: '' };
      }
      const hasIndexHtm =
        siblingWebFiles['index.htm'] !== undefined ||
        workspaceEntries.some((e) => e.kind !== 'dir' && e.name.toLowerCase() === 'index.htm');
      if (hasIndexHtm) {
        return { entryRelPath: 'index.htm', untitledHtml: '' };
      }
    }
    return null;
  }, [activeTab, activeProjectDir, tabs, siblingWebFiles, workspaceEntries]);

  // Sincroniza buffers em edição com o servidor HTTP local de loopback para prévia real (com CSS, JS, subpastas, imagens e localStorage)
  useEffect(() => {
    if ((!isOpen && !isDedicatedWindow) || !showSplitPreview || !webPreviewEntry) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const liveMap: Record<string, string> = {};
        tabs.forEach((t) => {
          if (t.path && !isBinaryMediaTab(t)) {
            liveMap[t.path] = t.content;
          }
        });
        try {
          await syncStudioLiveFiles(liveMap);
          const resolvedUrl = await resolveStudioProjectURL(
            activeProjectDir,
            webPreviewEntry.entryRelPath,
            webPreviewEntry.untitledHtml
          );
          if (!cancelled && resolvedUrl) {
            setLiveWebPreviewUrl(resolvedUrl);
            setLiveWebPreviewRev((r) => r + 1);
          }
        } catch {
          // Mantém fallback srcDoc em modo navegador puro fora do Wails
        }
      })();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, isDedicatedWindow, showSplitPreview, activeProjectDir, webPreviewEntry, tabs]);

  // Documento HTML conectado para fallback quando fora do runtime nativo Wails
  const connectedWebPreview = useMemo(() => {
    if (!activeTab) return null;
    if (activeTab.language === 'html') {
      return {
        isWebProject: true,
        doc: buildConnectedWebPreviewDoc(
          activeTab.content,
          activeProjectDir,
          siblingWebFiles,
          tabs
        ),
      };
    }
    if (activeTab.language === 'css' || activeTab.language === 'javascript') {
      if (webPreviewEntry) {
        const openHtmlTab = tabs.find(
          (t) =>
            t.language === 'html' &&
            (!t.path ||
              normalizeStudioFilePath(t.path).startsWith(
                `${normalizeStudioFilePath(activeProjectDir)}/`
              ))
        );
        const htmlSource =
          openHtmlTab?.content ||
          siblingWebFiles['index.html'] ||
          siblingWebFiles['index.htm'] ||
          '';
        return {
          isWebProject: true,
          doc: htmlSource
            ? buildConnectedWebPreviewDoc(htmlSource, activeProjectDir, siblingWebFiles, tabs)
            : '',
        };
      }
    }
    return null;
  }, [activeTab, activeProjectDir, siblingWebFiles, tabs, webPreviewEntry]);

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
          try {
            const st = await studioGetGitStatus(effectiveWorkspace);
            setGitStatus(st);
          } catch {
            // ignora
          }
        })();
        return;
      }

      // Ctrl+Shift+F: Busca Global no Projeto
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSidebarTab('search');
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
    setSidebarTab,
    openNewUntitledTab,
  ]);

  const showFlashStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => {
      if (useEditorStore.getState().statusMessage === msg) {
        setStatusMessage(null);
      }
    }, 3200);
  };

  const reloadWorkspaceEntries = React.useCallback(
    async (customDir?: string) => {
      const targetDir = customDir || effectiveWorkspace;
      if (!targetDir) return;
      try {
        const items = await listDirectorySnapshot(targetDir, false);
        const sorted = [...items].sort((a, b) => {
          if (a.kind === 'dir' && b.kind !== 'dir') return -1;
          if (a.kind !== 'dir' && b.kind === 'dir') return 1;
          return a.name.localeCompare(b.name);
        });
        setWorkspaceEntries(sorted);

        // Auto-saneamento: se alguma aba aberta tiver como caminho exatamente uma pasta, remove a aba fantasma e abre a pasta corretamente
        const dirPathMap = new Map<string, string>();
        dirPathMap.set(
          targetDir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(),
          targetDir
        );
        sorted.forEach((it) => {
          if (it.kind === 'dir') {
            dirPathMap.set(
              it.location.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(),
              it.location.path
            );
          }
        });
        const currentTabs = useEditorStore.getState().tabs;
        let folderToRecover = '';
        currentTabs.forEach((t) => {
          if (!t.path) return;
          const normT = t.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
          const matchedFolder = dirPathMap.get(normT);
          if (matchedFolder) {
            closeTab(t.id);
            folderToRecover = matchedFolder;
          }
        });
        if (folderToRecover && folderToRecover !== targetDir) {
          void openFolderInEditor(folderToRecover, true);
          return;
        }

        const webDir = activeProjectDir || targetDir;
        const webItems =
          webDir === targetDir ? sorted : await listDirectorySnapshot(webDir, false);
        const rootWebTargets = webItems
          .filter(
            (it) =>
              it.kind !== 'dir' &&
              /\.(html?|css|m?js)$/i.test(it.name) &&
              (it.size === undefined || it.size <= 2 * 1024 * 1024)
          )
          .map((it) => ({ relKey: it.name, fullPath: it.location.path }));

        const commonAssetDirs = webItems.filter(
          (it) => it.kind === 'dir' && /^(css|styles|js|scripts)$/i.test(it.name)
        );
        const subDirTargetsNested = await Promise.all(
          commonAssetDirs.map(async (dirEntry) => {
            try {
              const subItems = await listDirectorySnapshot(dirEntry.location.path, false);
              return subItems
                .filter(
                  (sub) =>
                    sub.kind !== 'dir' &&
                    /\.(css|m?js)$/i.test(sub.name) &&
                    (sub.size === undefined || sub.size <= 2 * 1024 * 1024)
                )
                .map((sub) => ({
                  relKey: `${dirEntry.name}/${sub.name}`,
                  fullPath: sub.location.path,
                }));
            } catch {
              return [];
            }
          })
        );
        const allWebTargets = [...rootWebTargets, ...subDirTargetsNested.flat()];

        if (allWebTargets.length > 0) {
          const pairs = await Promise.all(
            allWebTargets.map(async (wf) => {
              try {
                const res = await readTextFile(wf.fullPath);
                return [wf.relKey, res.content] as const;
              } catch {
                return null;
              }
            })
          );
          const nextMap: Record<string, string> = {};
          pairs.forEach((p) => {
            if (p) nextMap[p[0]] = p[1];
          });
          setSiblingWebFiles(nextMap);
        } else {
          setSiblingWebFiles({});
        }

        // Atualiza status Git do projeto e subpastas expandidas
        try {
          const st = await studioGetGitStatus(targetDir);
          setGitStatus(st);
        } catch {
          setGitStatus({ isRepo: false, branch: '', files: {} });
        }

        const curExpanded = expandedProjectDirsRef.current;
        const expandedKeys = Object.keys(curExpanded).filter(
          (k) => curExpanded[k]
        );
        if (expandedKeys.length > 0) {
          const refreshedSubs = await Promise.all(
            expandedKeys.map(async (dirKey) => {
              try {
                const subItems = await listDirectorySnapshot(dirKey, false);
                const sortedSub = [...subItems].sort((a, b) => {
                  if (a.kind === 'dir' && b.kind !== 'dir') return -1;
                  if (a.kind !== 'dir' && b.kind === 'dir') return 1;
                  return a.name.localeCompare(b.name);
                });
                return [dirKey, sortedSub] as const;
              } catch {
                return null;
              }
            })
          );
          setSubDirEntriesMap((prev) => {
            const next = { ...prev };
            refreshedSubs.forEach((pair) => {
              if (pair) next[pair[0]] = pair[1];
            });
            return next;
          });
        }
      } catch {
        // ignora pasta inacessível
      }
    },
    [effectiveWorkspace, activeProjectDir, closeTab, openFolderInEditor]
  );

  const toggleProjectDirExpand = async (dirPath: string) => {
    const isCurrentlyExpanded = Boolean(expandedProjectDirs[dirPath]);
    if (isCurrentlyExpanded) {
      setExpandedProjectDirs((prev) => ({ ...prev, [dirPath]: false }));
      return;
    }
    setExpandedProjectDirs((prev) => ({ ...prev, [dirPath]: true }));
    try {
      const subItems = await listDirectorySnapshot(dirPath, false);
      const sortedSub = [...subItems].sort((a, b) => {
        if (a.kind === 'dir' && b.kind !== 'dir') return -1;
        if (a.kind !== 'dir' && b.kind === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });
      setSubDirEntriesMap((prev) => ({ ...prev, [dirPath]: sortedSub }));
    } catch {
      // ignora subpasta inacessível
    }
  };

  const getGitBadgeForEntry = (entryPath: string, isDir: boolean): string | null => {
    if (!gitStatus.isRepo || !gitStatus.files) return null;
    const normWs = effectiveWorkspace.replace(/\\/g, '/').replace(/\/+$/, '');
    const normEntry = entryPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normWs || !normEntry.toLowerCase().startsWith(`${normWs.toLowerCase()}/`)) {
      return null;
    }
    const relPath = normEntry.slice(normWs.length + 1);
    const relLower = relPath.toLowerCase();
    if (!isDir) {
      if (gitStatus.files[relPath]) return gitStatus.files[relPath];
      for (const [k, v] of Object.entries(gitStatus.files)) {
        if (k.toLowerCase() === relLower) return v;
      }
      return null;
    }
    const dirPrefix = `${relLower}/`;
    for (const k of Object.keys(gitStatus.files)) {
      if (k.toLowerCase().startsWith(dirPrefix)) {
        return 'M';
      }
    }
    return null;
  };

  const findProjectEntryByPath = (targetPath: string): Entry | undefined => {
    const inRoot = workspaceEntries.find((it) => it.location.path === targetPath);
    if (inRoot) return inRoot;
    for (const subList of Object.values(subDirEntriesMap)) {
      const found = subList.find((it) => it.location.path === targetPath);
      if (found) return found;
    }
    return undefined;
  };

  const handleRunProjectSearch = async () => {
    const q = projectSearchQuery.trim();
    if (!q || !effectiveWorkspace) {
      setProjectSearchMatches([]);
      return;
    }
    setProjectSearchLoading(true);
    try {
      const res = await studioSearchInProject(
        effectiveWorkspace,
        q,
        projectSearchRegex,
        projectSearchCase
      );
      setProjectSearchMatches(res || []);
    } catch (err) {
      showFlashStatus(
        `Erro na busca: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setProjectSearchLoading(false);
    }
  };

  const handleRunProjectReplaceAll = async () => {
    const q = projectSearchQuery.trim();
    if (!q || !effectiveWorkspace || projectReplaceBusy) return;
    setProjectReplaceBusy(true);
    try {
      const count = await studioReplaceInProject(
        effectiveWorkspace,
        q,
        projectReplaceQuery,
        projectSearchRegex,
        projectSearchCase,
        []
      );
      // Recarrega abas abertas que possam ter sido modificadas em disco
      const currentTabs = useEditorStore.getState().tabs;
      const updatedTabs = await Promise.all(
        currentTabs.map(async (t) => {
          if (!t.path || isBinaryMediaTab(t)) return t;
          try {
            const fresh = await readTextFile(t.path);
            return {
              ...t,
              content: fresh.content,
              savedContent: fresh.content,
            };
          } catch {
            return t;
          }
        })
      );
      useEditorStore.setState({ tabs: updatedTabs });
      await handleRunProjectSearch();
      await reloadWorkspaceEntries(effectiveWorkspace);
      showFlashStatus(
        count > 0
          ? `Substituição concluída em ${count} arquivo(s)`
          : 'Nenhum arquivo precisou ser alterado'
      );
    } catch (err) {
      showFlashStatus(
        `Erro ao substituir: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setProjectReplaceBusy(false);
    }
  };

  // Escuta mensagens postMessage do iframe da Prévia em Tempo Real (PULSARES_PREVIEW_CONSOLE)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as {
        type?: string;
        level?: 'log' | 'info' | 'warn' | 'error';
        message?: string;
        ts?: number;
      } | null;
      if (!data || data.type !== 'PULSARES_PREVIEW_CONSOLE') return;
      const lvl =
        data.level === 'warn' || data.level === 'error' || data.level === 'info'
          ? data.level
          : 'log';
      const msg = typeof data.message === 'string' ? data.message : String(data.message ?? '');
      const ts = typeof data.ts === 'number' ? data.ts : Date.now();
      setPreviewConsoleLogs((prev) => [...prev.slice(-149), { level: lvl, message: msg, ts }]);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Carrega arquivos da pasta do projeto e ativos web irmãos (.html, .css, .js) para conectar na Prévia
  useEffect(() => {
    if ((!isOpen && !isDedicatedWindow) || !effectiveWorkspace) return;
    void reloadWorkspaceEntries(effectiveWorkspace);
  }, [isOpen, isDedicatedWindow, effectiveWorkspace, activeProjectDir, reloadWorkspaceEntries]);

  // Fecha o menu de contexto de Arquivos do Projeto ao clicar fora ou pressionar Escape
  useEffect(() => {
    if (!projectCtxMenu) return;
    const onDown = () => setProjectCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectCtxMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [projectCtxMenu]);

  const joinProjectPath = (baseDir: string, childName: string): string => {
    const cleanBase = baseDir.replace(/[\\/]+$/, '');
    const sep = cleanBase.includes('\\') ? '\\' : '/';
    return `${cleanBase}${sep}${childName.replace(/^[/\\]+/, '')}`;
  };

  const handleMoveProjectEntryDirect = async (srcEntry: Entry, destDir: string) => {
    const cleanSrc = srcEntry.location.path.replace(/[\\/]+$/, '');
    const cleanDest = destDir.replace(/[\\/]+$/, '');
    if (!cleanSrc || !cleanDest) return;
    const srcParent = cleanSrc.replace(/[/\\][^/\\]+$/, '');
    if (srcParent.toLowerCase() === cleanDest.toLowerCase()) {
      showFlashStatus('O item já está nesta pasta.');
      return;
    }
    if (
      srcEntry.kind === 'dir' &&
      (cleanDest.toLowerCase() === cleanSrc.toLowerCase() ||
        cleanDest.toLowerCase().startsWith(`${cleanSrc.toLowerCase()}\\`) ||
        cleanDest.toLowerCase().startsWith(`${cleanSrc.toLowerCase()}/`))
    ) {
      showFlashStatus('Não é possível mover uma pasta para dentro dela mesma.');
      return;
    }
    try {
      await runOperationAndWait('move', [cleanSrc], cleanDest, 'rename');
      const expectedNewPath = joinProjectPath(cleanDest, srcEntry.name);
      syncTabAfterPathChange(cleanSrc, expectedNewPath);
      await reloadWorkspaceEntries();
      if (!isDedicatedWindow) void refresh();
      showFlashStatus(`Movido: ${srcEntry.name} → ${cleanDest.split(/[/\\]/).pop() || cleanDest}`);
    } catch (err) {
      showFlashStatus(
        `Não foi possível mover: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleDuplicateProjectFile = async (entry: Entry) => {
    if (entry.kind === 'dir') return;
    try {
      const parentDir =
        entry.location.path.replace(/[/\\][^/\\]+$/, '') || effectiveWorkspace;
      const dotIdx = entry.name.lastIndexOf('.');
      const stem = dotIdx > 0 ? entry.name.slice(0, dotIdx) : entry.name;
      const ext = dotIdx > 0 ? entry.name.slice(dotIdx) : '';
      let candidateName = `${stem}-copia${ext}`;
      const existingNames = new Set(workspaceEntries.map((e) => e.name.toLowerCase()));
      let seq = 2;
      while (existingNames.has(candidateName.toLowerCase())) {
        candidateName = `${stem}-copia-${seq}${ext}`;
        seq++;
      }
      if (
        isStudioPdfFile(entry.name) ||
        isStudioAudioVideoFile(entry.name) ||
        (isStudioImageFile(entry.name) && !entry.name.toLowerCase().endsWith('.svg'))
      ) {
        await runOperationAndWait('copy', [entry.location.path], parentDir, 'rename');
        await reloadWorkspaceEntries();
        if (!isDedicatedWindow) void refresh();
        showFlashStatus(`Arquivo duplicado na pasta do projeto`);
        return;
      }
      const sourcePayload = await readTextFile(entry.location.path);
      const createdPath = await createFile(parentDir, candidateName);
      if (sourcePayload.content) {
        await writeTextFile(createdPath, sourcePayload.content);
      }
      await reloadWorkspaceEntries();
      if (!isDedicatedWindow) void refresh();
      await openFileInEditor(createdPath, true);
      showFlashStatus(`Arquivo duplicado: ${candidateName}`);
    } catch (err) {
      showFlashStatus(
        `Não foi possível duplicar: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handlePasteProjectEntry = async (targetDir: string) => {
    if (!studioFileClipboard || !targetDir) return;
    const { path: srcPath, name: srcName, mode } = studioFileClipboard;
    try {
      const kind = mode === 'cut' ? 'move' : 'copy';
      await runOperationAndWait(kind, [srcPath], targetDir, 'rename');
      if (mode === 'cut') {
        const expectedNewPath = joinProjectPath(targetDir, srcName);
        syncTabAfterPathChange(srcPath, expectedNewPath);
        setStudioFileClipboard(null);
      }
      await reloadWorkspaceEntries();
      if (!isDedicatedWindow) void refresh();
      showFlashStatus(
        mode === 'cut' ? `Movido: ${srcName}` : `Copiado: ${srcName}`
      );
    } catch (err) {
      showFlashStatus(
        `Não foi possível colar: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleTrashProjectEntry = async (entry: Entry) => {
    try {
      await runOperationAndWait('trash', [entry.location.path], '', 'overwrite');
      closeTabsForDeletedPath(entry.location.path);
      if (selectedProjectEntryPath === entry.location.path) {
        setSelectedProjectEntryPath('');
      }
      await reloadWorkspaceEntries();
      if (!isDedicatedWindow) void refresh();
      showFlashStatus(`Movido para a Lixeira: ${entry.name}`);
    } catch (err) {
      showFlashStatus(
        `Não foi possível excluir: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleSubmitProjectModal = async (deletePermanently = true) => {
    if (!projectModal || projectModal.busy) return;
    const { kind, targetDir, entry, inputValue } = projectModal;
    const trimmed = inputValue.trim();

    if (kind !== 'delete' && !trimmed) {
      setProjectModal({ ...projectModal, error: 'Informe um nome válido.' });
      return;
    }

    setProjectModal({ ...projectModal, busy: true, error: null });
    try {
      if (kind === 'newFile') {
        const createdPath = await createFile(targetDir, trimmed);
        setProjectModal(null);
        await reloadWorkspaceEntries();
        if (!isDedicatedWindow) void refresh();
        await openFileInEditor(createdPath, true);
        showFlashStatus(`Arquivo criado: ${trimmed}`);
      } else if (kind === 'newFolder') {
        await createFolder(targetDir, trimmed);
        setProjectModal(null);
        await reloadWorkspaceEntries();
        if (!isDedicatedWindow) void refresh();
        showFlashStatus(`Pasta criada: ${trimmed}`);
      } else if (kind === 'rename' && entry) {
        if (trimmed === entry.name) {
          setProjectModal(null);
          return;
        }
        const renamedPath = await renameItem(entry.location.path, trimmed);
        const finalNewPath =
          renamedPath && (renamedPath.includes('/') || renamedPath.includes('\\'))
            ? renamedPath
            : joinProjectPath(
                entry.location.path.replace(/[/\\][^/\\]+$/, ''),
                trimmed
              );
        syncTabAfterPathChange(entry.location.path, finalNewPath);
        setProjectModal(null);
        await reloadWorkspaceEntries();
        if (!isDedicatedWindow) void refresh();
        showFlashStatus(`Renomeado para: ${trimmed}`);
      } else if (kind === 'move' && entry) {
        setProjectModal(null);
        await handleMoveProjectEntryDirect(entry, trimmed);
      } else if (kind === 'delete' && entry) {
        await runOperationAndWait(
          deletePermanently ? 'delete' : 'trash',
          [entry.location.path],
          '',
          'overwrite'
        );
        closeTabsForDeletedPath(entry.location.path);
        if (selectedProjectEntryPath === entry.location.path) {
          setSelectedProjectEntryPath('');
        }
        setProjectModal(null);
        await reloadWorkspaceEntries();
        if (!isDedicatedWindow) void refresh();
        showFlashStatus(
          deletePermanently
            ? `Excluído permanentemente: ${entry.name}`
            : `Movido para a Lixeira: ${entry.name}`
        );
      }
    } catch (err) {
      setProjectModal((prev) =>
        prev
          ? {
              ...prev,
              busy: false,
              error: err instanceof Error ? err.message : String(err),
            }
          : null
      );
    }
  };

  // Escuta eventos entre janelas (Explorer <-> Pulsares Studio Window via Wails IPC, BroadcastChannel e localStorage)
  useEffect(() => {
    const unsubWailsIPC = subscribeEvent<StudioOpenFileEvent>('studio:open-file', (ev) => {
      if (!isDedicatedWindow || !ev) return;
      if (ev.targetPath) {
        if (ev.workspaceDir) setWorkspaceDir(ev.workspaceDir);
        void openFileInEditor(ev.targetPath, true);
      } else if (ev.workspaceDir) {
        void openFolderInEditor(ev.workspaceDir, true);
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
          if (payload.targetPath) {
            if (payload.workspaceDir) setWorkspaceDir(payload.workspaceDir);
            void openFileInEditor(payload.targetPath, true);
          } else if (payload.workspaceDir) {
            void openFolderInEditor(payload.workspaceDir, true);
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
          if (data.targetPath) {
            if (data.workspaceDir) setWorkspaceDir(data.workspaceDir);
            void openFileInEditor(data.targetPath, true);
          } else if (data.workspaceDir) {
            void openFolderInEditor(data.workspaceDir, true);
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
  }, [isDedicatedWindow, openFileInEditor, openFolderInEditor, refresh, setWorkspaceDir]);

  const lines = useMemo(() => {
    if (!activeTab) return [''];
    return activeTab.content.replace(/\r\n/g, '\n').split('\n');
  }, [activeTab]);

  const diagnostics = useMemo(() => {
    if (!activeTab || isActiveMediaPreview) return [];
    return computeDiagnostics(activeTab.content, activeTab.language);
  }, [activeTab, isActiveMediaPreview]);

  const codeSymbols = useMemo(() => {
    if (!activeTab || isActiveMediaPreview) return [];
    return extractCodeSymbols(activeTab.content, activeTab.language);
  }, [activeTab, isActiveMediaPreview]);

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
          cursor: 'default',
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
        try {
          const st = await studioGetGitStatus(effectiveWorkspace);
          setGitStatus(st);
        } catch {
          // ignora
        }
      })();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setSidebarTab('search');
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
              openNewUntitledTab(
                effectiveWorkspace,
                activeTab && !isActiveMediaPreview ? activeTab.language : 'typescript',
                true
              )
            }
            title="Novo arquivo (Ctrl+N)"
            style={headerBtnStyle}
          >
            <Plus size={13} />
            <span>Novo</span>
          </button>

          {isActiveSvg && !isActiveMediaPreview && activeTab && (
            <button
              type="button"
              onClick={() => setTabSvgViewMode(activeTab.id, 'preview')}
              title="Alternar para o inspetor gráfico da imagem SVG"
              style={{
                ...headerBtnStyle,
                borderColor: 'var(--accent-primary)',
                backgroundColor: 'var(--accent-subtle)',
                color: 'var(--accent-text)',
                fontWeight: 600,
              }}
            >
              <Eye size={13} />
              <span>Visualizar SVG</span>
            </button>
          )}

          {!isActiveMediaPreview && (
            <button
              type="button"
              onClick={() => {
                if (!activeTab) return;
                void (async () => {
                  const ok = await saveTab(activeTab.id, effectiveWorkspace);
                  if (ok && !isDedicatedWindow) void refresh();
                  try {
                    const st = await studioGetGitStatus(effectiveWorkspace);
                    setGitStatus(st);
                  } catch {
                    // ignora
                  }
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
          )}

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

          {!isActiveMediaPreview && (
            <>
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
            </>
          )}

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
                cursor: 'default',
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
      {findBarOpen && !isActiveMediaPreview && (
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
            onClick={() => setSidebarTab(sidebarTab === 'search' ? null : 'search')}
            title="Busca Global no Projeto (Ctrl+Shift+F)"
            style={{
              ...activityBtnStyle,
              color: sidebarTab === 'search' ? 'var(--accent)' : 'var(--text-muted)',
              borderLeft:
                sidebarTab === 'search' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <Search size={16} />
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() =>
                        setProjectModal({
                          kind: 'newFile',
                          targetDir: effectiveWorkspace,
                          entry: null,
                          inputValue: 'novo-arquivo.js',
                          error: null,
                          busy: false,
                        })
                      }
                      title="Novo arquivo nesta pasta"
                      style={statusLinkBtnStyle}
                    >
                      <FilePlus size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setProjectModal({
                          kind: 'newFolder',
                          targetDir: effectiveWorkspace,
                          entry: null,
                          inputValue: 'nova-pasta',
                          error: null,
                          busy: false,
                        })
                      }
                      title="Nova pasta"
                      style={statusLinkBtnStyle}
                    >
                      <FolderPlus size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void reloadWorkspaceEntries(effectiveWorkspace)}
                      title="Atualizar lista"
                      style={statusLinkBtnStyle}
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
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
                <div
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (!selectedProjectEntryPath) return;
                    const selEntry = findProjectEntryByPath(selectedProjectEntryPath);
                    if (!selEntry) return;
                    if (e.key === 'F2') {
                      e.preventDefault();
                      setProjectModal({
                        kind: 'rename',
                        targetDir:
                          selEntry.location.path.replace(/[/\\][^/\\]+$/, '') ||
                          effectiveWorkspace,
                        entry: selEntry,
                        inputValue: selEntry.name,
                        error: null,
                        busy: false,
                      });
                    } else if (e.key === 'Delete') {
                      e.preventDefault();
                      setProjectModal({
                        kind: 'delete',
                        targetDir:
                          selEntry.location.path.replace(/[/\\][^/\\]+$/, '') ||
                          effectiveWorkspace,
                        entry: selEntry,
                        inputValue: selEntry.name,
                        error: null,
                        busy: false,
                      });
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setProjectCtxMenu({
                      x: e.clientX,
                      y: e.clientY,
                      entry: null,
                    });
                  }}
                  style={{ flex: 1, overflowY: 'auto', padding: '4px', outline: 'none' }}
                >
                  {effectiveWorkspace && effectiveWorkspace !== '/' && (
                    <div
                      onClick={() => {
                        const parent = effectiveWorkspace.replace(/[/\\][^/\\]+$/, '');
                        if (parent && parent !== effectiveWorkspace) {
                          setWorkspaceDir(parent);
                        }
                      }}
                      onDragOver={(e) => {
                        if (!draggedProjectEntry) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTargetFolderPath('..');
                      }}
                      onDragLeave={() => {
                        if (dropTargetFolderPath === '..') setDropTargetFolderPath(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropTargetFolderPath(null);
                        if (!draggedProjectEntry) return;
                        const parent = effectiveWorkspace.replace(/[/\\][^/\\]+$/, '');
                        if (parent && parent !== effectiveWorkspace) {
                          void handleMoveProjectEntryDirect(draggedProjectEntry, parent);
                        }
                        setDraggedProjectEntry(null);
                      }}
                      style={{
                        ...sidebarItemStyle,
                        border:
                          dropTargetFolderPath === '..'
                            ? '1px dashed var(--accent-primary)'
                            : '1px solid transparent',
                        backgroundColor:
                          dropTargetFolderPath === '..'
                            ? 'var(--accent-subtle)'
                            : 'transparent',
                      }}
                      title="Subir pasta (ou arraste um item aqui para mover para a pasta superior)"
                    >
                      <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span>..</span>
                    </div>
                  )}
                  {(() => {
                    const renderTreeEntry = (entry: Entry, depth = 0): React.ReactNode => {
                      const isDir = entry.kind === 'dir';
                      const isExpanded = isDir && Boolean(expandedProjectDirs[entry.location.path]);
                      const isCurrentFile = activeTab?.path === entry.location.path;
                      const isSelectedItem = selectedProjectEntryPath === entry.location.path;
                      const isDropHovered =
                        isDir && dropTargetFolderPath === entry.location.path;
                      const isCutClip =
                        studioFileClipboard?.mode === 'cut' &&
                        studioFileClipboard.path === entry.location.path;
                      const gitBadge = getGitBadgeForEntry(entry.location.path, isDir);
                      const gitColor =
                        gitBadge === 'U' || gitBadge === 'A'
                          ? '#22c55e'
                          : gitBadge === 'D'
                          ? '#ef4444'
                          : '#f59e0b';
                      const childEntries = isDir
                        ? (subDirEntriesMap[entry.location.path] || []).filter((sub) =>
                            !workspaceFilter.trim()
                              ? true
                              : sub.name
                                  .toLowerCase()
                                  .includes(workspaceFilter.trim().toLowerCase()) ||
                                sub.kind === 'dir'
                          )
                        : [];

                      return (
                        <React.Fragment key={entry.location.path}>
                          <div
                            draggable
                            onDragStart={(e) => {
                              setDraggedProjectEntry(entry);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', entry.location.path);
                            }}
                            onDragEnd={() => {
                              setDraggedProjectEntry(null);
                              setDropTargetFolderPath(null);
                            }}
                            onDragOver={(e) => {
                              if (
                                !isDir ||
                                !draggedProjectEntry ||
                                draggedProjectEntry.location.path === entry.location.path
                              ) {
                                return;
                              }
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              setDropTargetFolderPath(entry.location.path);
                            }}
                            onDragLeave={() => {
                              if (dropTargetFolderPath === entry.location.path) {
                                setDropTargetFolderPath(null);
                              }
                            }}
                            onDrop={(e) => {
                              if (!isDir || !draggedProjectEntry) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setDropTargetFolderPath(null);
                              if (draggedProjectEntry.location.path !== entry.location.path) {
                                void handleMoveProjectEntryDirect(
                                  draggedProjectEntry,
                                  entry.location.path
                                );
                              }
                              setDraggedProjectEntry(null);
                            }}
                            onClick={() => {
                              setSelectedProjectEntryPath(entry.location.path);
                              if (isDir) {
                                void toggleProjectDirExpand(entry.location.path);
                              } else {
                                void openFileInEditor(entry.location.path, true);
                              }
                            }}
                            onDoubleClick={() => {
                              if (isDir) {
                                setWorkspaceDir(entry.location.path);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedProjectEntryPath(entry.location.path);
                              setProjectCtxMenu({
                                x: e.clientX,
                                y: e.clientY,
                                entry,
                              });
                            }}
                            style={{
                              ...sidebarItemStyle,
                              paddingLeft: `${8 + depth * 13}px`,
                              backgroundColor: isDropHovered
                                ? 'var(--accent-subtle)'
                                : isCurrentFile || isSelectedItem
                                ? 'var(--bg-selected)'
                                : 'transparent',
                              border: isDropHovered
                                ? '1px dashed var(--accent-primary)'
                                : '1px solid transparent',
                              fontWeight: isCurrentFile ? 600 : 400,
                              opacity: isCutClip ? 0.55 : 1,
                            }}
                            title={
                              isDir
                                ? `${entry.location.path} (Clique p/ expandir • Duplo clique p/ focar pasta • Clique direito p/ opções)`
                                : `${entry.location.path} (Clique direito para opções)`
                            }
                          >
                            {isDir ? (
                              isExpanded ? (
                                <ChevronDown
                                  size={12}
                                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                                />
                              ) : (
                                <ChevronRight
                                  size={12}
                                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                                />
                              )
                            ) : (
                              <span style={{ width: '12px', flexShrink: 0 }} />
                            )}
                            <FileTypeIcon
                              name={entry.name}
                              kind={entry.kind}
                              size={13}
                              showBadge={false}
                            />
                            <span
                              style={{
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: gitBadge ? gitColor : undefined,
                              }}
                            >
                              {entry.name}
                            </span>
                            {gitBadge && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: gitColor,
                                  paddingLeft: '4px',
                                  flexShrink: 0,
                                  fontFamily: 'var(--font-mono)',
                                }}
                                title={`Status Git: ${gitBadge}`}
                              >
                                {gitBadge}
                              </span>
                            )}
                          </div>
                          {isDir &&
                            isExpanded &&
                            childEntries.map((sub) => renderTreeEntry(sub, depth + 1))}
                        </React.Fragment>
                      );
                    };

                    return filteredWorkspaceEntries.map((entry) => renderTreeEntry(entry, 0));
                  })()}
                </div>
              </>
            )}

            {sidebarTab === 'search' && (
              <>
                <div style={sidebarHeaderStyle}>
                  <span>BUSCA NO PROJETO</span>
                  {projectSearchMatches.length > 0 && (
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      {projectSearchMatches.length} ocorr.
                    </span>
                  )}
                </div>
                <div
                  style={{
                    padding: '8px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void handleRunProjectSearch();
                        }
                      }}
                      placeholder="Buscar no projeto..."
                      style={{ ...findInputStyle, flex: 1, width: 'auto' }}
                    />
                    <button
                      type="button"
                      onClick={() => setProjectSearchCase((v) => !v)}
                      title="Diferenciar maiúsculas/minúsculas (Aa)"
                      style={{
                        ...headerBtnStyle,
                        padding: '3px 6px',
                        fontWeight: 700,
                        borderColor: projectSearchCase
                          ? 'var(--accent-primary)'
                          : 'var(--border-subtle)',
                        backgroundColor: projectSearchCase
                          ? 'var(--accent-subtle)'
                          : 'var(--bg-surface)',
                      }}
                    >
                      Aa
                    </button>
                    <button
                      type="button"
                      onClick={() => setProjectSearchRegex((v) => !v)}
                      title="Usar Expressão Regular (.*)"
                      style={{
                        ...headerBtnStyle,
                        padding: '3px 6px',
                        fontWeight: 700,
                        borderColor: projectSearchRegex
                          ? 'var(--accent-primary)'
                          : 'var(--border-subtle)',
                        backgroundColor: projectSearchRegex
                          ? 'var(--accent-subtle)'
                          : 'var(--bg-surface)',
                      }}
                    >
                      .*
                    </button>
                  </div>

                  <input
                    type="text"
                    value={projectReplaceQuery}
                    onChange={(e) => setProjectReplaceQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleRunProjectReplaceAll();
                      }
                    }}
                    placeholder="Substituir em arquivos..."
                    style={{ ...findInputStyle, width: '100%' }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      disabled={projectSearchLoading}
                      onClick={() => void handleRunProjectSearch()}
                      style={{
                        ...headerBtnStyle,
                        flex: 1,
                        justifyContent: 'center',
                        backgroundColor: 'var(--accent-primary)',
                        borderColor: 'var(--accent-primary)',
                        color: '#ffffff',
                        fontWeight: 600,
                      }}
                    >
                      <Search size={12} />
                      <span>{projectSearchLoading ? 'Buscando...' : 'Buscar'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={projectReplaceBusy || !projectSearchQuery.trim()}
                      onClick={() => void handleRunProjectReplaceAll()}
                      title="Substituir todas as ocorrências nos arquivos do projeto"
                      style={{
                        ...headerBtnStyle,
                        flex: 1,
                        justifyContent: 'center',
                        fontWeight: 600,
                      }}
                    >
                      <span>{projectReplaceBusy ? 'Aplicando...' : 'Substituir Tudo'}</span>
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                  {projectSearchLoading ? (
                    <div style={{ padding: '12px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Pesquisando arquivos em {effectiveWorkspace.split(/[/\\]/).pop() || effectiveWorkspace}...
                    </div>
                  ) : projectSearchMatches.length === 0 ? (
                    <div style={{ padding: '12px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {projectSearchQuery.trim()
                        ? 'Nenhuma ocorrência encontrada no projeto.'
                        : 'Digite um termo e pressione Enter para buscar em todos os arquivos do projeto.'}
                    </div>
                  ) : (
                    projectSearchMatches.map((m, idx) => (
                      <div
                        key={`${m.path}:${m.line}:${m.col}:${idx}`}
                        onClick={() => {
                          void (async () => {
                            await openFileInEditor(m.path, true);
                            const targetTab = useEditorStore
                              .getState()
                              .tabs.find(
                                (t) =>
                                  normalizeStudioFilePath(t.path) ===
                                  normalizeStudioFilePath(m.path)
                              );
                            if (targetTab) {
                              updateCursor(targetTab.id, m.line, m.col || 1);
                            }
                            requestAnimationFrame(() => {
                              jumpToLine(m.line);
                            });
                          })();
                        }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          padding: '5px 8px',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'default',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                        title={`${m.relPath}:${m.line}:${m.col}`}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--accent)',
                          }}
                        >
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {m.relPath}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              fontFamily: 'var(--font-mono)',
                              flexShrink: 0,
                            }}
                          >
                            :{m.line}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-mono)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.lineText}
                        </div>
                      </div>
                    ))
                  )}
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
              {isActiveMediaPreview ? (
                <StudioMediaViewer
                  tab={activeTab}
                  onSwitchSvgToCode={
                    isActiveSvg ? () => setTabSvgViewMode(activeTab.id, 'code') : undefined
                  }
                  onNotify={showFlashStatus}
                />
              ) : showDiffView ? (
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
                                cursor: 'default',
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
                        cursor: 'default',
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
                        width:
                          activeTab.language === 'csv' ||
                          activeTab.language === 'json' ||
                          Boolean(connectedWebPreview?.isWebProject)
                            ? '50%'
                            : '44%',
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
                          {connectedWebPreview?.isWebProject && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPreviewViewport('desktop')}
                                style={{
                                  ...headerBtnStyle,
                                  borderColor:
                                    previewViewport === 'desktop'
                                      ? 'var(--accent-primary)'
                                      : 'var(--border-subtle)',
                                  backgroundColor:
                                    previewViewport === 'desktop'
                                      ? 'var(--accent-subtle)'
                                      : 'var(--bg-surface)',
                                }}
                                title="Viewport Desktop (100%)"
                              >
                                <Monitor size={12} />
                                <span>100%</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewViewport('tablet')}
                                style={{
                                  ...headerBtnStyle,
                                  borderColor:
                                    previewViewport === 'tablet'
                                      ? 'var(--accent-primary)'
                                      : 'var(--border-subtle)',
                                  backgroundColor:
                                    previewViewport === 'tablet'
                                      ? 'var(--accent-subtle)'
                                      : 'var(--bg-surface)',
                                }}
                                title="Viewport Tablet (768px)"
                              >
                                <Tablet size={12} />
                                <span>768px</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewViewport('mobile')}
                                style={{
                                  ...headerBtnStyle,
                                  borderColor:
                                    previewViewport === 'mobile'
                                      ? 'var(--accent-primary)'
                                      : 'var(--border-subtle)',
                                  backgroundColor:
                                    previewViewport === 'mobile'
                                      ? 'var(--accent-subtle)'
                                      : 'var(--bg-surface)',
                                }}
                                title="Viewport Mobile (375px)"
                              >
                                <Smartphone size={12} />
                                <span>375px</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewConsoleOpen((v) => !v)}
                                style={{
                                  ...headerBtnStyle,
                                  borderColor: previewConsoleOpen
                                    ? 'var(--accent-primary)'
                                    : 'var(--border-subtle)',
                                  backgroundColor: previewConsoleOpen
                                    ? 'var(--accent-subtle)'
                                    : 'var(--bg-surface)',
                                }}
                                title="Alternar Console da Prévia Web"
                              >
                                <Terminal size={12} />
                                <span>Console ({previewConsoleLogs.length})</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setLiveWebPreviewRev((r) => r + 1)}
                                style={headerBtnStyle}
                                title="Recarregar prévia em tempo real"
                              >
                                <RefreshCw size={12} />
                                <span>Recarregar</span>
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
                      ) : activeTab.language === 'markdown' ||
                        /\.(md|mdx|markdown|mdown|mkd|rmd)$/i.test(activeTab.name) ? (
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                          {renderMarkdownPreview(
                            activeTab.content,
                            activeProjectDir,
                            (targetPath) => void openFileInEditor(targetPath, true)
                          )}
                        </div>
                      ) : connectedWebPreview?.isWebProject ? (
                        <div
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                            gap: '8px',
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              minHeight: '260px',
                              display: 'flex',
                              justifyContent: 'center',
                              backgroundColor:
                                previewViewport === 'desktop'
                                  ? 'transparent'
                                  : 'var(--bg-app)',
                              padding: previewViewport === 'desktop' ? 0 : '8px',
                              borderRadius: 'var(--radius-sm)',
                              overflow: 'auto',
                            }}
                          >
                            {liveWebPreviewUrl ? (
                              <iframe
                                key={`live-web-${liveWebPreviewRev}`}
                                title="HTML Live Preview"
                                src={`${liveWebPreviewUrl}${
                                  liveWebPreviewUrl.includes('?') ? '&' : '?'
                                }v=${liveWebPreviewRev}`}
                                style={{
                                  width:
                                    previewViewport === 'mobile'
                                      ? '375px'
                                      : previewViewport === 'tablet'
                                      ? '768px'
                                      : '100%',
                                  maxWidth: '100%',
                                  height: '100%',
                                  minHeight: '260px',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  backgroundColor: '#ffffff',
                                  boxShadow:
                                    previewViewport === 'desktop'
                                      ? 'none'
                                      : '0 10px 28px rgba(0, 0, 0, 0.35)',
                                }}
                              />
                            ) : (
                              <iframe
                                title="HTML Live Preview"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                                srcDoc={connectedWebPreview.doc}
                                style={{
                                  width:
                                    previewViewport === 'mobile'
                                      ? '375px'
                                      : previewViewport === 'tablet'
                                      ? '768px'
                                      : '100%',
                                  maxWidth: '100%',
                                  height: '100%',
                                  minHeight: '260px',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  backgroundColor: '#ffffff',
                                  boxShadow:
                                    previewViewport === 'desktop'
                                      ? 'none'
                                      : '0 10px 28px rgba(0, 0, 0, 0.35)',
                                }}
                              />
                            )}
                          </div>

                          {previewConsoleOpen && (
                            <div
                              style={{
                                height: '145px',
                                display: 'flex',
                                flexDirection: 'column',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--bg-app)',
                                overflow: 'hidden',
                                flexShrink: 0,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '4px 8px',
                                  backgroundColor: 'var(--bg-subtle)',
                                  borderBottom: '1px solid var(--border-subtle)',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                              >
                                <span>Console da Prévia Web ({previewConsoleLogs.length})</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewConsoleLogs([])}
                                    style={headerBtnStyle}
                                    title="Limpar registros do console"
                                  >
                                    Limpar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewConsoleOpen(false)}
                                    style={windowCtrlBtnStyle}
                                    title="Ocultar console da prévia"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              </div>
                              <div
                                style={{
                                  flex: 1,
                                  overflowY: 'auto',
                                  padding: '6px 8px',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '11px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '3px',
                                }}
                              >
                                {previewConsoleLogs.length === 0 ? (
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    Nenhuma saída de console.log / warn / error capturada ainda.
                                  </span>
                                ) : (
                                  previewConsoleLogs.map((log, lIdx) => {
                                    const badgeColor =
                                      log.level === 'error'
                                        ? '#ef4444'
                                        : log.level === 'warn'
                                        ? '#f59e0b'
                                        : log.level === 'info'
                                        ? '#38bdf8'
                                        : '#94a3b8';
                                    return (
                                      <div
                                        key={`${log.ts}-${lIdx}`}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'flex-start',
                                          gap: '6px',
                                          borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                                          paddingBottom: '2px',
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: '9px',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            color: badgeColor,
                                            flexShrink: 0,
                                            minWidth: '38px',
                                          }}
                                        >
                                          [{log.level}]
                                        </span>
                                        <span
                                          style={{
                                            flex: 1,
                                            color:
                                              log.level === 'error'
                                                ? '#fca5a5'
                                                : log.level === 'warn'
                                                ? '#fde68a'
                                                : 'var(--text-primary)',
                                          }}
                                        >
                                          {log.message}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                          {renderMarkdownPreview(
                            activeTab.content,
                            activeProjectDir,
                            (targetPath) => void openFileInEditor(targetPath, true)
                          )}
                        </div>
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
                    Crie um novo documento ou selecione um arquivo de código, PDF ou imagem no explorador do projeto para abri-lo no Pulsares Studio.
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
                    cursor: 'default',
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
          {gitStatus.isRepo && gitStatus.branch && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '1px 7px',
                borderRadius: '999px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontWeight: 600,
              }}
              title="Branch Git ativa no repositório do projeto"
            >
              <span>🌿 {gitStatus.branch}</span>
              {Object.keys(gitStatus.files || {}).length > 0 && (
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                  • {Object.keys(gitStatus.files).length} mod.
                </span>
              )}
            </span>
          )}
          {activeTab ? (
            isActiveMediaPreview ? (
              <>
                <span>
                  {activeTab.tabKind === 'pdf'
                    ? 'Documento PDF'
                    : activeTab.tabKind === 'media'
                    ? `Mídia ${(activeTab.name.split('.').pop() || 'MEDIA').toUpperCase()}`
                    : `Imagem ${(activeTab.name.split('.').pop() || 'IMG').toUpperCase()}`}
                </span>
                {activeTab.tabKind === 'pdf' && activeTab.pageCount && activeTab.pageCount > 0 ? (
                  <span>
                    {activeTab.pageCount} {activeTab.pageCount === 1 ? 'página' : 'páginas'}
                  </span>
                ) : activeTab.imageWidth && activeTab.imageHeight ? (
                  <span>
                    {activeTab.imageWidth} × {activeTab.imageHeight} px
                  </span>
                ) : null}
                {activeTab.fileSize && activeTab.fileSize > 0 ? (
                  <span>{formatStudioMediaBytes(activeTab.fileSize)}</span>
                ) : null}
              </>
            ) : (
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
            )
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

        {activeTab && isActiveMediaPreview && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>{activeTab.mimeType || activeTab.encoding}</span>
          </div>
        )}

        {activeTab && !isActiveMediaPreview && (
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

      {/* Menu de Contexto de ARQUIVOS DO PROJETO */}
      {projectCtxMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            left: `${Math.min(
              projectCtxMenu.x,
              (typeof window !== 'undefined' ? window.innerWidth : 1024) - 235
            )}px`,
            top: `${Math.min(
              projectCtxMenu.y,
              (typeof window !== 'undefined' ? window.innerHeight : 768) - 340
            )}px`,
            width: '225px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 14px 34px rgba(0, 0, 0, 0.42)',
            padding: '4px',
            zIndex: 9800,
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              padding: '5px 8px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {projectCtxMenu.entry ? (
              <>
                <FileTypeIcon
                  name={projectCtxMenu.entry.name}
                  kind={projectCtxMenu.entry.kind}
                  size={12}
                  showBadge={false}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {projectCtxMenu.entry.name}
                </span>
              </>
            ) : (
              <>
                <Folder size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {effectiveWorkspace.split(/[/\\]/).pop() || effectiveWorkspace}
                </span>
              </>
            )}
          </div>

          {projectCtxMenu.entry && (
            <>
              <button
                type="button"
                onClick={() => {
                  const target = projectCtxMenu.entry!;
                  setProjectCtxMenu(null);
                  if (target.kind === 'dir') {
                    setWorkspaceDir(target.location.path);
                  } else {
                    void openFileInEditor(target.location.path, true);
                  }
                }}
                style={projectCtxItemStyle}
              >
                {projectCtxMenu.entry.kind === 'dir' ? (
                  <>
                    <Folder size={13} style={{ color: 'var(--accent)' }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>Abrir pasta</span>
                  </>
                ) : isStudioPdfFile(projectCtxMenu.entry.name) ||
                  isStudioImageFile(projectCtxMenu.entry.name) ||
                  isStudioAudioVideoFile(projectCtxMenu.entry.name) ? (
                  <>
                    <Eye size={13} style={{ color: 'var(--accent)' }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>Visualizar no Studio</span>
                  </>
                ) : (
                  <>
                    <FileCode2 size={13} style={{ color: 'var(--accent)' }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>Editar arquivo</span>
                  </>
                )}
              </button>
              <div style={projectCtxDividerStyle} />
            </>
          )}

          <button
            type="button"
            onClick={() => {
              const targetDir =
                projectCtxMenu.entry?.kind === 'dir'
                  ? projectCtxMenu.entry.location.path
                  : effectiveWorkspace;
              setProjectCtxMenu(null);
              setProjectModal({
                kind: 'newFile',
                targetDir,
                entry: null,
                inputValue: 'novo-arquivo.js',
                error: null,
                busy: false,
              });
            }}
            style={projectCtxItemStyle}
          >
            <FilePlus size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              {projectCtxMenu.entry?.kind === 'dir'
                ? 'Novo arquivo na pasta...'
                : 'Novo arquivo...'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              const targetDir =
                projectCtxMenu.entry?.kind === 'dir'
                  ? projectCtxMenu.entry.location.path
                  : effectiveWorkspace;
              setProjectCtxMenu(null);
              setProjectModal({
                kind: 'newFolder',
                targetDir,
                entry: null,
                inputValue: 'nova-pasta',
                error: null,
                busy: false,
              });
            }}
            style={projectCtxItemStyle}
          >
            <FolderPlus size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              {projectCtxMenu.entry?.kind === 'dir'
                ? 'Nova subpasta...'
                : 'Nova pasta...'}
            </span>
          </button>

          {projectCtxMenu.entry && (
            <>
              <div style={projectCtxDividerStyle} />

              <button
                type="button"
                onClick={() => {
                  const target = projectCtxMenu.entry!;
                  setProjectCtxMenu(null);
                  setProjectModal({
                    kind: 'rename',
                    targetDir: effectiveWorkspace,
                    entry: target,
                    inputValue: target.name,
                    error: null,
                    busy: false,
                  });
                }}
                style={projectCtxItemStyle}
              >
                <Pencil size={13} />
                <span style={{ flex: 1, textAlign: 'left' }}>Renomear...</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>F2</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = projectCtxMenu.entry!;
                  setProjectCtxMenu(null);
                  setProjectModal({
                    kind: 'move',
                    targetDir: effectiveWorkspace,
                    entry: target,
                    inputValue: effectiveWorkspace,
                    error: null,
                    busy: false,
                  });
                }}
                style={projectCtxItemStyle}
              >
                <FolderInput size={13} />
                <span style={{ flex: 1, textAlign: 'left' }}>Mover para...</span>
              </button>

              {projectCtxMenu.entry.kind !== 'dir' && (
                <button
                  type="button"
                  onClick={() => {
                    const target = projectCtxMenu.entry!;
                    setProjectCtxMenu(null);
                    void handleDuplicateProjectFile(target);
                  }}
                  style={projectCtxItemStyle}
                >
                  <Files size={13} />
                  <span style={{ flex: 1, textAlign: 'left' }}>Duplicar arquivo</span>
                </button>
              )}

              <div style={projectCtxDividerStyle} />

              <button
                type="button"
                onClick={() => {
                  const target = projectCtxMenu.entry!;
                  setProjectCtxMenu(null);
                  setStudioFileClipboard({
                    path: target.location.path,
                    name: target.name,
                    mode: 'cut',
                  });
                  showFlashStatus(`Recortado: ${target.name} (clique direito para colar)`);
                }}
                style={projectCtxItemStyle}
              >
                <Scissors size={13} />
                <span style={{ flex: 1, textAlign: 'left' }}>Recortar</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = projectCtxMenu.entry!;
                  setProjectCtxMenu(null);
                  setStudioFileClipboard({
                    path: target.location.path,
                    name: target.name,
                    mode: 'copy',
                  });
                  showFlashStatus(`Copiado: ${target.name} (clique direito para colar)`);
                }}
                style={projectCtxItemStyle}
              >
                <Copy size={13} />
                <span style={{ flex: 1, textAlign: 'left' }}>Copiar</span>
              </button>
            </>
          )}

          {studioFileClipboard && (
            <button
              type="button"
              onClick={() => {
                const targetDir =
                  projectCtxMenu.entry?.kind === 'dir'
                    ? projectCtxMenu.entry.location.path
                    : effectiveWorkspace;
                setProjectCtxMenu(null);
                void handlePasteProjectEntry(targetDir);
              }}
              style={projectCtxItemStyle}
            >
              <ClipboardPaste size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ flex: 1, textAlign: 'left' }}>
                Colar "{studioFileClipboard.name}" aqui
              </span>
            </button>
          )}

          <div style={projectCtxDividerStyle} />

          <button
            type="button"
            onClick={() => {
              const pathToCopy = projectCtxMenu.entry
                ? projectCtxMenu.entry.location.path
                : effectiveWorkspace;
              setProjectCtxMenu(null);
              if (navigator.clipboard) {
                void navigator.clipboard.writeText(pathToCopy);
                showFlashStatus('Caminho copiado para a área de transferência');
              }
            }}
            style={projectCtxItemStyle}
          >
            <Copy size={13} />
            <span style={{ flex: 1, textAlign: 'left' }}>Copiar caminho</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const pathToReveal = projectCtxMenu.entry
                ? projectCtxMenu.entry.location.path
                : effectiveWorkspace;
              setProjectCtxMenu(null);
              void revealInSystemExplorer(pathToReveal);
            }}
            style={projectCtxItemStyle}
          >
            <ExternalLink size={13} />
            <span style={{ flex: 1, textAlign: 'left' }}>Mostrar no Explorador</span>
          </button>

          {!projectCtxMenu.entry && (
            <button
              type="button"
              onClick={() => {
                setProjectCtxMenu(null);
                void reloadWorkspaceEntries(effectiveWorkspace);
              }}
              style={projectCtxItemStyle}
            >
              <RefreshCw size={13} />
              <span style={{ flex: 1, textAlign: 'left' }}>Atualizar lista</span>
            </button>
          )}

          {projectCtxMenu.entry && (
            <>
              <div style={projectCtxDividerStyle} />

              <button
                type="button"
                onClick={() => {
                  const target = projectCtxMenu.entry!;
                  setProjectCtxMenu(null);
                  void handleTrashProjectEntry(target);
                }}
                style={projectCtxItemStyle}
              >
                <Trash2 size={13} style={{ color: 'var(--status-warning)' }} />
                <span style={{ flex: 1, textAlign: 'left' }}>Mover para a Lixeira</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = projectCtxMenu.entry!;
                  setProjectCtxMenu(null);
                  setProjectModal({
                    kind: 'delete',
                    targetDir: effectiveWorkspace,
                    entry: target,
                    inputValue: target.name,
                    error: null,
                    busy: false,
                  });
                }}
                style={{ ...projectCtxItemStyle, color: 'var(--status-danger)' }}
              >
                <Trash2 size={13} style={{ color: 'var(--status-danger)' }} />
                <span style={{ flex: 1, textAlign: 'left' }}>Excluir...</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Del</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal de Ações de Arquivos do Projeto (Criar Arquivo/Pasta, Renomear, Mover, Excluir) */}
      {projectModal && (
        <div
          onMouseDown={() => {
            if (!projectModal.busy) setProjectModal(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            zIndex: 9850,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '430px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px' }}>
                {projectModal.kind === 'newFile' && (
                  <>
                    <FilePlus size={15} style={{ color: 'var(--accent)' }} />
                    <span>Novo Arquivo no Projeto</span>
                  </>
                )}
                {projectModal.kind === 'newFolder' && (
                  <>
                    <FolderPlus size={15} style={{ color: 'var(--accent)' }} />
                    <span>Nova Pasta no Projeto</span>
                  </>
                )}
                {projectModal.kind === 'rename' && (
                  <>
                    <Pencil size={15} style={{ color: 'var(--accent)' }} />
                    <span>
                      Renomear {projectModal.entry?.kind === 'dir' ? 'Pasta' : 'Arquivo'}
                    </span>
                  </>
                )}
                {projectModal.kind === 'move' && (
                  <>
                    <FolderInput size={15} style={{ color: 'var(--accent)' }} />
                    <span>Mover "{projectModal.entry?.name}"</span>
                  </>
                )}
                {projectModal.kind === 'delete' && (
                  <>
                    <Trash2 size={15} style={{ color: 'var(--status-danger)' }} />
                    <span>Excluir "{projectModal.entry?.name}"</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setProjectModal(null)}
                disabled={projectModal.busy}
                style={windowCtrlBtnStyle}
              >
                <X size={13} />
              </button>
            </div>

            {projectModal.kind !== 'delete' && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {projectModal.kind === 'move'
                  ? 'Selecione uma pasta do projeto abaixo ou informe o caminho de destino:'
                  : `Local: ${projectModal.targetDir}`}
              </div>
            )}

            {projectModal.kind === 'newFile' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {['.html', '.css', '.js', '.ts', '.tsx', '.json', '.md', '.py', '.go', '.sql'].map(
                  (ext) => (
                    <button
                      key={ext}
                      type="button"
                      onClick={() => {
                        const cur = projectModal.inputValue.trim() || 'novo-arquivo';
                        const stem = cur.includes('.') ? cur.slice(0, cur.lastIndexOf('.')) : cur;
                        setProjectModal({
                          ...projectModal,
                          inputValue: `${stem || 'novo-arquivo'}${ext}`,
                        });
                      }}
                      style={{
                        padding: '2px 7px',
                        fontSize: '10px',
                        borderRadius: '999px',
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: projectModal.inputValue.endsWith(ext)
                          ? 'var(--accent-subtle)'
                          : 'var(--bg-subtle)',
                        color: projectModal.inputValue.endsWith(ext)
                          ? 'var(--accent-text)'
                          : 'var(--text-secondary)',
                        cursor: 'default',
                      }}
                    >
                      {ext}
                    </button>
                  )
                )}
              </div>
            )}

            {projectModal.kind === 'move' && (
              <div
                style={{
                  maxHeight: '150px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-subtle)',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {(() => {
                  const parent = effectiveWorkspace.replace(/[/\\][^/\\]+$/, '');
                  const canGoParent = Boolean(parent && parent !== effectiveWorkspace);
                  const folders = workspaceEntries.filter(
                    (it) =>
                      it.kind === 'dir' &&
                      it.location.path !== projectModal.entry?.location.path
                  );
                  return (
                    <>
                      {canGoParent && (
                        <button
                          type="button"
                          onClick={() =>
                            setProjectModal({ ...projectModal, inputValue: parent })
                          }
                          style={{
                            ...sidebarItemStyle,
                            width: '100%',
                            border: 'none',
                            backgroundColor:
                              projectModal.inputValue === parent
                                ? 'var(--bg-selected)'
                                : 'transparent',
                            textAlign: 'left',
                          }}
                        >
                          <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            .. (Pasta superior: {parent.split(/[/\\]/).pop() || parent})
                          </span>
                        </button>
                      )}
                      {folders.map((f) => (
                        <button
                          key={f.location.path}
                          type="button"
                          onClick={() =>
                            setProjectModal({
                              ...projectModal,
                              inputValue: f.location.path,
                            })
                          }
                          style={{
                            ...sidebarItemStyle,
                            width: '100%',
                            border: 'none',
                            backgroundColor:
                              projectModal.inputValue === f.location.path
                                ? 'var(--bg-selected)'
                                : 'transparent',
                            textAlign: 'left',
                          }}
                        >
                          <Folder size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.name}
                          </span>
                        </button>
                      ))}
                      {!canGoParent && folders.length === 0 && (
                        <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Nenhuma subpasta listada. Digite o caminho de destino abaixo.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {projectModal.kind !== 'delete' ? (
              <input
                type="text"
                autoFocus
                value={projectModal.inputValue}
                onChange={(e) =>
                  setProjectModal({
                    ...projectModal,
                    inputValue: e.target.value,
                    error: null,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSubmitProjectModal(true);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setProjectModal(null);
                  }
                }}
                placeholder={
                  projectModal.kind === 'move'
                    ? 'Caminho da pasta de destino...'
                    : 'Digite o nome...'
                }
                style={{
                  ...findInputStyle,
                  width: '100%',
                  padding: '7px 10px',
                  fontSize: '13px',
                }}
              />
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Deseja excluir{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {projectModal.entry?.name}
                </strong>
                ?
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {projectModal.entry?.location.path}
                </div>
              </div>
            )}

            {projectModal.error && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--status-danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle size={12} />
                <span>{projectModal.error}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setProjectModal(null)}
                disabled={projectModal.busy}
                style={{ ...headerBtnStyle, padding: '5px 12px' }}
              >
                Cancelar
              </button>
              {projectModal.kind === 'delete' ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSubmitProjectModal(false)}
                    disabled={projectModal.busy}
                    style={{
                      ...headerBtnStyle,
                      padding: '5px 12px',
                      borderColor: 'var(--border-strong)',
                    }}
                  >
                    Mover p/ Lixeira
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmitProjectModal(true)}
                    disabled={projectModal.busy}
                    style={{
                      ...headerBtnStyle,
                      padding: '5px 12px',
                      backgroundColor: 'var(--status-danger)',
                      borderColor: 'var(--status-danger)',
                      color: '#ffffff',
                      fontWeight: 600,
                    }}
                  >
                    Excluir Permanentemente
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSubmitProjectModal(true)}
                  disabled={projectModal.busy}
                  style={{
                    ...headerBtnStyle,
                    padding: '5px 14px',
                    backgroundColor: 'var(--accent-primary)',
                    borderColor: 'var(--accent-primary)',
                    color: '#ffffff',
                    fontWeight: 600,
                  }}
                >
                  {projectModal.kind === 'newFile' || projectModal.kind === 'newFolder'
                    ? 'Criar'
                    : projectModal.kind === 'rename'
                    ? 'Renomear'
                    : 'Mover'}
                </button>
              )}
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
  cursor: 'default',
};

const studioTitlebarWinBtnStyle: React.CSSProperties = {
  width: '42px',
  height: '100%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-secondary)',
  cursor: 'default',
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
  cursor: 'default',
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
  cursor: 'default',
  fontSize: '11px',
  padding: '0 2px',
};

const activityBtnStyle: React.CSSProperties = {
  width: '100%',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'default',
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
  cursor: 'default',
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
  cursor: 'default',
  textAlign: 'center',
};

const projectCtxItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  fontSize: '12px',
  cursor: 'default',
};

const projectCtxDividerStyle: React.CSSProperties = {
  height: '1px',
  backgroundColor: 'var(--border-subtle)',
  margin: '3px 4px',
};
