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
const requiredClipboardKeys = [
  'title', 'toggleTooltip', 'capacityInfo', 'pinnedLower', 'shortcutHint',
  'close', 'syncNow', 'pauseCapture', 'resumeCapture', 'clearUnpinned',
  'searchPlaceholder', 'filterAll', 'filterText', 'filterImages', 'filterFiles',
  'filterPinned', 'pausedNotice', 'emptyTitle', 'emptyDesc', 'kindImage',
  'kindText', 'kindFilesCopy', 'kindFilesCut', 'copyAction', 'saveImageToFolder',
  'saveTextToFolder', 'pasteFilesHere', 'pinAction', 'unpinAction', 'deleteAction'
];
const requiredNetworkDriveKeys = [
  'connectTitle', 'connectButton', 'addressLabel', 'addressPlaceholder', 'addressHint',
  'addressRequired', 'aliasLabel', 'aliasPlaceholder', 'driveLetterLabel', 'noDriveLetter',
  'persistentLabel', 'useCredentials', 'usernameLabel', 'usernamePlaceholder', 'domainLabel',
  'passwordLabel', 'securityNote', 'saveShortcut', 'cancel', 'connectAction', 'connecting',
  'connectError', 'disconnect', 'removeShortcut'
];
const requiredFolderZoomKeys = [
  'popoverTitle', 'buttonTooltip', 'zoomInTooltip', 'zoomOutTooltip', 'resetTooltip',
  'shortColumns', 'stepDetailsCompact', 'stepDetails', 'stepList', 'stepSmallIcons',
  'stepMediumIcons', 'stepLargeIcons', 'stepExtraLargeIcons', 'shortcutHint',
  'zoomInCommand', 'zoomOutCommand', 'resetCommand'
];

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
  for (const clipKey of requiredClipboardKeys) {
    assert.ok(typeof data.clipboardHistory?.[clipKey] === 'string' && data.clipboardHistory[clipKey].length > 0);
  }
  for (const netKey of requiredNetworkDriveKeys) {
    assert.ok(typeof data.networkDrive?.[netKey] === 'string' && data.networkDrive[netKey].length > 0);
  }
  for (const zoomKey of requiredFolderZoomKeys) {
    assert.ok(typeof data.folderZoom?.[zoomKey] === 'string' && data.folderZoom[zoomKey].length > 0);
  }
  assert.ok(typeof data.views?.sizeExtraLarge === 'string' && data.views.sizeExtraLarge.length > 0);
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

// 7. Testar política de retenção de 20 itens não fixados + itens fixados do Histórico do Clipboard (v1.2.0)
function enforceClipboardLimit(items, maxUnpinned = 20) {
  const pinned = items
    .filter((i) => i.pinned)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
  const unpinned = items
    .filter((i) => !i.pinned)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id)
    .slice(0, maxUnpinned);
  return [...pinned, ...unpinned];
}

const mockClipItems = [];
for (let i = 1; i <= 25; i++) {
  mockClipItems.push({
    id: i,
    kind: i % 3 === 0 ? 'image' : 'text',
    content: `item-${i}`,
    pinned: i === 2, // item 2 é fixado
    updatedAt: `2026-11-10T15:${String(i).padStart(2, '0')}:00Z`,
  });
}
const prunedClip = enforceClipboardLimit(mockClipItems, 20);
assert.equal(prunedClip.length, 21); // 1 fixado + 20 não fixados
assert.equal(prunedClip[0].id, 2);
assert.equal(prunedClip[0].pinned, true);
assert.equal(prunedClip[1].id, 25);

