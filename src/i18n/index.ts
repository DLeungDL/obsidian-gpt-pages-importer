import { en } from './en';
import { zhTW } from './zh-TW';

export type TranslationKey = keyof typeof en;
export type Language = 'en' | 'zh-TW';
type Variables = Record<string, string | number>;
let current: Language = 'en';

export function setLanguage(language: string): void {
  const code = language.trim().replaceAll('_', '-').toLowerCase();
  current = code === 'zh-tw' || /^zh-hant(?:-|$)/.test(code) ? 'zh-TW' : 'en';
}

/** Translate display text only. Source text, paths and hashes are never translated. */
export function t(key: TranslationKey, variables: Variables = {}): string {
  const table: Partial<Record<TranslationKey, string>> = current === 'zh-TW' ? zhTW : en;
  const text = table[key] || en[key];
  // One pass preserves placeholder-like content and replacement tokens in filenames.
  return text.replace(/\{(\w+)\}/g, (placeholder: string, name: string) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : placeholder);
}
