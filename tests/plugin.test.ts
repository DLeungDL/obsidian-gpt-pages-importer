// @vitest-environment jsdom
import { beforeEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import GPTPagesImporter from '../src/main';
import { Modal, Notice, type Plugin } from './obsidian-stub';
const input = readFileSync('tests/fixtures/interactive.input.md', 'utf8');
const expected = readFileSync('tests/fixtures/interactive.expected.md', 'utf8');
type HostPlugin = Plugin & { onload(): Promise<void> };
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); document.body.replaceChildren();
  Modal.opened = []; Notice.messages = [];
});
function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent === label);
  expect(button).toBeDefined(); button!.click();
}
async function preview(plugin: HostPlugin, trusted = false) {
  plugin.commands[0]!.callback();
  const modal = Modal.opened[0]!;
  const file = modal.contentEl.querySelector<HTMLInputElement>('input[type=file]')!;
  const bytes = new TextEncoder().encode(input);
  Object.defineProperty(file, 'files', { value: [{ name: 'interactive.md', size: bytes.length, arrayBuffer: async () => bytes.buffer }] });
  file.dispatchEvent(new Event('change'));
  if (trusted) {
    const checkbox = modal.contentEl.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change'));
  }
  clickButton(modal.contentEl, '預覽');
  await vi.waitFor(() => expect(Modal.opened.length).toBe(1));
  await vi.waitFor(() => expect(Modal.opened[0]!.contentEl.textContent).toContain('匯入變更預覽'));
  return Modal.opened[0]!;
}
it('runs command, previews safely, imports, repeats without duplication and blocks local edits', async () => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload(); expect(plugin.commands[0]!.id).toBe('import-pages-markdown');
  const first = await preview(plugin);
  expect(first.contentEl.querySelector('script,iframe,img')).toBeNull();
  expect(first.contentEl.textContent).toContain('html-source');
  clickButton(first.contentEl, '確認寫入');
  await vi.waitFor(() => expect(plugin.app.vault.files.size).toBe(1));
  await vi.waitFor(() => expect(Modal.opened.length).toBe(0));
  const path = [...plugin.app.vault.files.keys()][0]!;
  expect(plugin.app.vault.files.get(path)).toBe(expected);
  const second = await preview(plugin);
  expect(second.contentEl.textContent).toContain('內容相同，不寫入');
  clickButton(second.contentEl, '完成（無變更）');
  await vi.waitFor(() => expect(Modal.opened.length).toBe(0));
  expect(plugin.app.vault.files.size).toBe(1);
  plugin.app.vault.files.set(path, '使用者修改');
  const third = await preview(plugin);
  expect(third.contentEl.textContent).toContain('停止寫入');
  expect([...third.contentEl.querySelectorAll('button')].map(button => button.textContent)).toEqual(['取消']);
  expect(plugin.app.vault.files.get(path)).toBe('使用者修改');
});
it('only emits executable html when trust was explicitly selected', async () => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload(); const modal = await preview(plugin, true);
  expect(modal.contentEl.textContent).toContain('```html\n');
  expect(modal.contentEl.querySelector('script,iframe,img')).toBeNull();
  clickButton(modal.contentEl, '確認寫入');
  await vi.waitFor(() => expect(plugin.app.vault.files.size).toBe(1));
  expect([...plugin.app.vault.files.values()][0]).toContain('```html\n');
});
it('does not register import when persisted state is invalid', async () => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  plugin.data = { version: 99 }; await plugin.onload();
  expect(plugin.commands).toHaveLength(0); expect(Notice.messages[0]).toContain('格式未知');
});
it('rejects invalid UTF-8 before preview or write', async () => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload(); plugin.commands[0]!.callback();
  const modal = Modal.opened[0]!;
  const file = modal.contentEl.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(file, 'files', { value: [{ name: 'bad.md', size: 2, arrayBuffer: async () => new Uint8Array([0xc3, 0x28]).buffer }] });
  file.dispatchEvent(new Event('change')); clickButton(modal.contentEl, '預覽');
  await vi.waitFor(() => expect(Notice.messages.length).toBe(1));
  expect(plugin.app.vault.files.size).toBe(0); expect(modal.contentEl.textContent).not.toContain('匯入變更預覽');
});
