// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import GPTPagesImporter from '../src/main';
import type { State } from '../src/importer';
import { Menu, Modal, Notice, TFolder, type Plugin } from './obsidian-stub';

const input = readFileSync('tests/fixtures/interactive.input.md', 'utf8');
const expected = readFileSync('tests/fixtures/interactive.expected.md', 'utf8');
type HostPlugin = Plugin & { onload(): Promise<void> };
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  document.body.replaceChildren(); Modal.opened = []; Notice.messages = [];
});
async function setup() {
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin;
  await plugin.onload(); return plugin;
}
function button(modal: Modal, text: string) {
  const result = [...modal.contentEl.querySelectorAll('button')].find(item => item.textContent === text);
  expect(result).toBeDefined(); return result!;
}
function file(name = 'interactive.md', source = input) {
  const bytes = new TextEncoder().encode(source);
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer };
}
function choose(modal: Modal, selected: ReturnType<typeof file>) {
  const picker = modal.contentEl.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(picker, 'files', { configurable: true, value: [selected] });
  picker.dispatchEvent(new Event('change'));
}
function drop(modal: Modal, files: ReturnType<typeof file>[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  modal.contentEl.querySelector('.gpt-pages-drop-zone')!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
}
function field(modal: Modal, name: string) {
  const label = [...modal.contentEl.querySelectorAll('label')].find(item => item.textContent === name)!;
  return label.parentElement!.querySelector<HTMLInputElement>('input')!;
}
function change(field: HTMLInputElement, value: string) { field.value = value; field.dispatchEvent(new Event('change')); }
async function preview(modal: Modal) {
  button(modal, '預覽').click();
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(1));
  await vi.waitFor(() => expect(Modal.opened[0]!.contentEl.textContent).toContain('匯入變更預覽'));
  return Modal.opened[0]!;
}
async function confirm(modal: Modal) {
  button(modal, '確認寫入').click();
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
}

