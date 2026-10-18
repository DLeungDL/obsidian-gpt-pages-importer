import * as obsidian from 'obsidian';
import { setLanguage } from './i18n';

/** getLanguage became public in 1.8.7. Older hosts keep the language in localStorage. */
export function appLanguage(api: { getLanguage?: () => unknown }, legacy: () => unknown): string {
  try {
    const language = api.getLanguage?.();
    if (typeof language === 'string' && language.trim()) return language;
  } catch { /* Fall through to the legacy setting when the host API is unavailable. */ }
  try {
    const language = legacy();
    if (typeof language === 'string' && language.trim()) return language;
  } catch { /* Storage can be unavailable; English remains the safe fallback. */ }
  return 'en';
}

/** Read the app setting at plugin load; importing the bundle never accesses the DOM. */
export function initializeLanguage(): void {
  setLanguage(appLanguage(obsidian, () => window.localStorage.getItem('language')));
}
