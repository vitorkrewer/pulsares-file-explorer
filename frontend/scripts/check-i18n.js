import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.resolve(__dirname, '../src/i18n/locales');

const referenceLang = 'pt-BR';
const targetLangs = ['en', 'es', 'de', 'fr'];

function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(flattenKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

function loadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Erro ao ler JSON em ${filePath}:`, err.message);
    process.exit(1);
  }
}

const refFiles = fs.readdirSync(path.join(localesDir, referenceLang)).filter(f => f.endsWith('.json'));

let hasError = false;

for (const file of refFiles) {
  const refData = loadJson(path.join(localesDir, referenceLang, file));
  const refKeys = new Set(flattenKeys(refData));

  for (const lang of targetLangs) {
    const targetPath = path.join(localesDir, lang, file);
    if (!fs.existsSync(targetPath)) {
      console.error(`[i18n:check] ERRO: Arquivo faltando: ${targetPath}`);
      hasError = true;
      continue;
    }

    const targetData = loadJson(targetPath);
    const targetKeys = new Set(flattenKeys(targetData));

    // Verificar faltantes
    for (const key of refKeys) {
      if (!targetKeys.has(key)) {
        console.error(`[i18n:check] [${lang}/${file}] Chave FALTANDO: "${key}"`);
        hasError = true;
      }
    }

    // Verificar órfãs
    for (const key of targetKeys) {
      if (!refKeys.has(key)) {
        console.error(`[i18n:check] [${lang}/${file}] Chave ÓRFÃ (não existe em pt-BR): "${key}"`);
        hasError = true;
      }
    }
  }
}

if (hasError) {
  console.error('\n[i18n:check] Falha na validação de traduções!');
  process.exit(1);
} else {
  console.log('[i18n:check] Todas as traduções (pt-BR, en, es, de, fr) estão 100% sincronizadas.');
}

