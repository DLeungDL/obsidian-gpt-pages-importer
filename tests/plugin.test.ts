// @vitest-environment jsdom
import { beforeEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import GPTPagesImporter from '../src/main';
import { digest, type State } from '../src/importer';
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
async function preview(plugin: HostPlugin, trusted = false, source = input) {
  plugin.commands[0]!.callback();
  const modal = Modal.opened[0]!;
  const file = modal.contentEl.querySelector<HTMLInputElement>('input[type=file]')!;
  const bytes = new TextEncoder().encode(source);
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
async function importSource(plugin: HostPlugin, source: string) {
  const modal = await preview(plugin, false, source);
  clickButton(modal.contentEl, '確認寫入');
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
  return [...plugin.app.vault.files.keys()][0]!;
}
it.each(['create', 'update', 'unchanged'] as const)('opens the cleaned destination after %s while preserving the original export', async status => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload();
  const original = await plugin.app.vault.create('original-export.md', input);
  if (status !== 'create') await importSource(plugin, input);
  await plugin.app.workspace.getLeaf(false).openFile(original);
  const before = new Map(plugin.app.vault.files);
  const persist = vi.spyOn(plugin, 'saveData');
  const open = vi.spyOn(plugin.app.workspace, 'getLeaf');
  const addition = status === 'update' ? '\n來源更新\n' : '';
  const modal = await preview(plugin, false, input + addition);
  expect(open).not.toHaveBeenCalled();
  expect(plugin.app.workspace.getActiveFile()?.path).toBe(original.path);
  clickButton(modal.contentEl, status === 'unchanged' ? '完成（無變更）' : '確認寫入');
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
  const destination = Object.values((plugin.data as State).entries)[0]!.destination;
  expect(open).toHaveBeenCalledExactlyOnceWith(false);
  expect(plugin.app.workspace.getActiveFile()?.path).toBe(destination);
  expect(destination).toMatch(/^GPT Pages\//);
  expect(plugin.app.vault.files.get(destination)).toBe(expected + addition);
  expect(plugin.app.vault.files.get(original.path)).toBe(input);
  if (status === 'unchanged') {
    expect(plugin.app.vault.files).toEqual(before);
    expect(persist).not.toHaveBeenCalled();
  }
  if (status === 'update') {
    const backups = [...plugin.app.vault.files.entries()].filter(([name]) => name.startsWith('GPT Pages Backups/'));
    expect(backups.map(([, text]) => text)).toEqual([expected]);
  }
});
it.each(['write', 'persist'] as const)('keeps the original export open when %s fails', async failure => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload();
  const original = await plugin.app.vault.create('original-export.md', input);
  await plugin.app.workspace.getLeaf(false).openFile(original);
  const open = vi.spyOn(plugin.app.workspace, 'getLeaf');
  const modal = await preview(plugin);
  if (failure === 'write') vi.spyOn(plugin.app.vault, 'create').mockRejectedValueOnce(new Error('寫入失敗'));
  else vi.spyOn(plugin, 'saveData').mockRejectedValueOnce(new Error('儲存失敗'));
  clickButton(modal.contentEl, '確認寫入');
  await vi.waitFor(() => expect(modal.contentEl.textContent).toContain(failure === 'write' ? '寫入失敗' : '匯入紀錄儲存失敗'));
  expect(open).not.toHaveBeenCalled();
  expect(plugin.app.workspace.getActiveFile()?.path).toBe(original.path);
  expect(plugin.app.vault.files.get(original.path)).toBe(input);
  expect(plugin.data).toBeNull();
});
it('reports navigation failure separately and can reopen the saved destination on an unchanged import', async () => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload();
  vi.spyOn(plugin.app.workspace.leaf, 'openFile').mockRejectedValueOnce(new Error('窗格無法開啟'));
  const modal = await preview(plugin);
  clickButton(modal.contentEl, '確認寫入');
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
  const entry = Object.values((plugin.data as State).entries)[0]!;
  expect(plugin.app.vault.files.get(entry.destination)).toBe(expected);
  expect(entry.outputHash).toBe(await digest(expected));
  expect(Notice.messages).toContain(`匯入已完成，但無法開啟目的筆記：${entry.destination}。窗格無法開啟`);
  const again = await preview(plugin);
  expect(again.contentEl.textContent).toContain('內容相同，不寫入');
  clickButton(again.contentEl, '完成（無變更）');
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
  expect(plugin.app.workspace.getActiveFile()?.path).toBe(entry.destination);
  expect(plugin.app.vault.files.size).toBe(1);
});
it.each([
  ['LF', '\uFEFF# 中文 🗂️\n'],
  ['CRLF', '\uFEFF# 中文 🗂️\r\n'],
  ['two opening BOMs', '\uFEFF\uFEFF# 中文 🗂️\n']
])('reimports UTF-8 BOM (%s) unchanged, including after loading saved state', async (_name, source) => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload();
  const path = await importSource(plugin, source);
  expect(plugin.app.vault.files.get(path)).toBe(source);
  const saved = plugin.data as State;
  expect(Object.values(saved.entries)[0]!.outputHash).toBe(await digest(source));
  const reloaded = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  reloaded.app = plugin.app; reloaded.data = saved; await reloaded.onload();
  const write = vi.spyOn(reloaded.app.vault, 'process');
  const persist = vi.spyOn(reloaded, 'saveData');
  const modal = await preview(reloaded, false, source);
  expect(modal.contentEl.textContent).toContain('內容相同，不寫入');
  clickButton(modal.contentEl, '完成（無變更）');
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
  expect(reloaded.app.vault.files.size).toBe(1);
  expect(reloaded.app.vault.files.get(path)).toBe(source);
  expect(write).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
});
it.each([
  ['preserves BOM and CRLF', '\uFEFF# 舊內容\r\n', '\uFEFF# 新內容\r\n'],
  ['removes source BOM', '\uFEFF# 內容\n', '# 內容\n'],
  ['adds source BOM', '# 內容\n', '\uFEFF# 內容\n']
])('updates source that %s with an exact backup and output hash', async (_name, before, after) => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload(); const path = await importSource(plugin, before);
  const modal = await preview(plugin, false, after);
  expect(modal.contentEl.textContent).toContain('更新並先備份');
  clickButton(modal.contentEl, '確認寫入');
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
  const backups = [...plugin.app.vault.files.entries()].filter(([name]) => name.startsWith('GPT Pages Backups/'));
  expect(backups).toHaveLength(1); expect(backups[0]![1]).toBe(before);
  expect(plugin.app.vault.files.get(path)).toBe(after);
  expect(Object.values((plugin.data as State).entries)[0]!.outputHash).toBe(await digest(after));
  const again = await preview(plugin, false, after);
  expect(again.contentEl.textContent).toContain('內容相同，不寫入');
});
it.each([
  ['removes', '\uFEFF# 內容\n', '# 內容\n'],
  ['adds', '# 內容\n', '\uFEFF# 內容\n']
])('blocks a local edit that only %s the BOM', async (_name, source, edited) => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload(); const path = await importSource(plugin, source);
  plugin.app.vault.files.set(path, edited);
  const modal = await preview(plugin, false, source);
  expect(modal.contentEl.textContent).toContain('停止寫入');
  expect([...modal.contentEl.querySelectorAll('button')].map(button => button.textContent)).toEqual(['返回設定', '取消']);
  expect(plugin.app.vault.files.get(path)).toBe(edited); expect(plugin.app.vault.files.size).toBe(1);
});
it.each([
  ['removes', '\uFEFF# 內容\n', '# 內容\n'],
  ['adds', '# 內容\n', '\uFEFF# 內容\n']
])('atomically blocks a race that only %s the BOM after backup', async (_name, source, edited) => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload(); const path = await importSource(plugin, source);
  const saved = plugin.data;
  const modal = await preview(plugin, false, source + '來源更新\n');
  expect(modal.contentEl.textContent).toContain('更新並先備份');
  const process = plugin.app.vault.process.bind(plugin.app.vault);
  vi.spyOn(plugin.app.vault, 'process').mockImplementationOnce(async (file, fn) => {
    plugin.app.vault.files.set(path, edited);
    return process(file, fn);
  });
  clickButton(modal.contentEl, '確認寫入');
  await vi.waitFor(() => expect(modal.contentEl.textContent).toContain('目的檔案在寫入前已變更'));
  expect(plugin.app.vault.files.get(path)).toBe(edited); expect(plugin.data).toBe(saved);
  const backups = [...plugin.app.vault.files.entries()].filter(([name]) => name.startsWith('GPT Pages Backups/'));
  expect(backups).toHaveLength(1); expect(backups[0]![1]).toBe(source);
});
it('runs command, previews safely, imports, repeats without duplication and blocks local edits', async () => {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload(); expect(plugin.commands[0]!.id).toBe('import-pages-markdown');
  const open = vi.spyOn(plugin.app.workspace, 'getLeaf');
  const first = await preview(plugin);
  expect(open).not.toHaveBeenCalled();
  expect(first.contentEl.querySelector('script,iframe,img')).toBeNull();
  expect(first.contentEl.textContent).toContain('html-source');
  clickButton(first.contentEl, '確認寫入');
  await vi.waitFor(() => expect(plugin.app.vault.files.size).toBe(1));
  await vi.waitFor(() => expect(Modal.opened.length).toBe(0));
  expect(open).toHaveBeenCalledTimes(1);
  const path = [...plugin.app.vault.files.keys()][0]!;
  expect(plugin.app.vault.files.get(path)).toBe(expected);
  const second = await preview(plugin);
  expect(second.contentEl.textContent).toContain('內容相同，不寫入');
  clickButton(second.contentEl, '完成（無變更）');
  await vi.waitFor(() => expect(Modal.opened.length).toBe(0));
  expect(open).toHaveBeenCalledTimes(2);
  expect(plugin.app.vault.files.size).toBe(1);
  plugin.app.vault.files.set(path, '使用者修改');
  const third = await preview(plugin);
  expect(third.contentEl.textContent).toContain('停止寫入');
  expect([...third.contentEl.querySelectorAll('button')].map(button => button.textContent)).toEqual(['返回設定', '取消']);
  expect(plugin.app.vault.files.get(path)).toBe('使用者修改');
  clickButton(third.contentEl, '取消');
  expect(open).toHaveBeenCalledTimes(2);
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
