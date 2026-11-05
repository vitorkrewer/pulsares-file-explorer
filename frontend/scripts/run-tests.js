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

// 3. Garantir que códigos de erro e namespaces (0.1.0, 0.2.0, 0.3.0) existem nos 3 catálogos
const requiredErrorKeys = ['notFound', 'permissionDenied', 'generic'];
const requiredTabKeys = ['newTab', 'closeTab', 'duplicateTab', 'pinTab', 'unpinTab', 'closeOthers', 'closeRight', 'reopenClosed'];
const requiredTreeKeys = ['title', 'followActiveTab', 'refresh', 'loading', 'empty', 'symlink'];
const requiredOpsKeys = [
  'title', 'newFolder', 'newFile', 'rename', 'copy', 'cut', 'paste',
  'trash', 'deletePermanent', 'undo', 'redo', 'queue', 'conflictTitle',
  'policyOverwrite', 'policySkip', 'policyRename', 'policyKeepNewer'
];

for (const lang of ['pt-BR', 'en', 'es']) {
  const filePath = path.resolve(__dirname, `../src/i18n/locales/${lang}/common.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  for (const errKey of requiredErrorKeys) {
    assert.ok(
      typeof data.errors?.[errKey] === 'string' && data.errors[errKey].length > 0,
      `Chave errors.${errKey} ausente em ${lang}`
    );
  }
  for (const tabKey of requiredTabKeys) {
    assert.ok(
      typeof data.tabs?.[tabKey] === 'string' && data.tabs[tabKey].length > 0,
      `Chave tabs.${tabKey} ausente em ${lang}`
    );
  }
  for (const treeKey of requiredTreeKeys) {
    assert.ok(
      typeof data.tree?.[treeKey] === 'string' && data.tree[treeKey].length > 0,
      `Chave tree.${treeKey} ausente em ${lang}`
    );
  }
  for (const opsKey of requiredOpsKeys) {
    assert.ok(
      typeof data.ops?.[opsKey] === 'string' && data.ops[opsKey].length > 0,
      `Chave ops.${opsKey} ausente em ${lang}`
    );
  }
}

console.log('[frontend:test] Todos os testes unitários (0.1.0 + 0.2.0 + 0.3.0) passaram com sucesso.');
