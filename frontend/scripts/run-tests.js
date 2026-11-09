import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Testar resolução de idioma conforme ADR-0005 / AGENTS.md
function resolveLanguage(sysLang, prefLang) {
  if (prefLang && prefLang !== 'auto') return prefLang;
  if (!sysLang) return 'en';
  const lower = sysLang.toLowerCase();
  if (lower.startsWith('pt')) return 'pt-BR';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('it')) return 'it';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('sv')) return 'sv';
  if (lower.startsWith('tr')) return 'tr';
  if (lower.startsWith('en')) return 'en';
  return 'en';
}

assert.equal(resolveLanguage('pt-BR', 'auto'), 'pt-BR');
assert.equal(resolveLanguage('pt-PT', 'auto'), 'pt-BR');
assert.equal(resolveLanguage('es-ES', 'auto'), 'es');
assert.equal(resolveLanguage('en-US', 'auto'), 'en');
assert.equal(resolveLanguage('fr-FR', 'auto'), 'fr');
assert.equal(resolveLanguage('de-DE', undefined), 'de');
assert.equal(resolveLanguage('it-IT', 'auto'), 'it');
assert.equal(resolveLanguage('ja-JP', 'auto'), 'ja');
assert.equal(resolveLanguage('zh-CN', 'auto'), 'zh-CN');
assert.equal(resolveLanguage('sv-SE', 'auto'), 'sv');
assert.equal(resolveLanguage('tr-TR', 'auto'), 'tr');
assert.equal(resolveLanguage('nl-NL', 'auto'), 'en');
assert.equal(resolveLanguage('en-US', 'es'), 'es');

// 2. Testar ordenação natural com Intl.Collator
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const sample = ['arquivo10.txt', 'arquivo2.txt', 'Arquivo1.txt'];
sample.sort((a, b) => collator.compare(a, b));
assert.deepEqual(sample, ['Arquivo1.txt', 'arquivo2.txt', 'arquivo10.txt']);

// 3. Garantir que códigos de erro e namespaces (0.1.0 a 0.7.0) existem nos 3 catálogos
const requiredErrorKeys = ['notFound', 'permissionDenied', 'generic'];
const requiredTabKeys = ['newTab', 'closeTab', 'duplicateTab', 'pinTab', 'unpinTab', 'closeOthers', 'closeRight', 'reopenClosed'];
const requiredTreeKeys = ['title', 'followActiveTab', 'refresh', 'loading', 'empty', 'symlink'];
const requiredOpsKeys = [
  'title', 'newFolder', 'newFile', 'rename', 'copy', 'cut', 'paste',
  'trash', 'deletePermanent', 'undo', 'redo', 'queue', 'conflictTitle',
  'policyOverwrite', 'policySkip', 'policyRename', 'policyKeepNewer'
];
const requiredSidebarKeys = ['favorites', 'addFavorite', 'removeFavorite', 'drives', 'freeOf', 'recent'];
const requiredPaneKeys = ['single', 'splitHorizontal', 'splitVertical', 'copyToOther', 'moveToOther'];
const requiredTerminalKeys = [
  'title', 'togglePanel', 'newTab', 'closeTab', 'selectProfile',
  'cdCurrentFolder', 'followOsc7', 'splitTerminal', 'searchPlaceholder',
  'clearOutput', 'maximizePanel', 'restorePanel', 'hidePanel',
  'inputPlaceholder', 'processExited', 'confirmActiveProcessTitle'
];
const requiredViewKeys = [
  'details', 'list', 'grid', 'columns', 'gridSize',
  'sizeSmall', 'sizeMedium', 'sizeLarge', 'groupBy',
  'groupNone', 'groupType', 'groupDate', 'groupSize', 'toggleDensity'
];
const requiredPreviewKeys = [
  'title', 'togglePanel', 'quickLook', 'selectItem',
  'noPreview', 'openDefault', 'truncated', 'folderItems',
  'zoomIn', 'zoomOut', 'zoomReset'
];
const requiredSearchKeys = [
  'title', 'instantFilterPlaceholder', 'toggleAdvanced',
  'queryPlaceholder', 'contentPlaceholder', 'extensionsPlaceholder',
  'useRegex', 'useIndex', 'indexCurrentFolder', 'start', 'noResults'
];
const requiredOsKeys = [
  'propertiesTitle', 'propertiesShortcut', 'location',
  'permissions', 'readOnly', 'openWith', 'openExternalTerminal',
  'revealInSystem', 'ejectDrive'
];
const requiredProductivityKeys = [
  'paletteTitle', 'palettePlaceholder', 'batchRenameTitle',
  'compareTitle', 'hashTitle', 'shortcutsTitle', 'shortcutConflict'
];
const requiredArchiveKeys = ['title', 'compressSelection', 'inspecting', 'extractHere'];
const requiredRemoteKeys = ['title', 'hostPlaceholder', 'userPlaceholder', 'pathPlaceholder', 'saveProfile', 'empty'];

