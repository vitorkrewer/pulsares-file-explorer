import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ptBRCommon from './locales/pt-BR/common.json';
import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';

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
};

export function resolveLanguage(sysLang?: string, prefLang?: string): string {
  if (prefLang && prefLang !== 'auto') {
    return prefLang;
  }
  if (!sysLang) return 'en';
  const lower = sysLang.toLowerCase();
  if (lower.startsWith('pt')) return 'pt-BR';
  if (lower.startsWith('es')) return 'es';
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