it.each(['未安裝', '未啟用', '已啟用', '無法確認'])('shows renderer status %s without granting trust or blocking imports', async status => {
  const plugin = await setup();
  if (status === '無法確認') vi.spyOn(plugin.app.vault.adapter, 'exists').mockRejectedValue(new Error('Unavailable'));
  else if (status !== '未安裝') {
    plugin.app.vault.configFiles.set('.obsidian/plugins/polyglot-renderer/manifest.json', '{"id":"polyglot-renderer"}');
    plugin.app.vault.configFiles.set('.obsidian/plugins/polyglot-renderer/main.js', '// Not executed');
    plugin.app.vault.configFiles.set('.obsidian/community-plugins.json', status === '已啟用' ? '["polyglot-renderer"]' : '[]');
  }
  plugin.commands[0]!.callback();
  const form = Modal.opened[0]!;
  await vi.waitFor(() => expect(form.contentEl.querySelector('.gpt-pages-renderer-status [role=status]')!.textContent).toContain(status));
  expect(form.contentEl.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
  choose(form, file());
  await confirm(await preview(form));
  expect([...plugin.app.vault.files.values()]).toEqual([expected]);
});

it('refreshes renderer status after enabling it without changing import trust', async () => {
  const plugin = await setup(); plugin.commands[0]!.callback();
  const form = Modal.opened[0]!;
  const status = form.contentEl.querySelector('.gpt-pages-renderer-status [role=status]')!;
  await vi.waitFor(() => expect(status.textContent).toContain('未安裝'));
  plugin.app.vault.configFiles.set('.obsidian/plugins/polyglot-renderer/manifest.json', '{"id":"polyglot-renderer"}');
  plugin.app.vault.configFiles.set('.obsidian/plugins/polyglot-renderer/main.js', '// Not executed');
  plugin.app.vault.configFiles.set('.obsidian/community-plugins.json', '["polyglot-renderer"]');
  choose(form, file());
  const trust = form.contentEl.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  trust.checked = true; trust.dispatchEvent(new Event('change'));
  button(form, '重新檢查 renderer').click();
  await vi.waitFor(() => expect(status.textContent).toContain('已啟用'));
  expect(trust.checked).toBe(true);
  expect(Modal.opened).toEqual([form]);
});

it('imports the active export without choosing a file, preserving BOM and CRLF', async () => {
  const plugin = await setup();
  const command = plugin.commands.find(item => item.id === 'import-current-note')!;
  expect(command.checkCallback!(true)).toBe(false);
  const source = '\uFEFF' + input.replace(/\n/g, '\r\n');
  const original = await plugin.app.vault.create('exports/interactive.md', source);
  await plugin.app.workspace.getLeaf(false).openFile(original);
  expect(command.checkCallback!(true)).toBe(true);
  expect(Modal.opened).toHaveLength(0);
  command.callback();
  const form = Modal.opened[0]!;
  expect(form.contentEl.textContent).toContain('已選取：interactive.md');
  expect(button(form, '預覽').disabled).toBe(false);
  expect(form.contentEl.querySelector<HTMLInputElement>('input[type=file]')!.files).toHaveLength(0);
  expect(form.contentEl.querySelector<HTMLInputElement>('input[type=file]')!.hidden).toBe(true);
  expect(button(form, '更換檔案…').hidden).toBe(false);
  const plan = await preview(form);
  expect(plan.contentEl.textContent).toContain('成功配對：1');
  await confirm(plan);
  const destination = plugin.app.workspace.getActiveFile()!.path;
  expect(destination).toMatch(/^GPT Pages\/interactive-/);
  expect(plugin.app.vault.files.get(destination)).toBe('\uFEFF' + expected.replace(/\n/g, '\r\n'));
  expect(plugin.app.vault.files.get(original.path)).toBe(source);
});

it('uses the right-clicked Markdown file rather than the active note', async () => {
  const plugin = await setup();
  const active = await plugin.app.vault.create('active.md', '# Active\n');
  const clicked = await plugin.app.vault.create('clicked.md', input);
  await plugin.app.workspace.getLeaf(false).openFile(active);
  const menu = new Menu();
  plugin.app.workspace.fileMenuHandlers[0]!(menu, clicked);
  expect(menu.items.map(item => item.title)).toEqual(['使用 GPT Pages Importer 匯入']);
  menu.items[0]!.callback();
  expect(Modal.opened[0]!.contentEl.textContent).toContain('已選取：clicked.md');
  const plan = await preview(Modal.opened[0]!);
  expect(plan.contentEl.textContent).toContain(expected);
  expect(plan.contentEl.textContent).not.toContain('# Active');
  const folderMenu = new Menu();
  plugin.app.workspace.fileMenuHandlers[0]!(folderMenu, new TFolder('exports'));
  expect(folderMenu.items).toHaveLength(0);
});

it('opens the import form from the ribbon and offers the current note', async () => {
  const plugin = await setup();
  const original = await plugin.app.vault.create('current.md', input);
  await plugin.app.workspace.getLeaf(false).openFile(original);
  plugin.ribbonIcons[0]!.click();
  const form = Modal.opened[0]!;
  expect(button(form, '預覽').disabled).toBe(true);
  button(form, '使用目前筆記').click();
  expect(form.contentEl.textContent).toContain('已選取：current.md');
  expect(field(form, '來源識別名稱').value).toBe('current.md');
  expect((await preview(form)).contentEl.textContent).toContain('成功配對：1');
});

it('returns to settings with the selected file, source name, folder and explicit trust intact', async () => {
  const plugin = await setup(); plugin.commands[0]!.callback();
  const form = Modal.opened[0]!;
  choose(form, file());
  change(field(form, '來源識別名稱'), 'fixed-page');
  change(field(form, '新來源的目的目錄'), 'Imported');
  const trust = form.contentEl.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  trust.checked = true; trust.dispatchEvent(new Event('change'));
  const plan = await preview(form);
  expect(plan.contentEl.querySelector('script,iframe,img')).toBeNull();
  button(plan, '返回設定').click();
  const restored = Modal.opened[0]!;
  expect(restored.contentEl.textContent).toContain('已選取：interactive.md');
  expect(field(restored, '來源識別名稱').value).toBe('fixed-page');
  expect(field(restored, '新來源的目的目錄').value).toBe('Imported');
  expect(restored.contentEl.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
  await confirm(await preview(restored));
  expect(plugin.app.workspace.getActiveFile()!.path).toMatch(/^Imported\/fixed-page-/);
  expect([...plugin.app.vault.files.values()][0]).toBe(expected.replace('```html-source', '```html'));
});

it('updates automatic source names on file changes, preserves a custom name and resets trust', async () => {
  const plugin = await setup(); plugin.commands[0]!.callback();
  const form = Modal.opened[0]!;
  choose(form, file('first.md'));
  choose(form, file('second.markdown'));
  expect(field(form, '來源識別名稱').value).toBe('second.markdown');
  change(field(form, '來源識別名稱'), 'fixed-page');
  const trust = form.contentEl.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  trust.checked = true; trust.dispatchEvent(new Event('change'));
  drop(form, [file('third.md')]);
  expect(field(form, '來源識別名稱').value).toBe('fixed-page');
  expect(trust.checked).toBe(false);
  expect((await preview(form)).contentEl.textContent).toContain('```html-source');
});

it('imports one dropped file with an automatic source name', async () => {
  const plugin = await setup(); plugin.commands[0]!.callback();
  const form = Modal.opened[0]!;
  drop(form, [file('dropped.md')]);
  expect(field(form, '來源識別名稱').value).toBe('dropped.md');
  await confirm(await preview(form));
  expect(plugin.app.workspace.getActiveFile()!.path).toMatch(/^GPT Pages\/dropped-/);
  expect([...plugin.app.vault.files.values()][0]).toBe(expected);
});

it.each(['wrong extension', 'too large', 'multiple files'] as const)('rejects %s dropped into the form without reading or importing it', async kind => {
  const plugin = await setup(); plugin.commands[0]!.callback();
  const form = Modal.opened[0]!;
  const invalid = file(kind === 'wrong extension' ? 'image.png' : 'large.md');
  if (kind === 'too large') invalid.size = 20 * 1024 * 1024 + 1;
  const read = vi.spyOn(invalid, 'arrayBuffer');
  drop(form, kind === 'multiple files' ? [invalid, file()] : [invalid]);
  expect(button(form, '預覽').disabled).toBe(true);
  expect(form.contentEl.querySelector<HTMLElement>('[role=alert]')!.hidden).toBe(false);
  expect(read).not.toHaveBeenCalled();
  expect(plugin.app.vault.files.size).toBe(0);
});

it('checks the actual byte length if a file grows after selection', async () => {
  const plugin = await setup(); plugin.commands[0]!.callback();
  const form = Modal.opened[0]!;
  const selected = file();
  selected.arrayBuffer = async () => new ArrayBuffer(20 * 1024 * 1024 + 1);
  choose(form, selected);
  button(form, '預覽').click();
  await vi.waitFor(() => expect(form.contentEl.querySelector('[role=alert]')!.textContent).toContain('20 MiB'));
  expect(plugin.app.vault.files.size).toBe(0);
});

it('does not offer managed destinations as new sources or create duplicate imports', async () => {
  const plugin = await setup(); plugin.commands[0]!.callback();
  choose(Modal.opened[0]!, file());
  await confirm(await preview(Modal.opened[0]!));
  const destination = plugin.app.workspace.getActiveFile()!;
  const command = plugin.commands.find(item => item.id === 'import-current-note')!;
  expect(command.checkCallback!(true)).toBe(false);
  command.callback(); expect(Modal.opened).toHaveLength(0);
  const menu = new Menu();
  plugin.app.workspace.fileMenuHandlers[0]!(menu, destination);
  expect(menu.items).toHaveLength(0);
  plugin.commands[0]!.callback();
  expect(Modal.opened[0]!.contentEl.textContent).not.toContain('使用目前筆記');
  expect(Object.keys((plugin.data as State).entries)).toHaveLength(1);
  expect(plugin.app.vault.files.size).toBe(1);
});

it('locks preview navigation while writing and restores settings navigation after a write failure', async () => {
  const plugin = await setup(); plugin.commands[0]!.callback();
  choose(Modal.opened[0]!, file());
  const plan = await preview(Modal.opened[0]!);
  let rejectWrite!: (reason: Error) => void;
  vi.spyOn(plugin.app.vault, 'create').mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject; }));
  button(plan, '確認寫入').click();
  expect([...plan.contentEl.querySelectorAll('button')].every(item => item.disabled)).toBe(true);
  await vi.waitFor(() => expect(rejectWrite).toBeDefined());
  rejectWrite(new Error('寫入失敗'));
  await vi.waitFor(() => expect(button(plan, '返回設定').disabled).toBe(false));
  expect(button(plan, '確認寫入').disabled).toBe(true);
  button(plan, '返回設定').click();
  expect(Modal.opened[0]!.contentEl.textContent).toContain('已選取：interactive.md');
  expect(plugin.app.vault.files.size).toBe(0);
});

it.each(['file read', 'planning'] as const)('does not reopen a cancelled form after delayed %s', async stage => {
  const plugin = await setup();
  if (stage === 'planning') {
    plugin.commands[0]!.callback(); choose(Modal.opened[0]!, file());
    await confirm(await preview(Modal.opened[0]!));
  }
  plugin.commands[0]!.callback();
  const form = Modal.opened[0]!;
  const selected = file();
  let release!: (bytes: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>(resolve => { release = resolve; });
  const read = stage === 'file read' ? vi.spyOn(selected, 'arrayBuffer').mockReturnValueOnce(pending) : vi.spyOn(plugin.app.vault, 'readBinary').mockReturnValueOnce(pending);
  choose(form, selected);
  const previewButton = button(form, '預覽'); previewButton.click();
  await vi.waitFor(() => expect(read).toHaveBeenCalled());
  form.close();
  release(new TextEncoder().encode(stage === 'file read' ? input : expected).buffer);
  await vi.waitFor(() => expect(previewButton.disabled).toBe(false));
  expect(Modal.opened).toHaveLength(0);
  expect(plugin.app.vault.files.size).toBe(stage === 'file read' ? 0 : 1);
});
