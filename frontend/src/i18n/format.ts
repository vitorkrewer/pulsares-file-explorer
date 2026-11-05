// Cache de instâncias Intl para evitar recriação frequente
const collatorCache = new Map<string, Intl.Collator>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function getCollator(locale: string): Intl.Collator {
  let c = collatorCache.get(locale);
  if (!c) {
    c = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    collatorCache.set(locale, c);
  }
  return c;
}

export function formatDateTime(value: string | number, locale: string): string {
  if (value === '' || value === null || value === undefined) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';

  let f = dateFormatterCache.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    dateFormatterCache.set(locale, f);
  }
  return f.format(d);
}

export const formatDate = formatDateTime;

export function formatBytes(bytes: number, locale: string): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i === 0) return `${bytes} B`;

  const num = bytes / Math.pow(k, i);
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(num);

  return `${formatted} ${sizes[i]}`;
}