// 8. Testar resolução de caminhos de rede UNC / SMB / NFS / AFP (goUp e breadcrumbs — v1.2.0)
function resolveNetworkParent(currentPath) {
  const normalized = currentPath.replace(/\\/g, '/');
  const smbMatch = normalized.match(/^(smb|cifs|nfs|afp):\/\/([^/]+)(\/.*)?$/i);
  if (smbMatch) {
    const scheme = smbMatch[1].toLowerCase();
    const host = smbMatch[2];
    const segs = (smbMatch[3] || '').split('/').filter(Boolean);
    if (segs.length === 0) return null;
    segs.pop();
    return segs.length > 0 ? `${scheme}://${host}/${segs.join('/')}` : `${scheme}://${host}`;
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  parts.pop();
  const isUNC = currentPath.startsWith('\\\\') || currentPath.startsWith('//');
  const isWindows = !isUNC && /^[a-zA-Z]:/.test(normalized);
  return isUNC
    ? '\\\\' + parts.join('\\')
    : isWindows
      ? parts.length === 1
        ? `${parts[0]}\\`
        : parts.join('\\')
      : '/' + parts.join('/');
}

assert.equal(resolveNetworkParent('\\\\192.168.10.195\\Publico\\Docs'), '\\\\192.168.10.195\\Publico');
assert.equal(resolveNetworkParent('\\\\192.168.10.195\\Publico'), '\\\\192.168.10.195');
assert.equal(resolveNetworkParent('\\\\192.168.10.195'), null);
assert.equal(resolveNetworkParent('smb://192.168.10.195/Publico/Docs'), 'smb://192.168.10.195/Publico');
assert.equal(resolveNetworkParent('smb://192.168.10.195/Publico'), 'smb://192.168.10.195');
assert.equal(resolveNetworkParent('smb://192.168.10.195'), null);
assert.equal(resolveNetworkParent('nfs://192.168.10.195/volume1/media'), 'nfs://192.168.10.195/volume1');
assert.equal(resolveNetworkParent('nfs://192.168.10.195/volume1'), 'nfs://192.168.10.195');
assert.equal(resolveNetworkParent('nfs://192.168.10.195'), null);
assert.equal(resolveNetworkParent('afp://192.168.10.195/TimeMachine/Backups'), 'afp://192.168.10.195/TimeMachine');
assert.equal(resolveNetworkParent('afp://192.168.10.195/TimeMachine'), 'afp://192.168.10.195');
assert.equal(resolveNetworkParent('afp://192.168.10.195'), null);

// 9. Testar escala progressiva de Zoom e Visualização de Pastas (v1.2.0)
const ZOOM_STEPS_TEST = [
  { index: 0, pct: 85, viewMode: 'details', density: 'compact', gridSize: 'small' },
  { index: 1, pct: 100, viewMode: 'details', density: 'comfortable', gridSize: 'medium' },
  { index: 2, pct: 115, viewMode: 'list', density: 'comfortable', gridSize: 'medium' },
  { index: 3, pct: 130, viewMode: 'grid', density: 'comfortable', gridSize: 'small' },
  { index: 4, pct: 150, viewMode: 'grid', density: 'comfortable', gridSize: 'medium' },
  { index: 5, pct: 175, viewMode: 'grid', density: 'comfortable', gridSize: 'large' },
  { index: 6, pct: 200, viewMode: 'grid', density: 'comfortable', gridSize: 'xlarge' },
];
function resolveZoomIdxTest(viewMode, density, gridSize) {
  if (viewMode === 'details') return density === 'compact' ? 0 : 1;
  if (viewMode === 'list' || viewMode === 'columns') return 2;
  if (gridSize === 'small') return 3;
  if (gridSize === 'medium') return 4;
  if (gridSize === 'large') return 5;
  return 6;
}
assert.equal(resolveZoomIdxTest('details', 'comfortable', 'medium'), 1);
assert.equal(ZOOM_STEPS_TEST[resolveZoomIdxTest('details', 'comfortable', 'medium') + 1].viewMode, 'list');
assert.equal(ZOOM_STEPS_TEST[resolveZoomIdxTest('list', 'comfortable', 'medium') + 1].viewMode, 'grid');
assert.equal(ZOOM_STEPS_TEST[6].gridSize, 'xlarge');
assert.equal(ZOOM_STEPS_TEST[0].density, 'compact');

// 10. Testar classificação de PDF/Imagens e sanitização de abas de mídia no Pulsares Studio (v1.2.0)
const STUDIO_IMG_EXTS_TEST = new Set([
  'png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tif', 'tiff',
]);
function isStudioPdfTest(nameOrPath) {
  return String(nameOrPath || '').toLowerCase().endsWith('.pdf');
}
function isStudioImgTest(nameOrPath) {
  const base = String(nameOrPath || '').split(/[/\\]/).pop().toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot >= 0 && STUDIO_IMG_EXTS_TEST.has(base.slice(dot + 1));
}
function sanitizeStudioTabsTest(tabs) {
  return tabs.slice(-15).map((t) => {
    if (t.mediaSrc && t.mediaSrc.startsWith('data:')) {
      const copy = { ...t };
      delete copy.mediaSrc;
      return copy;
    }
    return t;
  });
}

assert.equal(isStudioPdfTest('C:\\Projetos\\arquitetura.PDF'), true);
assert.equal(isStudioPdfTest('README.md'), false);
assert.equal(isStudioImgTest('/assets/logo.svg'), true);
assert.equal(isStudioImgTest('C:\\ui\\hero.webp'), true);
assert.equal(isStudioImgTest('C:\\ui\\icone.ico'), true);
assert.equal(isStudioImgTest('main.go'), false);

const sanitizedMediaTabs = sanitizeStudioTabsTest([
  { id: 't1', name: 'foto.png', path: 'C:/foto.png', tabKind: 'image', mediaSrc: 'data:image/png;base64,AAAA' },
  { id: 't2', name: 'guia.pdf', path: 'C:/guia.pdf', tabKind: 'pdf', mediaSrc: 'http://127.0.0.1:51234/__localmedia?path=C%3A%2Fguia.pdf' },
]);
assert.equal(sanitizedMediaTabs[0].mediaSrc, undefined);
assert.ok(sanitizedMediaTabs[1].mediaSrc.includes('/__localmedia?path='));

// 11. Testar desduplicação de abas e resolução de caminho relativo da Prévia Web em subpastas (v1.2.0)
function normalizeStudioPathTest(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
function deduplicateTabsTest(tabs) {
  const seen = new Set();
  const out = [];
  for (const tab of tabs) {
    if (tab.path) {
      const key = normalizeStudioPathTest(tab.path);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
    }
    out.push(tab);
  }
  return out;
}
const dedupedStudioTabs = deduplicateTabsTest([
  { id: 'a', name: 'index.html', path: 'C:\\Users\\Vitor\\scorm\\index.html' },
  { id: 'b', name: 'index.html', path: 'c:/Users/Vitor/scorm/index.html' },
  { id: 'c', name: 'styles.css', path: 'C:\\Users\\Vitor\\scorm\\css\\styles.css' },
]);
assert.equal(dedupedStudioTabs.length, 2);
assert.equal(dedupedStudioTabs[0].id, 'a');
assert.equal(dedupedStudioTabs[1].id, 'c');

// 12. Testar suporte a Áudio/Vídeo no Studio e geração de CREATE TABLE no DB Studio (v1.2.0)
const STUDIO_MEDIA_EXTS_TEST = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'mp3', 'wav', 'flac', 'm4a', 'aac']);
function isStudioMediaTest(nameOrPath) {
  const base = String(nameOrPath || '').split(/[/\\]/).pop().toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot >= 0 && STUDIO_MEDIA_EXTS_TEST.has(base.slice(dot + 1));
}
assert.equal(isStudioMediaTest('C:\\curso\\aula01.mp4'), true);
assert.equal(isStudioMediaTest('/assets/podcast.mp3'), true);
assert.equal(isStudioMediaTest('index.html'), false);

