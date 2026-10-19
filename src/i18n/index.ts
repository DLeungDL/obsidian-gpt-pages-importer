import { en } from './en';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';

export type TranslationKey = keyof typeof en;
export type Language = 'en' | 'zh-CN' | 'zh-TW';
type Variables = Record<string, string | number>;
const translations: Record<Language, Partial<Record<TranslationKey, string>>> = { en, 'zh-CN': zhCN, 'zh-TW': zhTW };
let current: Language = 'en';

export function setLanguage(language: string): void {
  const code = language.trim().replaceAll('_', '-').toLowerCase();
  if (code === 'zh-tw' || /^zh-hant(?:-|$)/.test(code)) current = 'zh-TW';
  else if (['zh', 'zh-cn', 'zh-sg'].includes(code) || /^zh-hans(?:-|$)/.test(code)) current = 'zh-CN';
  else current = 'en';
}

/** Translate display text only. Source text, paths and hashes are never translated. */
export function t(key: TranslationKey, variables: Variables = {}): string {
  const table = translations[current];
  const text = table[key] || en[key];
  // One pass preserves placeholder-like content and replacement tokens in filenames.
  return text.replace(/\{(\w+)\}/g, (placeholder: string, name: string) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : placeholder);
}
