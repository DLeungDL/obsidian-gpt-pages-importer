// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { CleanupSettingTab, type CleanupController } from '../src/cleanup-settings';
import { Modal, Setting, TestApp } from './obsidian-stub';

beforeEach(() => { document.body.replaceChildren(); Modal.opened = []; });

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
