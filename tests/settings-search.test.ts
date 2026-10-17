// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { CleanupSettingTab, type CleanupController } from '../src/cleanup-settings';
import { Modal, Setting, TestApp } from './obsidian-stub';

beforeEach(() => { document.body.replaceChildren(); Modal.opened = []; });

it.each(['legacy', 'declarative'])('shows and refreshes renderer status in %s cleanup settings without granting folder trust', async mode => {
  const configure = vi.fn(async () => {});
  const app = new TestApp();
  const tab = new CleanupSettingTab(app as never, {} as never, {
    getCleanupSettings: () => ({ enabled: false, folder: 'Inbox', renderHtml: false }),
    configureCleanup: configure, scanCleanup: vi.fn(), cleanupStatus: '尚未啟用'
  });
  if (mode === 'legacy') tab.display();
  else {
    const group = tab.getSettingDefinitions()[0]!;
    if (!('items' in group)) throw new Error('Missing settings group');
    for (const item of group.items ?? []) {
      if ('render' in item && item.render) item.render(new Setting(tab.containerEl) as never, {} as never);
    }
  }
  const status = tab.containerEl.querySelector('.gpt-pages-renderer-status [role=status]')!;
  await vi.waitFor(() => expect(status.textContent).toContain('未安裝'));
  app.vault.configFiles.set('.obsidian/plugins/polyglot-renderer/manifest.json', '{"id":"polyglot-renderer"}');
  app.vault.configFiles.set('.obsidian/plugins/polyglot-renderer/main.js', '// Not executed');
  const refresh = [...tab.containerEl.querySelectorAll('button')].find(button => button.textContent === '重新檢查 renderer')!;
  refresh.click();
  await vi.waitFor(() => expect(status.textContent).toContain('未啟用'));
  app.vault.configFiles.set('.obsidian/community-plugins.json', '["polyglot-renderer"]');
  refresh.click();
  await vi.waitFor(() => expect(status.textContent).toContain('已啟用'));
  expect([...tab.containerEl.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].every(toggle => !toggle.checked)).toBe(true);
  expect(configure).not.toHaveBeenCalled();
  expect(Modal.opened).toHaveLength(0);
  [...tab.containerEl.querySelectorAll('button')].find(button => button.textContent === '儲存設定')!.click();
  await vi.waitFor(() => expect(configure).toHaveBeenCalledWith({ enabled: false, folder: 'Inbox', renderHtml: false }, undefined));
});

it('exposes searchable modern settings backed by the same explicit trust and save flow', async () => {
  const configure = vi.fn(async () => {});
  const controller: CleanupController = {
    getCleanupSettings: () => ({ enabled: false, folder: '', renderHtml: false }),
    configureCleanup: configure,
    scanCleanup: vi.fn(),
    cleanupStatus: '尚未啟用'
  };
  const tab = new CleanupSettingTab(new TestApp() as never, {} as never, controller);
  const definitions = tab.getSettingDefinitions();
  const group = definitions[0];
  if (!group || !('items' in group)) throw new Error('Missing declarative settings group');
  expect(group.items?.map(item => 'name' in item ? item.name : undefined)).toEqual(['自動清理資料夾', '啟用自動清理', '清理後啟用 HTML 渲染', '清理狀態與操作']);
  for (const item of group.items ?? []) {
    expect('aliases' in item && item.aliases?.length).toBeTruthy();
    if (!('render' in item) || !item.render) throw new Error('Missing interactive settings renderer');
    const row = new Setting(tab.containerEl).setName(item.name);
    item.render(row as never, {} as never);
  }
  expect(configure).not.toHaveBeenCalled();
  const folder = tab.containerEl.querySelector<HTMLInputElement>('input[type=text]')!;
  folder.value = 'Inbox'; folder.dispatchEvent(new Event('change'));
  const [enabled, rendering] = tab.containerEl.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
  enabled!.checked = true; enabled!.dispatchEvent(new Event('change'));
  rendering!.checked = true; rendering!.dispatchEvent(new Event('change'));
  expect(rendering!.checked).toBe(false);
  expect(Modal.opened).toHaveLength(1);
  [...Modal.opened[0]!.contentEl.querySelectorAll('button')].find(button => button.textContent === '我信任此資料夾內容，啟用')!.click();
  expect(configure).not.toHaveBeenCalled();
  expect(rendering!.checked).toBe(true);
  [...tab.containerEl.querySelectorAll('button')].find(button => button.textContent === '儲存設定')!.click();
  await vi.waitFor(() => expect(configure).toHaveBeenCalledWith({ enabled: true, folder: 'Inbox', renderHtml: true }, 'Inbox'));
});
