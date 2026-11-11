import { create } from 'zustand';
import {
  readTextFile,
  writeTextFile,
  createFile,
  runStudioCommand,
  openStudioWindowNative,
  listDirectorySnapshot,
  isDirectoryPath,
  getPreview,
  StudioRunResult,
} from '../../lib/wails';

export interface EditorDiagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface CodeSymbol {
  name: string;
  kind: 'function' | 'struct' | 'interface' | 'class' | 'type' | 'const' | 'heading' | 'key';
  line: number;
}

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  savedContent: string;
  lineEnding: 'LF' | 'CRLF';
  encoding: string;
  cursorLine: number;
  cursorCol: number;
  pinned?: boolean;
  tabKind?: 'code' | 'pdf' | 'image' | 'media';
  mediaSrc?: string;
  fileSize?: number;
  mimeType?: string;
  imageWidth?: number;
  imageHeight?: number;
  pageCount?: number;
  svgViewMode?: 'preview' | 'code';
}

export type DevTransformKind =
  | 'sortAsc'
  | 'sortDesc'
  | 'dedupe'
  | 'removeEmpty'
  | 'trimTrailing'
  | 'upper'
  | 'lower'
  | 'camelCase'
  | 'snakeCase'
  | 'kebabCase'
  | 'jsonPretty'
  | 'jsonMinify'
  | 'jsonEscape'
  | 'jsonUnescape'
  | 'csvToJson'
  | 'jsonToCsv'
  | 'csvAlign'
  | 'base64Encode'
  | 'base64Decode'
  | 'urlEncode'
  | 'urlDecode'
  | 'jwtDecode';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  txt: 'plaintext',
  log: 'plaintext',
  csv: 'csv',
  tsv: 'csv',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  mdown: 'markdown',
  mkd: 'markdown',
  rmd: 'markdown',
  json: 'json',
  jsonc: 'json',
  jsonl: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  go: 'go',
  py: 'python',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'css',
  less: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  env: 'ini',
  conf: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  sql: 'sql',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  java: 'java',
  php: 'php',
  rb: 'ruby',
  dockerfile: 'dockerfile',
  gitignore: 'ini',
  makefile: 'makefile',
};

export function detectLanguageFromPath(nameOrPath: string): string {
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  if (base === 'readme' || base === 'changelog') return 'markdown';
  if (base.startsWith('.env')) return 'ini';
  if (base.startsWith('.git')) return 'ini';
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx < 0) return 'plaintext';
  const ext = base.slice(dotIdx + 1);
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

export function isEditableTextFile(nameOrPath: string, extension?: string): boolean {
  const ext = (extension || '').replace(/^\./, '').toLowerCase();
  if (ext && EXTENSION_LANGUAGE_MAP[ext]) return true;
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  if (
    base === 'dockerfile' ||
    base === 'makefile' ||
    base === 'license' ||
    base === 'readme' ||
    base.startsWith('.env') ||
    base.startsWith('.git') ||
    base.endsWith('.rc')
  ) {
    return true;
  }
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx >= 0) {
    const parsedExt = base.slice(dotIdx + 1);
    return Boolean(EXTENSION_LANGUAGE_MAP[parsedExt]);
  }
  return false;
}

const STUDIO_IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'jfif',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'avif',
  'tif',
  'tiff',
]);

const STUDIO_MEDIA_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'ogg',
  'ogv',
  'mov',
  'mp3',
  'wav',
  'flac',
  'm4a',
  'aac',
]);

export function isStudioPdfFile(nameOrPath: string, extension?: string): boolean {
  const ext = (extension || '').replace(/^\./, '').toLowerCase();
  if (ext) return ext === 'pdf';
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  return base.endsWith('.pdf');
}

export function isStudioImageFile(nameOrPath: string, extension?: string): boolean {
  const ext = (extension || '').replace(/^\./, '').toLowerCase();
  if (ext && STUDIO_IMAGE_EXTENSIONS.has(ext)) return true;
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx >= 0) {
    return STUDIO_IMAGE_EXTENSIONS.has(base.slice(dotIdx + 1));
  }
  return false;
}

export function isStudioAudioVideoFile(nameOrPath: string, extension?: string): boolean {
  const ext = (extension || '').replace(/^\./, '').toLowerCase();
  if (ext && STUDIO_MEDIA_EXTENSIONS.has(ext)) return true;
  const base = (nameOrPath.split(/[/\\]/).pop() || nameOrPath).toLowerCase();
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx >= 0) {
    return STUDIO_MEDIA_EXTENSIONS.has(base.slice(dotIdx + 1));
  }
  return false;
}

export function isStudioSupportedFile(nameOrPath: string, extension?: string): boolean {
  return (
    isEditableTextFile(nameOrPath, extension) ||
    isStudioPdfFile(nameOrPath, extension) ||
    isStudioImageFile(nameOrPath, extension) ||
    isStudioAudioVideoFile(nameOrPath, extension)
  );
}

export function isBinaryMediaTab(tab?: EditorTab | null): boolean {
  if (!tab) return false;
  if (tab.tabKind === 'pdf' || tab.tabKind === 'media') return true;
  if (tab.tabKind === 'image') {
    return !tab.name.toLowerCase().endsWith('.svg');
  }
  return false;
}

export function isTabMediaPreviewActive(tab?: EditorTab | null): boolean {
  if (!tab) return false;
  if (tab.tabKind === 'pdf' || tab.tabKind === 'media') return true;
  if (tab.tabKind === 'image') {
    if (tab.name.toLowerCase().endsWith('.svg') && tab.svgViewMode === 'code') {
      return false;
    }
    return true;
  }
  return false;
}

export function detectCsvDelimiter(content: string): string {
  const firstLine = (content.replace(/\r\n/g, '\n').split('\n').find((l) => l.trim().length > 0) || '');
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const cand of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === cand) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = cand;
    }
  }
  return best;
}

export function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  cells.push(cur);
  return cells;
}

export function parseCsvTable(content: string): {
  delimiter: string;
  headers: string[];
  rows: string[][];
  maxCols: number;
} {
  const delimiter = detectCsvDelimiter(content);
  const nonEmptyLines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    return { delimiter, headers: [], rows: [], maxCols: 0 };
  }
  const headers = parseCsvLine(nonEmptyLines[0], delimiter).map((h, i) => h.trim() || `Col_${i + 1}`);
  const rows = nonEmptyLines.slice(1).map((line) => parseCsvLine(line, delimiter));
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), headers.length);
  return { delimiter, headers, rows, maxCols };
}

