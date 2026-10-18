import { t, type TranslationKey } from './i18n';
import { normalizePath, type App, type DataAdapter, type Setting } from 'obsidian';

export type RendererStatus = 'not-installed' | 'disabled' | 'enabled' | 'unknown';
interface RendererVault {
  configDir: string;
  adapter: Pick<DataAdapter, 'exists' | 'read'>;
}
const rendererId = 'polyglot-renderer';

/** Read installation and saved enablement only; never load or configure another plugin. */
export async function detectRendererStatus(vault: RendererVault): Promise<RendererStatus> {
  try {
    const directory = normalizePath(`${vault.configDir}/plugins/${rendererId}`);
    const manifestPath = `${directory}/manifest.json`;
    if (!await vault.adapter.exists(manifestPath)) return 'not-installed';
    const manifest: unknown = JSON.parse((await vault.adapter.read(manifestPath)).replace(/^\uFEFF/, ''));
    if (!manifest || typeof manifest !== 'object' || !('id' in manifest) || manifest.id !== rendererId) return 'unknown';
    if (!await vault.adapter.exists(`${directory}/main.js`)) return 'unknown';
    const enabledPath = normalizePath(`${vault.configDir}/community-plugins.json`);
    if (!await vault.adapter.exists(enabledPath)) return 'disabled';
    const enabled: unknown = JSON.parse((await vault.adapter.read(enabledPath)).replace(/^\uFEFF/, ''));
    if (!Array.isArray(enabled) || !enabled.every((id: unknown) => typeof id === 'string')) return 'unknown';
    return enabled.includes(rendererId) ? 'enabled' : 'disabled';
  } catch {
    // Failed reads and partially written settings must not masquerade as a missing plugin.
    return 'unknown';
  }
}

const descriptions: Record<RendererStatus, TranslationKey> = {
  'not-installed': 'renderer.missing',
  disabled: 'renderer.disabled',
  enabled: 'renderer.enabled',
  unknown: 'renderer.unknown'
};

/** Share the same read-only status beside both rendering trust controls. */
export function addRendererStatus(setting: Setting, app: App): void {
  const container = setting.descEl.createDiv();
  container.classList.add('gpt-pages-renderer-status');
  const status = container.createDiv();
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const help = container.createEl('a', { text: t('renderer.help') });
  help.href = 'https://github.com/Nimaapr/polyglot-renderer#installation';
  help.target = '_blank';
  help.rel = 'noopener noreferrer';
  let revision = 0;
  const refresh = async () => {
    const current = ++revision;
    status.textContent = t('renderer.checking');
    const result = await detectRendererStatus(app.vault);
    if (current === revision) status.textContent = t(descriptions[result]);
  };
  setting.addButton(button => button.setButtonText(t('renderer.recheck')).onClick(refresh));
  void refresh();
}
