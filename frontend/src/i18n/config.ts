import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ptBRCommon from './locales/pt-BR/common.json';
import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';
import deCommon from './locales/de/common.json';
import frCommon from './locales/fr/common.json';
import itCommon from './locales/it/common.json';
import jaCommon from './locales/ja/common.json';
import zhCNCommon from './locales/zh-CN/common.json';

const charMap: Record<string, string> = {
  a: 'ä', A: 'Ä', e: 'ë', E: 'Ë', i: 'ï', I: 'Ï',
  o: 'ö', O: 'Ö', u: 'ü', U: 'Ü', c: 'ç', C: 'Ç',
  t: 'ţ', T: 'Ţ', s: 'ş', S: 'Ş', n: 'ñ', N: 'Ñ',
};

export function toPseudoString(str: string): string {
  // Preservar interpolações {{...}} intactas
  const parts = str.split(/(\{\{[^}]+\}\})/g);
  const transformed = parts
    .map((part) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        return part;
      }
      return Array.from(part)
        .map((ch) => charMap[ch] ?? ch)
        .join('');
    })
    .join('');
  // Expandir em ~35% para testar tolerância de layout
  const pad = '~'.repeat(Math.max(2, Math.ceil(str.length * 0.25)));
  return `[!! ${transformed} ${pad} !!]`;
}

function buildPseudoCatalog(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = buildPseudoCatalog(v as Record<string, unknown>);
    } else if (typeof v === 'string') {
      out[k] = toPseudoString(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const pseudoCommon = buildPseudoCatalog(ptBRCommon as Record<string, unknown>);

const resources = {
  'pt-BR': {
    common: ptBRCommon,
  },
  en: {
    common: enCommon,
  },
  es: {
    common: esCommon,
  },
  de: {
    common: deCommon,
  },
  fr: {
    common: frCommon,
  },
  it: {
    common: itCommon,
  },
  ja: {
    common: jaCommon,
  },
  'zh-CN': {
    common: zhCNCommon,
  },
  pseudo: {
    common: pseudoCommon,
  },
};

export function resolveLanguage(sysLang?: string, prefLang?: string): string {
  const envLocale = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_LOCALE;
  if (envLocale === 'pseudo') {
    return 'pseudo';
  }
  if (prefLang && prefLang !== 'auto') {
    return prefLang;
  }
  if (!sysLang) return 'en';
  const lower = sysLang.toLowerCase();
  if (lower.startsWith('pt')) return 'pt-BR';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('it')) return 'it';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en';
  return 'en'; // fallback padrão do projeto
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'pt-BR',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
