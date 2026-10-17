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

const descriptions: Record<RendererStatus, string> = {
  'not-installed': 'Polyglot Renderer：未安裝。互動 HTML 需先安裝並啟用；仍可匯入、清理與保存原始碼。',
  disabled: 'Polyglot Renderer：未啟用。請到「設定 → 第三方外掛」啟用後重新檢查。',
  enabled: 'Polyglot Renderer：已啟用（依本機啟用設定）。仍須明確確認信任內容，並在 renderer 中開啟 HTML 渲染。',
  unknown: 'Polyglot Renderer：無法確認。請到「設定 → 第三方外掛」檢查安裝與啟用狀態；仍可匯入與清理。'
};

/** Share the same read-only status beside both rendering trust controls. */
export function addRendererStatus(setting: Setting, app: App): void {
  const container = setting.descEl.createDiv();
  container.classList.add('gpt-pages-renderer-status');
  const status = container.createDiv();
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const help = container.createEl('a', { text: 'Polyglot Renderer 安裝與啟用說明' });
  help.href = 'https://github.com/Nimaapr/polyglot-renderer#installation';
  help.target = '_blank';
  help.rel = 'noopener noreferrer';
  let revision = 0;
  const refresh = async () => {
    const current = ++revision;
    status.textContent = '正在檢查 Polyglot Renderer…';
    const result = await detectRendererStatus(app.vault);
    if (current === revision) status.textContent = descriptions[result];
  };
  setting.addButton(button => button.setButtonText('重新檢查 renderer').onClick(refresh));
  void refresh();
}