export function serializeCsvCell(val: string, delimiter: string): string {
  const s = val ?? '';
  if (s.includes('"') || s.includes(delimiter) || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function serializeCsvTable(
  headers: string[],
  rows: string[][],
  delimiter = ',',
  lineEnding: 'LF' | 'CRLF' = 'LF'
): string {
  const sep = lineEnding === 'CRLF' ? '\r\n' : '\n';
  const lines = [
    headers.map((h) => serializeCsvCell(h, delimiter)).join(delimiter),
    ...rows.map((r) =>
      headers.map((_, idx) => serializeCsvCell(r[idx] ?? '', delimiter)).join(delimiter)
    ),
  ];
  return lines.join(sep);
}

export function csvToJsonString(content: string, indent = 2): string {
  const { headers, rows } = parseCsvTable(content);
  const items = rows.map((row) => {
    const obj: Record<string, string | number | boolean | null> = {};
    headers.forEach((h, idx) => {
      const raw = (row[idx] ?? '').trim();
      if (raw === '' || raw.toLowerCase() === 'null') {
        obj[h] = null;
      } else if (raw.toLowerCase() === 'true') {
        obj[h] = true;
      } else if (raw.toLowerCase() === 'false') {
        obj[h] = false;
      } else if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
        obj[h] = Number(raw);
      } else {
        obj[h] = row[idx] ?? '';
      }
    });
    return obj;
  });
  return JSON.stringify(items, null, indent);
}

export function jsonToCsvString(content: string, lineEnding: 'LF' | 'CRLF' = 'LF'): string {
  const parsed = JSON.parse(content);
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
    ? [parsed]
    : [];
  if (arr.length === 0) return '';
  const keySet = new Set<string>();
  arr.forEach((item) => {
    if (item && typeof item === 'object') {
      Object.keys(item as Record<string, unknown>).forEach((k) => keySet.add(k));
    }
  });
  const headers = Array.from(keySet);
  const rows = arr.map((item) => {
    const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return headers.map((h) => {
      const v = rec[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
  });
  return serializeCsvTable(headers, rows, ',', lineEnding);
}

export function alignCsvColumns(content: string, lineEnding: 'LF' | 'CRLF' = 'LF'): string {
  const { delimiter, headers, rows } = parseCsvTable(content);
  if (headers.length === 0) return content;
  const allRows = [headers, ...rows];
  const widths = headers.map((_, colIdx) =>
    Math.max(
      ...allRows.map((r) => serializeCsvCell((r[colIdx] ?? '').trim(), delimiter).length)
    )
  );
  const sep = lineEnding === 'CRLF' ? '\r\n' : '\n';
  return allRows
    .map((r) =>
      headers
        .map((_, colIdx) => {
          const cell = serializeCsvCell((r[colIdx] ?? '').trim(), delimiter);
          return colIdx === headers.length - 1 ? cell : cell.padEnd(widths[colIdx], ' ');
        })
        .join(` ${delimiter} `)
    )
    .join(sep);
}

export function computeDiagnostics(content: string, language: string): EditorDiagnostic[] {
  const diags: EditorDiagnostic[] = [];
  if (language === 'json' && content.trim().length > 0) {
    try {
      JSON.parse(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'JSON inválido';
      const posMatch = msg.match(/position\s+(\d+)/i);
      let line = 1;
      if (posMatch) {
        const pos = Number(posMatch[1]);
        line = content.slice(0, pos).split('\n').length;
      }
      diags.push({ line, message: msg, severity: 'error' });
    }
  }

  if (language === 'csv' && content.trim().length > 0) {
    const delimiter = detectCsvDelimiter(content);
    const rawLines = content.replace(/\r\n/g, '\n').split('\n');
    let expectedCols = 0;
    rawLines.forEach((ln, idx) => {
      if (!ln.trim()) return;
      const cols = parseCsvLine(ln, delimiter).length;
      if (expectedCols === 0) {
        expectedCols = cols;
      } else if (cols !== expectedCols) {
        diags.push({
          line: idx + 1,
          message: `Linha CSV com ${cols} coluna(s), esperado ${expectedCols} coluna(s) do cabeçalho`,
          severity: 'warning',
        });
      }
    });
  }

  if (['javascript', 'typescript', 'go', 'rust', 'c', 'cpp', 'java', 'csharp', 'css', 'php'].includes(language)) {
    const lines = content.split('\n');
    let braceBalance = 0;
    let lastOpenLine = 1;
    lines.forEach((ln, idx) => {
      const stripped = ln
        .replace(/\/\/.*$/, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
      for (const ch of stripped) {
        if (ch === '{') {
          braceBalance++;
          lastOpenLine = idx + 1;
        } else if (ch === '}') {
          braceBalance--;
        }
      }
    });
    if (braceBalance > 0) {
      diags.push({
        line: lastOpenLine,
        message: `Bloco '{' não fechado (${braceBalance} pendente)`,
        severity: 'warning',
      });
    } else if (braceBalance < 0) {
      diags.push({
        line: lines.length,
        message: `Chave '}' excedente encontrada`,
        severity: 'error',
      });
    }
  }

  return diags;
}

export function extractCodeSymbols(content: string, language: string): CodeSymbol[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const symbols: CodeSymbol[] = [];

  if (language === 'csv') {
    const { headers } = parseCsvTable(content);
    headers.forEach((h, i) => {
      symbols.push({ name: `Col ${i + 1}: ${h}`, kind: 'key', line: 1 });
    });
    return symbols;
  }

  lines.forEach((raw, idx) => {
    const lineNum = idx + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (language === 'go') {
      const fnMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)/);
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], kind: 'function', line: lineNum });
        return;
      }
      const typeMatch = trimmed.match(/^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)/);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: typeMatch[2] === 'interface' ? 'interface' : 'struct',
          line: lineNum,
        });
        return;
      }
    } else if (language === 'typescript' || language === 'javascript') {
      const fnMatch = trimmed.match(
        /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/
      );
      if (fnMatch) {
        symbols.push({ name: fnMatch[1], kind: 'function', line: lineNum });
        return;
      }
      const clsMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (clsMatch) {
        symbols.push({ name: clsMatch[1], kind: 'class', line: lineNum });
        return;
      }
      const ifaceMatch = trimmed.match(
        /^(?:export\s+)?(interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
      );
      if (ifaceMatch) {
        symbols.push({
          name: ifaceMatch[2],
          kind: ifaceMatch[1] === 'interface' ? 'interface' : 'type',
          line: lineNum,
        });
        return;
      }
      const constFnMatch = trimmed.match(
        /^(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/
      );
      if (constFnMatch) {
        symbols.push({ name: constFnMatch[1], kind: 'function', line: lineNum });
        return;
      }
    } else if (language === 'python') {
      const defMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (defMatch) {
        symbols.push({ name: defMatch[1], kind: 'function', line: lineNum });
        return;
      }
      const clsMatch = trimmed.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (clsMatch) {
        symbols.push({ name: clsMatch[1], kind: 'class', line: lineNum });
        return;
      }
    } else if (language === 'markdown') {
      const hdMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (hdMatch) {
        symbols.push({ name: hdMatch[2].trim(), kind: 'heading', line: lineNum });
        return;
      }
    } else if (language === 'json') {
      const keyMatch = raw.match(/^\s{2,4}"([^"]+)"\s*:/);
      if (keyMatch) {
        symbols.push({ name: keyMatch[1], kind: 'key', line: lineNum });
      }
    } else if (language === 'sql') {
      const sqlMatch = trimmed.match(/^(?:CREATE\s+(?:TEMP\s+)?(?:TABLE|VIEW|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."`]+))/i);
      if (sqlMatch) {
        symbols.push({ name: sqlMatch[1], kind: 'struct', line: lineNum });
      }
    } else if (language === 'yaml' || language === 'toml' || language === 'ini') {
      const secMatch = trimmed.match(/^\[([^\]]+)\]$/) || raw.match(/^([A-Za-z0-9_.-]+)\s*[:=]/);
      if (secMatch) {
        symbols.push({ name: secMatch[1], kind: 'key', line: lineNum });
      }
    }
  });

  return symbols;
}

export function computeLineDiff(savedContent: string, currentContent: string): DiffLine[] {
  const oldLines = savedContent.replace(/\r\n/g, '\n').split('\n');
  const newLines = currentContent.replace(/\r\n/g, '\n').split('\n');
  const result: DiffLine[] = [];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ type: 'same', oldLine: i + 1, newLine: j + 1, text: newLines[j] });
      i++;
      j++;
    } else if (
      j + 1 < newLines.length &&
      i < oldLines.length &&
      oldLines[i] === newLines[j + 1]
    ) {
      result.push({ type: 'added', newLine: j + 1, text: newLines[j] });
      j++;
    } else if (
      i + 1 < oldLines.length &&
      j < newLines.length &&
      oldLines[i + 1] === newLines[j]
    ) {
      result.push({ type: 'removed', oldLine: i + 1, text: oldLines[i] });
      i++;
    } else {
      if (i < oldLines.length) {
        result.push({ type: 'removed', oldLine: i + 1, text: oldLines[i] });
        i++;
      }
      if (j < newLines.length) {
        result.push({ type: 'added', newLine: j + 1, text: newLines[j] });
        j++;
      }
    }
  }
  return result;
}

export function defaultCommandForTab(tab: EditorTab): string {
  const quoted = tab.path ? `"${tab.path}"` : '';
  switch (tab.language) {
    case 'go':
      return quoted ? `go run ${quoted}` : 'go test ./...';
    case 'python':
      return quoted ? `python ${quoted}` : 'python --version';
    case 'javascript':
      return quoted ? `node ${quoted}` : 'node -v';
    case 'typescript':
      return quoted ? `npx tsx ${quoted}` : 'npx tsc --noEmit';
    case 'powershell':
      return quoted ? `powershell -ExecutionPolicy Bypass -File ${quoted}` : 'Get-Location';
    case 'shell':
      return quoted ? `bash ${quoted}` : 'ls -la';
    default:
      return 'git status -sb';
  }
}

