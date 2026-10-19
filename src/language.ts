import * as obsidian from 'obsidian';
import { setLanguage } from './i18n';

/** getLanguage became public in 1.8.7. Older supported hosts use English. */
export function appLanguage(api: { getLanguage?: () => unknown }): string {
  try {
    const language = api.getLanguage?.();
    if (typeof language === 'string' && language.trim()) return language;
  } catch { /* English remains available when the host API fails. */ }
  return 'en';
}

/** Read the app setting at plugin load; importing the bundle never accesses the DOM. */
export function initializeLanguage(): void {
  setLanguage(appLanguage(obsidian));
}