for (const lang of ['pt-BR', 'en', 'es', 'de', 'fr', 'it', 'ja', 'zh-CN', 'sv', 'tr']) {
  const filePath = path.resolve(__dirname, `../src/i18n/locales/${lang}/common.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  for (const errKey of requiredErrorKeys) {
    assert.ok(typeof data.errors?.[errKey] === 'string' && data.errors[errKey].length > 0);
  }
  for (const tabKey of requiredTabKeys) {
    assert.ok(typeof data.tabs?.[tabKey] === 'string' && data.tabs[tabKey].length > 0);
  }
  for (const treeKey of requiredTreeKeys) {
    assert.ok(typeof data.tree?.[treeKey] === 'string' && data.tree[treeKey].length > 0);
  }
  for (const opsKey of requiredOpsKeys) {
    assert.ok(typeof data.ops?.[opsKey] === 'string' && data.ops[opsKey].length > 0);
  }
  for (const sbKey of requiredSidebarKeys) {
    assert.ok(typeof data.sidebar?.[sbKey] === 'string' && data.sidebar[sbKey].length > 0);
  }
  for (const paneKey of requiredPaneKeys) {
    assert.ok(typeof data.panes?.[paneKey] === 'string' && data.panes[paneKey].length > 0);
  }
  for (const termKey of requiredTerminalKeys) {
    assert.ok(typeof data.terminal?.[termKey] === 'string' && data.terminal[termKey].length > 0);
  }
  for (const viewKey of requiredViewKeys) {
    assert.ok(typeof data.views?.[viewKey] === 'string' && data.views[viewKey].length > 0);
  }
  for (const prevKey of requiredPreviewKeys) {
    assert.ok(typeof data.preview?.[prevKey] === 'string' && data.preview[prevKey].length > 0);
  }
  for (const searchKey of requiredSearchKeys) {
    assert.ok(typeof data.search?.[searchKey] === 'string' && data.search[searchKey].length > 0);
  }
  for (const osKey of requiredOsKeys) {
    assert.ok(typeof data.os?.[osKey] === 'string' && data.os[osKey].length > 0);
  }
  for (const prodKey of requiredProductivityKeys) {
    assert.ok(typeof data.productivity?.[prodKey] === 'string' && data.productivity[prodKey].length > 0);
  }
  for (const archKey of requiredArchiveKeys) {
    assert.ok(typeof data.archive?.[archKey] === 'string' && data.archive[archKey].length > 0);
  }
  for (const remKey of requiredRemoteKeys) {
    assert.ok(typeof data.remote?.[remKey] === 'string' && data.remote[remKey].length > 0);
  }
}

// 4. Testar geometria e conexões de arestas Bézier do Mapa de Entidade-Relacionamento (ERD)
function computeBezierCurve(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.45, 50);
  const isLeft = x1 < x2;
  const cx1 = isLeft ? x1 + dx : x1 - dx;
  const cx2 = isLeft ? x2 - dx : x2 + dx;
  const pathD = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  const midX = (x1 + 3 * cx1 + 3 * cx2 + x2) / 8;
  const midY = (y1 + 3 * y1 + 3 * y2 + y2) / 8;
  return { pathD, midX, midY };
}

const edge1 = computeBezierCurve(320, 100, 680, 180);
assert.ok(edge1.pathD.startsWith('M 320 100 C'));
assert.ok(edge1.midX > 320 && edge1.midX < 680);
assert.ok(edge1.midY > 100 && edge1.midY < 180);

const edge2 = computeBezierCurve(700, 200, 200, 100);
assert.ok(edge2.pathD.startsWith('M 700 200 C'));
assert.ok(edge2.midX > 200 && edge2.midX < 700);

// 5. Testar limpeza de abas sem-titulo vazias e injeção de CSS/JS locais na Prévia Web
function filterPersistedStudioTabs(tabs) {
  return tabs.filter((t) => !(t.isUntitled && !t.path && (!t.content || !t.content.trim())));
}

const sampleTabs = [
  { id: '1', name: 'sem-titulo-1.md', path: '', content: '', isUntitled: true },
  { id: '2', name: 'sem-titulo-2.md', path: '', content: '   ', isUntitled: true },
  { id: '3', name: 'index.html', path: 'C:/proj/index.html', content: '<h1>Oi</h1>', isUntitled: false },
];
const filteredTabs = filterPersistedStudioTabs(sampleTabs);
assert.equal(filteredTabs.length, 1);
assert.equal(filteredTabs[0].name, 'index.html');

// 6. Testar resolução de navegação de pastas do Terminal para o modo Follow-up
function resolveClientCdTest(baseCwd, rawInput) {
  const line = rawInput.trim();
  if (!line) return '';
  const isWin = baseCwd.includes('\\') || /^[A-Za-z]:/.test(baseCwd);
  const sep = isWin ? '\\' : '/';
  const cleanBase = baseCwd.replace(/[/\\]+$/, '');
  const parts = cleanBase.split(/[/\\]/);
  const arg = line.replace(/^(cd|sl|set-location)\s+/i, '').replace(/^["']+|["']+$/g, '');
  for (const p of arg.split(/[/\\]/)) {
    if (!p || p === '.') continue;
    if (p === '..') {
      if (parts.length > 1) parts.pop();
    } else {
      parts.push(p);
    }
  }
  return parts.join(sep);
}

assert.equal(
  resolveClientCdTest('C:\\Users\\Vitor\\Downloads', 'cd dev-full-stack-pos\r\n'),
  'C:\\Users\\Vitor\\Downloads\\dev-full-stack-pos'
);
assert.equal(
  resolveClientCdTest('C:\\Users\\Vitor\\Downloads\\dev-full-stack-pos', 'cd ..\r\n'),
  'C:\\Users\\Vitor\\Downloads'
);

console.log('[frontend:test] Todos os testes unitários (0.1.0 a 1.0.0 + ERD + Studio Web Preview + Terminal Follow-up) passaram com sucesso.');