const STUDIO_STORAGE_KEY = 'pulsares.studio.tabs.v1';
const STUDIO_QUEUE_KEY = 'pulsares.studio.openQueue.v1';
const STUDIO_CHANNEL_NAME = 'pulsares_studio_ipc';

let studioPopupRef: Window | null = null;
let broadcastChannel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(STUDIO_CHANNEL_NAME);
  }
  return broadcastChannel;
}

export function isStandaloneStudioWindow(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('studio') === '1';
}

export function normalizeStudioFilePath(p: string): string {
  return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function deduplicateTabsByPath(tabs: EditorTab[]): EditorTab[] {
  const seen = new Set<string>();
  const out: EditorTab[] = [];
  for (const tab of tabs) {
    if (tab.path) {
      const key = normalizeStudioFilePath(tab.path);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
    }
    out.push(tab);
  }
  return out;
}

export function sanitizeTabsForStorage(tabs: EditorTab[]): EditorTab[] {
  return deduplicateTabsByPath(tabs)
    .slice(-15)
    .map((t) => {
      if (t.mediaSrc && t.mediaSrc.startsWith('data:')) {
        const copy = { ...t };
        delete copy.mediaSrc;
        return copy;
      }
      return t;
    });
}

function persistTabsToStorage(tabs: EditorTab[], activeTabId: string | null, workspaceDir: string) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(
      STUDIO_STORAGE_KEY,
      JSON.stringify({ tabs: sanitizeTabsForStorage(tabs), activeTabId, workspaceDir })
    );
  } catch {
    // ignora quota
  }
}

function loadPersistedTabs(): {
  tabs: EditorTab[];
  activeTabId: string | null;
  workspaceDir: string;
} {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { tabs: [], activeTabId: null, workspaceDir: '' };
    }
    const raw = window.localStorage.getItem(STUDIO_STORAGE_KEY);
    if (!raw) return { tabs: [], activeTabId: null, workspaceDir: '' };
    const parsed = JSON.parse(raw);
    const rawTabs: EditorTab[] = Array.isArray(parsed.tabs) ? parsed.tabs : [];
    const normWs = String(parsed.workspaceDir || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase();
    const cleanTabs = deduplicateTabsByPath(
      rawTabs
        .filter((t) => {
          const hasContent = Boolean(t.content && t.content.trim());
          if (!t.path) return hasContent;
          const normTabPath = normalizeStudioFilePath(t.path);
          // Descarta abas fantasmas criadas indevidamente com o caminho de uma pasta ou sem extensão e vazias
          if (normWs && normTabPath === normWs) return false;
          if (!hasContent && !t.name.includes('.')) return false;
          return true;
        })
        .map((t): EditorTab => {
          if (!t.tabKind && t.path) {
            if (isStudioPdfFile(t.path)) {
              return { ...t, tabKind: 'pdf' as const, language: 'pdf' };
            }
            if (isStudioImageFile(t.path)) {
              return {
                ...t,
                tabKind: 'image' as const,
                svgViewMode: t.svgViewMode || 'preview',
              };
            }
            if (isStudioAudioVideoFile(t.path)) {
              return {
                ...t,
                tabKind: 'media' as const,
                language: 'media',
                mediaSrc: t.mediaSrc || `/__localmedia?path=${encodeURIComponent(t.path)}`,
              };
            }
          }
          if ((!t.tabKind || t.tabKind === 'code') && (t.name || t.path)) {
            const detected = detectLanguageFromPath(t.name || t.path);
            if ((!t.language || t.language === 'plaintext') && detected !== 'plaintext') {
              return { ...t, language: detected };
            }
          }
          return t;
        })
    );
    const activeId =
      cleanTabs.find((t) => t.id === parsed.activeTabId)?.id ||
      cleanTabs[cleanTabs.length - 1]?.id ||
      null;
    return {
      tabs: cleanTabs,
      activeTabId: activeId,
      workspaceDir: parsed.workspaceDir || '',
    };
  } catch {
    return { tabs: [], activeTabId: null, workspaceDir: '' };
  }
}

interface EditorState {
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  isDedicatedStudio: boolean;
  preferSeparateWindow: boolean;
  workspaceDir: string;
  tabs: EditorTab[];
  activeTabId: string | null;
  fontSize: number;
  tabSize: 2 | 4;
  wordWrap: boolean;
  showMinimap: boolean;
  showSplitPreview: boolean;
  showDiffView: boolean;
  sidebarTab: 'files' | 'search' | 'symbols' | 'tools' | null;
  findBarOpen: boolean;
  quickOpenVisible: boolean;
  runnerOpen: boolean;
  runnerLoading: boolean;
  runnerCommand: string;
  runnerResult: StudioRunResult | null;
  statusMessage: string | null;

  hydrateStudioFromStorage: (initialTarget?: string, defaultDir?: string) => Promise<void>;
  openFileInEditor: (path: string, forceLocalModal?: boolean) => Promise<void>;
  openFolderInEditor: (folderPath: string, forceLocalModal?: boolean) => Promise<void>;
  openNewUntitledTab: (defaultDir?: string, language?: string, forceLocalModal?: boolean) => void;
  detachToSeparateWindow: () => Promise<void>;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  syncTabAfterPathChange: (oldPath: string, newPath: string) => void;
  closeTabsForDeletedPath: (deletedPath: string) => void;
  togglePinTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  revertTabContent: (id: string) => void;
  updateCursor: (id: string, line: number, col: number) => void;
  setTabLanguage: (id: string, language: string) => void;
  setTabSvgViewMode: (id: string, mode: 'preview' | 'code') => void;
  updateTabMediaMeta: (
    id: string,
    meta: Partial<
      Pick<
        EditorTab,
        'mediaSrc' | 'fileSize' | 'mimeType' | 'imageWidth' | 'imageHeight' | 'pageCount'
      >
    >
  ) => void;
  toggleLineEnding: (id: string) => void;
  saveTab: (id: string, fallbackDir?: string) => Promise<boolean>;
  saveAllTabs: (fallbackDir?: string) => Promise<void>;
  formatActiveTab: () => void;
  transformActiveTab: (kind: DevTransformKind) => void;
  runStudioScript: (cwd: string, customCmd?: string) => Promise<void>;