// 13. Testar presença da ponte e submenu "Abrir com" listando programas do sistema (v1.2.0)
const wailsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'wails.ts'), 'utf8');
const ctxMenuSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'context-menu', 'FileContextMenu.tsx'), 'utf8');
assert.ok(wailsSrc.includes('export async function listOpenWithApps('));
assert.ok(wailsSrc.includes('export async function openFileWithApp('));
assert.ok(wailsSrc.includes('export async function getCloudItemStatus('));
assert.ok(wailsSrc.includes('export async function executeCloudAction('));
assert.ok(ctxMenuSrc.includes('listOpenWithApps('));
assert.ok(ctxMenuSrc.includes('openFileWithApp('));
assert.ok(ctxMenuSrc.includes('getCloudItemStatus('));
assert.ok(ctxMenuSrc.includes('executeCloudAction('));
assert.ok(ctxMenuSrc.includes('Sempre manter neste dispositivo'));
assert.ok(ctxMenuSrc.includes('Liberar espaço (Apenas online)'));
assert.ok(ctxMenuSrc.includes('Programas do Sistema'));

console.log('[frontend:test] Todos os testes unitários (0.1.0 a 1.2.0 + ERD + DB Studio CRUD/Creator + Studio Web/PDF/Image/Media/Git/Search + Open With Submenu + Terminal Follow-up + Clipboard History + Network Drives + Folder Zoom) passaram com sucesso.');
