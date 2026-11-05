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
  if (lower.startsWith('en')) return 'en';
  return 'en';
}

assert.equal(resolveLanguage('pt-BR', 'auto'), 'pt-BR');
assert.equal(resolveLanguage('pt-PT', 'auto'), 'pt-BR');
assert.equal(resolveLanguage('es-ES', 'auto'), 'es');
assert.equal(resolveLanguage('en-US', 'auto'), 'en');
assert.equal(resolveLanguage('fr-FR', 'auto'), 'en');
assert.equal(resolveLanguage('de-DE', undefined), 'en');
assert.equal(resolveLanguage('en-US', 'es'), 'es');

// 2. Testar ordenação natural com Intl.Collator
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const sample = ['arquivo10.txt', 'arquivo2.txt', 'Arquivo1.txt'];
sample.sort((a, b) => collator.compare(a, b));
assert.deepEqual(sample, ['Arquivo1.txt', 'arquivo2.txt', 'arquivo10.txt']);

// 3. Garantir que códigos de erro e namespaces (0.1.0 a 0.6.0) existem nos 3 catálogos
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

for (const lang of ['pt-BR', 'en', 'es']) {
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
}

console.log('[frontend:test] Todos os testes unitários (0.1.0 a 0.6.0) passaram com sucesso.');