  setWorkspaceDir: (dir: string) => void;
  setEditorOpen: (open: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  toggleMaximized: () => void;
  setPreferSeparateWindow: (prefer: boolean) => void;
  setFontSize: (size: number) => void;
  setTabSize: (size: 2 | 4) => void;
  toggleWordWrap: () => void;
  toggleMinimap: () => void;
  toggleSplitPreview: () => void;
  toggleDiffView: () => void;
  setSidebarTab: (tab: 'files' | 'search' | 'symbols' | 'tools' | null) => void;
  setFindBarOpen: (open: boolean) => void;
  setQuickOpenVisible: (visible: boolean) => void;
  setRunnerOpen: (open: boolean) => void;
  setRunnerCommand: (cmd: string) => void;
  setStatusMessage: (msg: string | null) => void;
}

let untitledSeq = 1;

function spawnOrFocusSeparateStudioWindow(targetPath?: string, workspaceDir?: string): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandaloneStudioWindow()) return false;

  try {
    window.localStorage.setItem(
      STUDIO_QUEUE_KEY,
      JSON.stringify({
        targetPath: targetPath || '',
        workspaceDir: workspaceDir || '',
        ts: Date.now(),
      })
    );
  } catch {
    // ignora
  }

  const ch = getChannel();
  if (ch) {
    ch.postMessage({
      type: 'STUDIO_OPEN_REQUEST',
      targetPath: targetPath || '',
      workspaceDir: workspaceDir || '',
    });
  }

  if (studioPopupRef && !studioPopupRef.closed) {
    studioPopupRef.focus();
    return true;
  }

  const studioUrl = `${window.location.origin}${window.location.pathname}?studio=1`;
  const win = window.open(
    studioUrl,
    'PulsaresStudioWindow',
    'width=1280,height=820,left=90,top=50,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
  );
  if (win) {
    studioPopupRef = win;
    win.focus();
    return true;
  }
  return false;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  isOpen: isStandaloneStudioWindow(),
  isMinimized: false,
  isMaximized: isStandaloneStudioWindow(),
  isDedicatedStudio: isStandaloneStudioWindow(),
  preferSeparateWindow: true,
  workspaceDir: '',
  tabs: [],
  activeTabId: null,
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  showMinimap: true,
  showSplitPreview: false,
  showDiffView: false,
  sidebarTab: 'files',
  findBarOpen: false,
  quickOpenVisible: false,
  runnerOpen: false,
  runnerLoading: false,
  runnerCommand: '',
  runnerResult: null,
  statusMessage: null,

  hydrateStudioFromStorage: async (initialTarget?: string, defaultDir?: string) => {
    const saved = loadPersistedTabs();
    const dir = saved.workspaceDir || defaultDir || '';
    set({
      isDedicatedStudio: true,
      isOpen: true,
      isMaximized: true,
      sidebarTab: 'files',
    });
    if (saved.tabs.length > 0) {
      const resolvedActiveId = saved.activeTabId || saved.tabs[0].id;
      const activeObj = saved.tabs.find((t) => t.id === resolvedActiveId) || saved.tabs[0];
      const shouldAutoPreview =
        activeObj?.language === 'markdown' ||
        activeObj?.language === 'csv' ||
        activeObj?.language === 'html';
      set((s) => ({
        tabs: saved.tabs,
        activeTabId: resolvedActiveId,
        workspaceDir: dir,
        showSplitPreview: shouldAutoPreview ? true : s.showSplitPreview,
      }));
    } else if (dir) {
      set({ workspaceDir: dir });
    }

    // Verifica se há pedido na fila de abertura
    try {
      const rawQ = window.localStorage.getItem(STUDIO_QUEUE_KEY);
      if (rawQ) {
        window.localStorage.removeItem(STUDIO_QUEUE_KEY);
        const q = JSON.parse(rawQ) as { targetPath?: string; workspaceDir?: string };
        if (q.workspaceDir) {
          set({ workspaceDir: q.workspaceDir });
        }
        if (q.targetPath) {
          await get().openFileInEditor(q.targetPath, true);
          return;
        } else if (q.workspaceDir) {
          await get().openFolderInEditor(q.workspaceDir, true);
          return;
        }
      }
    } catch {
      // ignora
    }

    if (initialTarget) {
      if (await isDirectoryPath(initialTarget)) {
        await get().openFolderInEditor(initialTarget, true);
      } else if (
        isStudioPdfFile(initialTarget) ||
        isStudioImageFile(initialTarget) ||
        isStudioAudioVideoFile(initialTarget)
      ) {
        await get().openFileInEditor(initialTarget, true);
      } else {
        try {
          await readTextFile(initialTarget);
          await get().openFileInEditor(initialTarget, true);
        } catch {
          await get().openFolderInEditor(initialTarget, true);
        }
      }
    } else if (dir) {
      await get().openFolderInEditor(dir, true);
    }
  },

  openFolderInEditor: async (folderPath: string, forceLocalModal = false) => {
    const cleanDir = (folderPath || get().workspaceDir || '').replace(/[\\/]+$/, '');
    const normDir = cleanDir.replace(/\\/g, '/').toLowerCase();
    const realTabs = get().tabs.filter((t) => {
      const hasContent = Boolean(t.content && t.content.trim());
      if (!t.path) return hasContent;
      const normTab = t.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      if (normDir && normTab === normDir) return false;
      if (!hasContent && !t.name.includes('.')) return false;
      return true;
    });
    const nextActive =
      realTabs.find((t) => t.id === get().activeTabId)?.id ||
      realTabs[realTabs.length - 1]?.id ||
      null;

    set({
      workspaceDir: cleanDir,
      tabs: realTabs,
      activeTabId: nextActive,
      sidebarTab: 'files',
    });
    persistTabsToStorage(realTabs, nextActive, cleanDir);

    if (
      !forceLocalModal &&
      !get().isDedicatedStudio &&
      !isStandaloneStudioWindow() &&
      get().preferSeparateWindow
    ) {
      const openedNative = await openStudioWindowNative(cleanDir);
      if (openedNative) {
        set({ isOpen: false });
        return;
      }
      const openedPopup = spawnOrFocusSeparateStudioWindow('', cleanDir);
      if (openedPopup) {
        set({ isOpen: false });
        return;
      }
    }

    set({
      isOpen: true,
      isMinimized: false,
      sidebarTab: 'files',
    });

    if (cleanDir) {
      try {
        const items = await listDirectorySnapshot(cleanDir, false);
        const files = items.filter((it) => it.kind !== 'dir');
        const dirChildPrefix = `${normDir}/`;
        const tabsInFolder = get().tabs.filter(
          (t) =>
            t.path &&
            t.path.replace(/\\/g, '/').toLowerCase().startsWith(dirChildPrefix)
        );
        if (tabsInFolder.length > 0) {
          const currentActive = get().tabs.find((t) => t.id === get().activeTabId);
          if (
            !currentActive ||
            !currentActive.path
              .replace(/\\/g, '/')
              .toLowerCase()
              .startsWith(dirChildPrefix)
          ) {
            set({ activeTabId: tabsInFolder[tabsInFolder.length - 1].id });
          }
          return;
        }
        if (files.length > 0) {
          const priorityNames = [
            'index.html',
            'index.htm',
            'main.tsx',
            'app.tsx',
            'index.tsx',
            'index.ts',
            'index.js',
            'app.js',
            'main.go',
            'main.py',
            'app.py',
            'readme.md',
            'package.json',
          ];
          let entryToOpen = undefined;
          for (const pName of priorityNames) {
            const found = files.find((f) => f.name.toLowerCase() === pName);
            if (found) {
              entryToOpen = found;
              break;
            }
          }
          if (!entryToOpen) {
            entryToOpen = files.find((f) => isEditableTextFile(f.name));
          }
          if (!entryToOpen) {
            entryToOpen = files.find(
              (f) =>
                isStudioPdfFile(f.name) ||
                isStudioImageFile(f.name) ||
                isStudioAudioVideoFile(f.name)
            );
          }
          if (entryToOpen) {
            await get().openFileInEditor(entryToOpen.location.path, true);
          }
        }
      } catch {
        // mantém apenas o diretório aberto na árvore lateral
      }
    }
  },

  openFileInEditor: async (path: string, forceLocalModal = false) => {
    const cleanPath = (path || '').replace(/[\\/]+$/, '');
    if (!cleanPath) return;

    // Se o caminho passado for uma pasta (diretório), delega imediatamente para openFolderInEditor
    if (await isDirectoryPath(cleanPath)) {
      await get().openFolderInEditor(cleanPath, forceLocalModal);
      return;
    }

    const rawParentDir = cleanPath.replace(/[/\\][^/\\]+$/, '');
    const existingWs = get().workspaceDir;
    const normExistingWs = normalizeStudioFilePath(existingWs);
    const normCleanPath = normalizeStudioFilePath(cleanPath);
    const isInsideExistingWs =
      Boolean(normExistingWs) && normCleanPath.startsWith(`${normExistingWs}/`);
    const parentDir = isInsideExistingWs ? existingWs : rawParentDir || existingWs;
    if (parentDir && parentDir !== existingWs) {
      set({ workspaceDir: parentDir });
    }

    // Remove abas sem-titulo vazias, abas fantasmas de pasta e duplicatas antes de abrir o arquivo real
    const normParent = normalizeStudioFilePath(parentDir || '');
    const cleanedExistingTabs = deduplicateTabsByPath(
      get().tabs.filter((t) => {
        const hasContent = Boolean(t.content && t.content.trim());
        if (!t.path) return hasContent;
        const normTab = normalizeStudioFilePath(t.path);
        if (normParent && normTab === normParent) return false;
        if (!hasContent && !t.name.includes('.')) return false;
        return true;
      })
    );
    if (cleanedExistingTabs.length !== get().tabs.length) {
      set({ tabs: cleanedExistingTabs });
    }

    // Carrega e registra a aba no estado persistido antes de abrir/focar a janela separada
    const existing = get().tabs.find(
      (t) => Boolean(t.path) && normalizeStudioFilePath(t.path) === normCleanPath
    );
    let activeTab: EditorTab | null = existing || null;

    if (!activeTab) {
      try {
        const isPdf = isStudioPdfFile(cleanPath);
        const isImg = !isPdf && isStudioImageFile(cleanPath);
        const isMedia = !isPdf && !isImg && isStudioAudioVideoFile(cleanPath);
        const isSvg = isImg && cleanPath.toLowerCase().endsWith('.svg');
        const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const fallbackName = cleanPath.split(/[/\\]/).pop() || cleanPath;

        if (isSvg) {
          const [payload, prev] = await Promise.all([
            readTextFile(cleanPath),
            getPreview(cleanPath, 4096).catch(() => null),
          ]);
          activeTab = {
            id,
            path: payload.path || cleanPath,
            name: payload.name || fallbackName,
            language: 'xml',
            content: payload.content,
            savedContent: payload.content,
            lineEnding: payload.lineEnding || 'LF',
            encoding: payload.encoding || 'UTF-8',
            cursorLine: 1,
            cursorCol: 1,
            tabKind: 'image',
            svgViewMode: 'preview',
            mediaSrc: prev?.dataUri || `/__localmedia?path=${encodeURIComponent(cleanPath)}`,
            fileSize: prev?.size ?? payload.size,
            mimeType: prev?.mimeType || 'image/svg+xml',
            imageWidth: prev?.imageWidth,
            imageHeight: prev?.imageHeight,
          };
          const nextTabs = deduplicateTabsByPath([...get().tabs, activeTab]);
          const resolvedId =
            nextTabs.find((t) => normalizeStudioFilePath(t.path) === normCleanPath)?.id || id;
          set({
            tabs: nextTabs,
            activeTabId: resolvedId,
            runnerCommand: '',
          });
          persistTabsToStorage(nextTabs, resolvedId, parentDir);
        } else if (isPdf || isImg || isMedia) {
          const prev = await getPreview(cleanPath, 4096);
          const extBadge = (
            prev.extension ||
            fallbackName.split('.').pop() ||
            (isPdf ? 'PDF' : isMedia ? 'MEDIA' : 'IMG')
          ).toUpperCase();
          activeTab = {
            id,
            path: prev.path || cleanPath,
            name: prev.name || fallbackName,
            language: isPdf ? 'pdf' : isMedia ? 'media' : 'image',
            content: '',
            savedContent: '',
            lineEnding: 'LF',
            encoding: extBadge,
            cursorLine: 1,
            cursorCol: 1,
            tabKind: isPdf ? ('pdf' as const) : isMedia ? ('media' as const) : ('image' as const),
            mediaSrc: prev.dataUri || `/__localmedia?path=${encodeURIComponent(cleanPath)}`,
            fileSize: prev.size,
            mimeType:
              prev.mimeType || (isPdf ? 'application/pdf' : isMedia ? 'video/*' : 'image/*'),
            imageWidth: prev.imageWidth,
            imageHeight: prev.imageHeight,
            pageCount: prev.pageCount,
          };
          const nextTabs = deduplicateTabsByPath([...get().tabs, activeTab]);
          const resolvedId =
            nextTabs.find((t) => normalizeStudioFilePath(t.path) === normCleanPath)?.id || id;
          set({
            tabs: nextTabs,
            activeTabId: resolvedId,
            runnerCommand: '',
            showDiffView: false,
          });
          persistTabsToStorage(nextTabs, resolvedId, parentDir);
        } else {
          const payload = await readTextFile(cleanPath);
          const lang = detectLanguageFromPath(payload.name || cleanPath);
          activeTab = {
            id,
            path: payload.path || cleanPath,
            name: payload.name || fallbackName,
            language: lang,
            content: payload.content,
            savedContent: payload.content,
            lineEnding: payload.lineEnding || 'LF',
            encoding: payload.encoding || 'UTF-8',
            cursorLine: 1,
            cursorCol: 1,
            tabKind: 'code',
          };
          const nextTabs = deduplicateTabsByPath([...get().tabs, activeTab]);
          const resolvedId =
            nextTabs.find((t) => normalizeStudioFilePath(t.path) === normCleanPath)?.id || id;
          set((s) => ({
            tabs: nextTabs,
            activeTabId: resolvedId,
            runnerCommand: defaultCommandForTab(activeTab!),
            showSplitPreview:
              lang === 'markdown' || lang === 'csv' || lang === 'html' ? true : s.showSplitPreview,
          }));
          persistTabsToStorage(nextTabs, resolvedId, parentDir);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg === 'IS_DIRECTORY' || (await isDirectoryPath(cleanPath))) {
          await get().openFolderInEditor(cleanPath, forceLocalModal);
          return;
        }
        console.error('Erro ao abrir arquivo no Pulsares Studio:', err);
        set({
          isOpen: true,
          statusMessage: `Não foi possível abrir o arquivo: ${errMsg}`,
        });
        setTimeout(() => {
          if (get().statusMessage?.startsWith('Não foi possível abrir o arquivo:')) {
            set({ statusMessage: null });
          }
        }, 5000);
        return;
      }
    } else {
      const resolvedLang =
        (!activeTab.tabKind || activeTab.tabKind === 'code') &&
        (!activeTab.language || activeTab.language === 'plaintext')
          ? detectLanguageFromPath(activeTab.name || activeTab.path)
          : activeTab.language;
      if (resolvedLang && resolvedLang !== activeTab.language) {
        activeTab = { ...activeTab, language: resolvedLang };
        const updatedTabs = get().tabs.map((t) =>
          t.id === activeTab!.id ? activeTab! : t
        );
        set({ tabs: updatedTabs });
      }
      set((s) => ({
        activeTabId: activeTab!.id,
        runnerCommand: defaultCommandForTab(activeTab!),
        showSplitPreview:
          resolvedLang === 'markdown' || resolvedLang === 'csv' || resolvedLang === 'html'
            ? true
            : s.showSplitPreview,
      }));
      persistTabsToStorage(get().tabs, activeTab.id, parentDir);
    }

    // Se estamos na janela do Explorador e preferSeparateWindow está ativo, abre/foca a janela nativa frameless do Studio primeiro (sem barra de URL wails.localhost)
    if (
      !forceLocalModal &&
      !get().isDedicatedStudio &&
      !isStandaloneStudioWindow() &&
      get().preferSeparateWindow
    ) {
      const openedNative = await openStudioWindowNative(path);
      if (openedNative) {
        set({ isOpen: false });
        return;
      }
      const openedPopup = spawnOrFocusSeparateStudioWindow(path, parentDir);
      if (openedPopup) {
        set({ isOpen: false });
        return;
      }
    }

    set({
      isOpen: true,
      isMinimized: false,
    });
  },

  openNewUntitledTab: (defaultDir?: string, language = 'plaintext', forceLocalModal = false) => {
    const dir = defaultDir || get().workspaceDir;
    const num = untitledSeq++;
    const ext =
      language === 'markdown'
        ? 'md'
        : language === 'json'
        ? 'json'
        : language === 'csv'
        ? 'csv'
        : language === 'sql'
        ? 'sql'
        : language === 'html'
        ? 'html'
        : language === 'css'
        ? 'css'
        : language === 'yaml'
        ? 'yml'
        : language === 'typescript'
        ? 'ts'
        : language === 'javascript'
        ? 'js'
        : language === 'go'
        ? 'go'
        : language === 'python'
        ? 'py'
        : 'txt';
    const id = `untitled-${Date.now()}-${num}`;
    const defaultContent =
      language === 'csv'
        ? 'id,nome,categoria,status\n1,Item Exemplo,Geral,Ativo\n'
        : language === 'json'
        ? '{\n  "id": 1,\n  "nome": "Exemplo"\n}\n'
        : '';
    const newTab: EditorTab = {
      id,
      path: '',
      name: `sem-titulo-${num}.${ext}`,
      language,
      content: defaultContent,
      savedContent: '',
      lineEnding: 'LF',
      encoding: 'UTF-8',
      cursorLine: 1,
      cursorCol: 1,
    };
    const nextTabs = [...get().tabs, newTab];
    set((s) => ({
      workspaceDir: dir,
      tabs: nextTabs,
      activeTabId: id,
      runnerCommand: defaultCommandForTab(newTab),
      showSplitPreview:
        language === 'markdown' || language === 'csv' ? true : s.showSplitPreview,
    }));
    persistTabsToStorage(nextTabs, id, dir);

    if (
      !forceLocalModal &&
      !get().isDedicatedStudio &&
      !isStandaloneStudioWindow() &&
      get().preferSeparateWindow
    ) {
      void openStudioWindowNative(dir).then((openedNative) => {
        if (openedNative) {
          set({ isOpen: false });
          return;
        }
        if (spawnOrFocusSeparateStudioWindow('', dir)) {
          set({ isOpen: false });
          return;
        }
        set({ isOpen: true, isMinimized: false });
      });
      return;
    }

    set({ isOpen: true, isMinimized: false });
  },

  detachToSeparateWindow: async () => {
    const { tabs, activeTabId, workspaceDir } = get();
    persistTabsToStorage(tabs, activeTabId, workspaceDir);
    const active = tabs.find((t) => t.id === activeTabId) || tabs[0];
    const ok = await openStudioWindowNative(active?.path || workspaceDir || '');
    if (ok) {
      set({ isOpen: false, preferSeparateWindow: true });
      return;
    }
    if (spawnOrFocusSeparateStudioWindow(active?.path || '', workspaceDir)) {
      set({ isOpen: false, preferSeparateWindow: true });
    }
  },

  closeTab: (id: string) => {
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== id);
      const nextActive =
        s.activeTabId === id
          ? remaining[remaining.length - 1]?.id || null
          : s.activeTabId;
      persistTabsToStorage(remaining, nextActive, s.workspaceDir);
      return {
        tabs: remaining,
        activeTabId: nextActive,
        isOpen:
          s.isDedicatedStudio || isStandaloneStudioWindow()
            ? true
            : remaining.length > 0
            ? s.isOpen
            : false,
      };
    });
  },

  closeOtherTabs: (id: string) => {
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id === id || t.pinned);
      persistTabsToStorage(remaining, id, s.workspaceDir);
      return {
        tabs: remaining,
        activeTabId: id,
      };
    });
  },

  syncTabAfterPathChange: (oldPath: string, newPath: string) => {
    if (!oldPath || !newPath) return;
    const normOld = oldPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const cleanNew = newPath.replace(/[\\/]+$/, '');
    set((s) => {
      let changed = false;
      const nextTabs: EditorTab[] = s.tabs.map((t): EditorTab => {
        if (!t.path) return t;
        const normTab = t.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        if (normTab === normOld) {
          changed = true;
          const nextName = cleanNew.split(/[/\\]/).pop() || t.name;
          const nextIsPdf = isStudioPdfFile(nextName);
          const nextIsImg = !nextIsPdf && isStudioImageFile(nextName);
          const nextIsMedia = !nextIsPdf && !nextIsImg && isStudioAudioVideoFile(nextName);
          const nextTabKind: EditorTab['tabKind'] = nextIsPdf
            ? 'pdf'
            : nextIsImg
            ? 'image'
            : nextIsMedia
            ? 'media'
            : 'code';
          return {
            ...t,
            path: cleanNew,
            name: nextName,
            tabKind: nextTabKind,
            language: nextIsPdf
              ? 'pdf'
              : nextIsMedia
              ? 'media'
              : nextIsImg && !nextName.toLowerCase().endsWith('.svg')
              ? 'image'
              : detectLanguageFromPath(nextName),
            mediaSrc: nextIsMedia
              ? `/__localmedia?path=${encodeURIComponent(cleanNew)}`
              : t.mediaSrc,
          };
        }
        if (normTab.startsWith(`${normOld}/`)) {
          changed = true;
          const sep = cleanNew.includes('\\') ? '\\' : '/';
          const relSuffix = t.path
            .slice(oldPath.replace(/[\\/]+$/, '').length)
            .replace(/^[/\\]+/, '');
          const updatedPath = `${cleanNew}${sep}${relSuffix}`;
          return {
            ...t,
            path: updatedPath,
          };
        }
        return t;
      });
      const normWs = (s.workspaceDir || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      const nextWs = normWs === normOld ? cleanNew : s.workspaceDir;
      if (changed || nextWs !== s.workspaceDir) {
        persistTabsToStorage(nextTabs, s.activeTabId, nextWs);
        return { tabs: nextTabs, workspaceDir: nextWs };
      }
      return {};
    });
  },

  closeTabsForDeletedPath: (deletedPath: string) => {
    if (!deletedPath) return;
    const normDel = deletedPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    set((s) => {
      const remaining = s.tabs.filter((t) => {
        if (!t.path) return true;
        const normTab = t.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        return normTab !== normDel && !normTab.startsWith(`${normDel}/`);
      });
      if (remaining.length === s.tabs.length) return {};
      const nextActive = remaining.some((t) => t.id === s.activeTabId)
        ? s.activeTabId
        : remaining[remaining.length - 1]?.id || null;
      persistTabsToStorage(remaining, nextActive, s.workspaceDir);
      return {
        tabs: remaining,
        activeTabId: nextActive,
      };
    });
  },

  togglePinTab: (id: string) => {
    set((s) => {
      const nextTabs = s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return { tabs: nextTabs };
    });
  },

  setActiveTab: (id: string) => {
    const tab = get().tabs.find((t) => t.id === id);
    set((s) => ({
      activeTabId: id,
      runnerCommand: tab ? defaultCommandForTab(tab) : s.runnerCommand,
      showSplitPreview:
        tab && (tab.language === 'markdown' || tab.language === 'csv' || tab.language === 'html')
          ? true
          : s.showSplitPreview,
    }));
  },

  updateTabContent: (id: string, content: string) => {
    set((s) => {
      const nextTabs = s.tabs.map((t) => (t.id === id ? { ...t, content } : t));
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return { tabs: nextTabs };
    });
  },

  revertTabContent: (id: string) => {
    set((s) => {
      const nextTabs = s.tabs.map((t) =>
        t.id === id ? { ...t, content: t.savedContent } : t
      );
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return {
        tabs: nextTabs,
        statusMessage: 'Alterações revertidas para a versão salva em disco',
      };
    });
  },

  updateCursor: (id: string, line: number, col: number) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, cursorLine: line, cursorCol: col } : t
      ),
    }));
  },

  setTabLanguage: (id: string, language: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, language } : t)),
      showSplitPreview:
        language === 'markdown' || language === 'csv' || language === 'html'
          ? true
          : s.showSplitPreview,
    }));
  },

  setTabSvgViewMode: (id: string, mode: 'preview' | 'code') => {
    set((s) => {
      const nextTabs = s.tabs.map((t) =>
        t.id === id ? { ...t, svgViewMode: mode } : t
      );
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return { tabs: nextTabs };
    });
  },

  updateTabMediaMeta: (id, meta) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...meta } : t)),
    }));
  },

  toggleLineEnding: (id: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id || isBinaryMediaTab(t)) return t;
        const nextLE = t.lineEnding === 'LF' ? 'CRLF' : 'LF';
        const normalized = t.content.replace(/\r\n/g, '\n');
        const nextContent =
          nextLE === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized;
        return { ...t, lineEnding: nextLE, content: nextContent };
      }),
    }));
  },

  saveTab: async (id: string, fallbackDir?: string) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || isBinaryMediaTab(tab)) return false;

    try {
      let targetPath = tab.path;
      if (!targetPath) {
        const dir = fallbackDir || get().workspaceDir || '.';
        targetPath = await createFile(dir, tab.name);
      }
      await writeTextFile(targetPath, tab.content);
      set((s) => {
        const nextTabs = s.tabs.map((t) =>
          t.id === id
            ? { ...t, path: targetPath, savedContent: t.content }
            : t
        );
        persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
        return {
          tabs: nextTabs,
          statusMessage: `Salvo: ${tab.name}`,
        };
      });
      const ch = getChannel();
      if (ch) {
        ch.postMessage({ type: 'STUDIO_FILE_SAVED', path: targetPath });
      }
      setTimeout(() => {
        if (get().statusMessage === `Salvo: ${tab.name}`) {
          set({ statusMessage: null });
        }
      }, 2500);
      return true;
    } catch (err) {
      set({
        statusMessage: `Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`,
      });
      return false;
    }
  },

  saveAllTabs: async (fallbackDir?: string) => {
    const { tabs, saveTab } = get();
    for (const tab of tabs) {
      if (tab.content !== tab.savedContent || !tab.path) {
        await saveTab(tab.id, fallbackDir);
      }
    }
  },

  formatActiveTab: () => {
    const { activeTabId, tabs, tabSize } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || isTabMediaPreviewActive(tab)) return;

    const sep = tab.lineEnding === 'CRLF' ? '\r\n' : '\n';
    const indentUnit = ' '.repeat(tabSize);
    let formatted = tab.content;
    let statusMsg = `Código formatado (${tab.language.toUpperCase()})`;

    const stripStringsAndComments = (line: string): string =>
      line
        .replace(/\/\/.*$/, '')
        .replace(/\/\*.*?\*\//g, '')
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/`(?:\\.|[^`\\])*`/g, '``');

    if (tab.language === 'json') {
      const trimmed = tab.content.trim();
      if (!trimmed) return;
      try {
        // Suporte a JSON padrão e remoção tolerante de vírgulas finais simples
        const cleaned = trimmed.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(cleaned);
        formatted = JSON.stringify(parsed, null, tabSize).replace(/\n/g, sep);
        statusMsg = 'JSON formatado e validado com sucesso';
      } catch (err) {
        // Tenta JSON Lines (.jsonl) se houver múltiplas linhas
        const rawLines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (rawLines.length > 1) {
          try {
            const parsedLines = rawLines.map((l) => JSON.stringify(JSON.parse(l.trim())));
            formatted = parsedLines.join(sep);
            statusMsg = 'JSON Lines (.jsonl) normalizado com sucesso';
          } catch {
            set({
              statusMessage: `Erro ao formatar JSON: ${err instanceof Error ? err.message : 'Sintaxe inválida'}`,
            });
            return;
          }
        } else {
          set({
            statusMessage: `Erro ao formatar JSON: ${err instanceof Error ? err.message : 'Sintaxe inválida'}`,
          });
          return;
        }
      }
    } else if (tab.language === 'csv') {
      const table = parseCsvTable(tab.content);
      if (table.headers.length > 0) {
        const maxCols = table.maxCols;
        const normalizedHeaders = [...table.headers];
        while (normalizedHeaders.length < maxCols) {
          normalizedHeaders.push(`Col_${normalizedHeaders.length + 1}`);
        }
        const normalizedRows = table.rows.map((r) => {
          const copy = r.map((c) => c.trim());
          while (copy.length < maxCols) copy.push('');
          return copy;
        });
        formatted = serializeCsvTable(
          normalizedHeaders,
          normalizedRows,
          table.delimiter,
          tab.lineEnding
        );
        statusMsg = `CSV formatado (${normalizedRows.length} registros × ${maxCols} colunas)`;
      }
    } else if (tab.language === 'html' || tab.language === 'xml') {
      const voidTags = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr',
      ]);
      const normalized = tab.content
        .replace(/\r\n/g, '\n')
        .replace(/>\s+</g, '>\n<');
      const rawLines = normalized.split('\n');
      let level = 0;
      const out: string[] = [];
      for (const raw of rawLines) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const isClosing = /^<\/[a-zA-Z0-9_:-]+/.test(trimmed);
        if (isClosing) {
          level = Math.max(0, level - 1);
        }
        out.push(indentUnit.repeat(level) + trimmed);
        const openMatch = trimmed.match(/^<([a-zA-Z0-9_:-]+)(?:\s[^>]*)?>$/);
        const hasInlineClose = /<\/[a-zA-Z0-9_:-]+>\s*$/.test(trimmed);
        const isSelfClosing = /\/>$/.test(trimmed) || /^<![a-zA-Z-]/.test(trimmed) || /^<\?/.test(trimmed);
        if (openMatch && !hasInlineClose && !isSelfClosing) {
          const tagName = openMatch[1].toLowerCase();
          if (tab.language === 'xml' || !voidTags.has(tagName)) {
            level += 1;
          }
        }
      }
      formatted = out.join(sep);
      statusMsg = `${tab.language.toUpperCase()} indentado e estruturado com sucesso`;
    } else if (tab.language === 'sql') {
      const majorClauses = [
        'SELECT', 'FROM', 'WHERE', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
        'FULL JOIN', 'JOIN', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT',
        'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
        'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'UNION ALL', 'UNION',
      ];
      const upperKeywords = [
        ...majorClauses,
        'AS', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'EXISTS',
        'BETWEEN', 'LIKE', 'ILIKE', 'ASC', 'DESC', 'DISTINCT', 'COUNT',
        'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
        'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'DEFAULT', 'IF NOT EXISTS',
      ];
      let work = tab.content.replace(/\r\n/g, '\n');
      for (const kw of upperKeywords) {
        const pattern = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
        work = work.replace(pattern, kw);
      }
      for (const clause of majorClauses) {
        const pattern = new RegExp(`\\s+\\b(${clause})\\b`, 'g');
        work = work.replace(pattern, `\n$1`);
      }
      work = work.replace(/\s+\b(AND|OR)\b\s+/g, `\n${indentUnit}$1 `);
      formatted = work
        .split('\n')
        .map((l) => l.replace(/[ \t]+$/, ''))
        .join(sep);
      statusMsg = 'Consulta SQL formatada e padronizada';
    } else if (tab.language === 'markdown') {
      const rawLines = tab.content.replace(/\r\n/g, '\n').split('\n');
      const out: string[] = [];
      let i = 0;
      while (i < rawLines.length) {
        const line = rawLines[i];
        // Alinha tabelas Markdown automaticamente
        if (/^\s*\|.*\|\s*$/.test(line)) {
          const tableLines: string[] = [];
          while (i < rawLines.length && /^\s*\|.*\|\s*$/.test(rawLines[i])) {
            tableLines.push(rawLines[i].trim());
            i++;
          }
          const parsedRows = tableLines.map((tl) =>
            tl
              .replace(/^\||\|$/g, '')
              .split('|')
              .map((c) => c.trim())
          );
          const colCount = parsedRows.reduce((m, r) => Math.max(m, r.length), 0);
          const colWidths = new Array<number>(colCount).fill(3);
          parsedRows.forEach((r) => {
            r.forEach((cell, idx) => {
              if (!/^:?-+:?$/.test(cell)) {
                colWidths[idx] = Math.max(colWidths[idx], cell.length);
              }
            });
          });
          parsedRows.forEach((r) => {
            const cells = Array.from({ length: colCount }, (_, idx) => {
              const val = r[idx] ?? '';
              if (/^:?-+:?$/.test(val)) {
                const left = val.startsWith(':') ? ':' : '-';
                const right = val.endsWith(':') ? ':' : '-';
                return left + '-'.repeat(Math.max(1, colWidths[idx] - 2)) + right;
              }
              return val.padEnd(colWidths[idx], ' ');
            });
            out.push(`| ${cells.join(' | ')} |`);
          });
          continue;
        }
        // Normaliza títulos (#Titulo -> # Titulo) sem afetar blocos de código
        const normalizedHeading = line.replace(/^(#{1,6})([^\s#])/, '$1 $2').replace(/[ \t]+$/, '');
        out.push(normalizedHeading);
        i++;
      }
      formatted = out.join(sep);
      statusMsg = 'Markdown e tabelas alinhados com sucesso';
    } else if (['yaml', 'toml', 'ini'].includes(tab.language)) {
      const rawLines = tab.content.replace(/\r\n/g, '\n').split('\n');
      const out = rawLines.map((raw) => {
        const trimmedRight = raw.replace(/[ \t]+$/, '');
        if (!trimmedRight.trim() || trimmedRight.trim().startsWith('#') || trimmedRight.trim().startsWith(';')) {
          return trimmedRight;
        }
        if (tab.language === 'ini' || tab.language === 'toml') {
          return trimmedRight.replace(/^(\s*[A-Za-z0-9_.-]+)\s*=\s*(.+)$/, '$1 = $2');
        }
        return trimmedRight.replace(/^(\s*[A-Za-z0-9_.-]+):(?=\S)/, '$1: ');
      });
      formatted = out.join(sep);
      statusMsg = `Configuração ${tab.language.toUpperCase()} formatada`;
    } else if (tab.language === 'python') {
      const rawLines = tab.content.replace(/\r\n/g, '\n').split('\n');
      const out = rawLines.map((line) => {
        const leadingTabs = line.match(/^\t+/);
        const replacedTabs = leadingTabs
          ? ' '.repeat(leadingTabs[0].length * 4) + line.slice(leadingTabs[0].length)
          : line;
        return replacedTabs.replace(/[ \t]+$/, '');
      });
      formatted = out.join(sep);
      statusMsg = 'Código Python formatado (PEP 8 espaços)';
    } else if (
      [
        'javascript',
        'typescript',
        'go',
        'rust',
        'c',
        'cpp',
        'java',
        'csharp',
        'css',
        'php',
        'powershell',
        'shell',
      ].includes(tab.language)
    ) {
      const rawLines = tab.content.replace(/\r\n/g, '\n').split('\n');
      let level = 0;
      const out: string[] = [];
      for (const raw of rawLines) {
        const trimmed = raw.trim();
        if (!trimmed) {
          if (out.length === 0 || out[out.length - 1] !== '') {
            out.push('');
          }
          continue;
        }
        const clean = stripStringsAndComments(trimmed);
        const startsWithClose = /^[}\])]/.test(clean);
        if (startsWithClose) {
          level = Math.max(0, level - 1);
        }
        out.push(indentUnit.repeat(level) + trimmed);
        const opens = (clean.match(/[{[(]/g) || []).length;
        const closes = (clean.match(/[}\])]/g) || []).length;
        const net = opens - closes + (startsWithClose ? 1 : 0);
        level = Math.max(0, level + net);
      }
      formatted = out.join(sep);
      statusMsg = `Código ${tab.language.toUpperCase()} indentado e formatado`;
    } else {
      formatted = tab.content
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join(sep);
    }

    set((s) => {
      const nextTabs = s.tabs.map((t) =>
        t.id === tab.id ? { ...t, content: formatted } : t
      );
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return {
        tabs: nextTabs,
        statusMessage: statusMsg,
      };
    });
  },

  transformActiveTab: (kind: DevTransformKind) => {
    const { activeTabId, tabs, tabSize } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || isTabMediaPreviewActive(tab)) return;

    const sep = tab.lineEnding === 'CRLF' ? '\r\n' : '\n';
    const raw = tab.content;
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    let nextContent = raw;
    let nextLanguage = tab.language;
    let customStatus = 'Transformação aplicada';

    try {
      switch (kind) {
        case 'sortAsc':
          nextContent = [...lines].sort((a, b) => a.localeCompare(b)).join(sep);
          break;
        case 'sortDesc':
          nextContent = [...lines].sort((a, b) => b.localeCompare(a)).join(sep);
          break;
        case 'dedupe':
          nextContent = Array.from(new Set(lines)).join(sep);
          break;
        case 'removeEmpty':
          nextContent = lines.filter((l) => l.trim().length > 0).join(sep);
          break;
        case 'trimTrailing':
          nextContent = lines.map((l) => l.replace(/[ \t]+$/, '')).join(sep);
          break;
        case 'upper':
          nextContent = raw.toUpperCase();
          break;
        case 'lower':
          nextContent = raw.toLowerCase();
          break;
        case 'camelCase':
          nextContent = lines
            .map((l) =>
              l.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
            )
            .join(sep);
          break;
        case 'snakeCase':
          nextContent = lines
            .map((l) =>
              l
                .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
                .replace(/[-\s]+/g, '_')
                .toLowerCase()
            )
            .join(sep);
          break;
        case 'kebabCase':
          nextContent = lines
            .map((l) =>
              l
                .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
                .replace(/[_\s]+/g, '-')
                .toLowerCase()
            )
            .join(sep);
          break;
        case 'jsonPretty':
          nextContent = JSON.stringify(JSON.parse(raw), null, tabSize).replace(/\n/g, sep);
          customStatus = 'JSON formatado (Pretty Print)';
          break;
        case 'jsonMinify':
          nextContent = JSON.stringify(JSON.parse(raw));
          customStatus = 'JSON minificado em linha única';
          break;
        case 'jsonEscape':
          nextContent = JSON.stringify(raw);
          break;
        case 'jsonUnescape': {
          const parsed = JSON.parse(raw.trim().startsWith('"') ? raw.trim() : `"${raw}"`);
          nextContent = String(parsed);
          break;
        }
        case 'csvToJson':
          nextContent = csvToJsonString(raw, tabSize).replace(/\n/g, sep);
          nextLanguage = 'json';
          customStatus = 'CSV convertido para JSON estruturado';
          break;
        case 'jsonToCsv':
          nextContent = jsonToCsvString(raw, tab.lineEnding);
          nextLanguage = 'csv';
          customStatus = 'JSON convertido para Tabela CSV';
          break;
        case 'csvAlign':
          nextContent = alignCsvColumns(raw, tab.lineEnding);
          customStatus = 'Colunas CSV alinhadas visualmente';
          break;
        case 'base64Encode': {
          const bytes = new TextEncoder().encode(raw);
          let bin = '';
          bytes.forEach((b) => (bin += String.fromCharCode(b)));
          nextContent = btoa(bin);
          break;
        }
        case 'base64Decode': {
          const bin = atob(raw.trim());
          const bytes = Uint8Array.from(bin, (m) => m.codePointAt(0) ?? 0);
          nextContent = new TextDecoder('utf-8').decode(bytes);
          break;
        }
        case 'urlEncode':
          nextContent = encodeURIComponent(raw);
          break;
        case 'urlDecode':
          nextContent = decodeURIComponent(raw);
          break;
        case 'jwtDecode': {
          const parts = raw.trim().split('.');
          if (parts.length >= 2) {
            const decodePart = (p: string) => {
              const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
              return JSON.parse(atob(b64));
            };
            nextContent = JSON.stringify(
              {
                header: decodePart(parts[0]),
                payload: decodePart(parts[1]),
                signature: parts[2] || '',
              },
              null,
              2
            );
          }
          break;
        }
      }
    } catch (err) {
      set({
        statusMessage: `Falha na transformação: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    set((s) => {
      const nextTabs = s.tabs.map((t) =>
        t.id === tab.id ? { ...t, content: nextContent, language: nextLanguage } : t
      );
      persistTabsToStorage(nextTabs, s.activeTabId, s.workspaceDir);
      return {
        tabs: nextTabs,
        statusMessage: customStatus,
      };
    });
  },

  runStudioScript: async (cwd: string, customCmd?: string) => {
    const st = get();
    const active = st.tabs.find((t) => t.id === st.activeTabId) || st.tabs[0];
    const cmdToRun = (customCmd ?? st.runnerCommand).trim() || (active ? defaultCommandForTab(active) : '');
    if (!cmdToRun) return;

    // Se o arquivo ativo tiver alterações pendentes e caminho válido, salva antes de executar
    if (active && active.path && active.content !== active.savedContent) {
      await st.saveTab(active.id, cwd);
    }

    set({
      runnerOpen: true,
      runnerLoading: true,
      runnerCommand: cmdToRun,
    });

    const targetCwd =
      (active?.path ? active.path.replace(/[/\\][^/\\]+$/, '') : '') ||
      cwd ||
      st.workspaceDir;

    try {
      const res = await runStudioCommand(targetCwd, cmdToRun);
      set({
        runnerLoading: false,
        runnerResult: res,
      });
    } catch (err) {
      set({
        runnerLoading: false,
        runnerResult: {
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          exitCode: 1,
          durationMs: 0,
        },
      });
    }
  },

  setWorkspaceDir: (workspaceDir) => set({ workspaceDir }),
  setEditorOpen: (isOpen) => set({ isOpen, isMinimized: false }),
  setMinimized: (isMinimized) => set({ isMinimized }),
  toggleMaximized: () => set((s) => ({ isMaximized: !s.isMaximized, isMinimized: false })),
  setPreferSeparateWindow: (preferSeparateWindow) => set({ preferSeparateWindow }),
  setFontSize: (size) => set({ fontSize: Math.max(10, Math.min(26, size)) }),
  setTabSize: (tabSize) => set({ tabSize }),
  toggleWordWrap: () =>
    set((s) => ({
      wordWrap: !s.wordWrap,
      statusMessage: !s.wordWrap
        ? 'Quebra automática de linha (Alt+Z): ATIVADA'
        : 'Quebra automática de linha (Alt+Z): DESATIVADA',
    })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleSplitPreview: () => set((s) => ({ showSplitPreview: !s.showSplitPreview, showDiffView: false })),
  toggleDiffView: () => set((s) => ({ showDiffView: !s.showDiffView, showSplitPreview: false })),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setFindBarOpen: (findBarOpen) => set({ findBarOpen }),
  setQuickOpenVisible: (quickOpenVisible) => set({ quickOpenVisible }),
  setRunnerOpen: (runnerOpen) => set({ runnerOpen }),
  setRunnerCommand: (runnerCommand) => set({ runnerCommand }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
}));
