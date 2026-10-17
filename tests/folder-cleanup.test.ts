// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GPTPagesImporter from '../src/main';
import { digest, type State } from '../src/importer';
import type { CleanupSettings } from '../src/cleanup';
import { Modal, Notice, TFolder, type Plugin } from './obsidian-stub';

const input = readFileSync('tests/fixtures/v2-escaped.input.md', 'utf8');
const expected = readFileSync('tests/fixtures/v2-escaped.expected.md', 'utf8').replaceAll('```html-source', '```html');
type HostPlugin = Plugin & {
  onload(): Promise<void>; onunload(): void;
  getCleanupSettings(): CleanupSettings;
  configureCleanup(settings: CleanupSettings, trustedFolder?: string): Promise<void>;
  scanCleanup(): void;
  cleanupStatus: string;
};
let plugins: HostPlugin[];
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); vi.useFakeTimers();
  document.body.replaceChildren(); Modal.opened = []; Notice.messages = []; plugins = [];
});
afterEach(() => { for (const plugin of plugins) plugin.onunload(); vi.useRealTimers(); });
function instance() { const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as HostPlugin; plugins.push(plugin); return plugin; }
async function setup() { const plugin = instance(); await plugin.onload(); await plugin.app.vault.createFolder('Inbox'); return plugin; }
async function enable(plugin: HostPlugin) { await plugin.configureCleanup({ enabled: true, folder: 'Inbox' }); }
async function tick() { await vi.advanceTimersByTimeAsync(1100); }
function backups(plugin: HostPlugin) { return [...plugin.app.vault.files].filter(([path]) => path.startsWith('GPT Pages Backups/cleanup/')); }
async function cleaned(plugin: HostPlugin, path = 'Inbox/a.md') {
  await tick(); await vi.waitFor(() => expect(plugin.app.vault.files.get(path)).toBe(expected));
}
function settingsControls(plugin: HostPlugin) {
  const tab = plugin.settingTabs[0]!; tab.display();
  return {
    container: tab.containerEl,
    folder: tab.containerEl.querySelector<HTMLInputElement>('input[type=text]')!,
    enabled: tab.containerEl.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0]!,
    rendering: tab.containerEl.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1]!,
    save: [...tab.containerEl.querySelectorAll('button')].find(button => button.textContent === '儲存設定')!
  };
}
function toggle(control: HTMLInputElement, value: boolean) { control.checked = value; control.dispatchEvent(new Event('change')); }
function setFolder(control: HTMLInputElement, value: string) { control.value = value; control.dispatchEvent(new Event('change')); }
function confirmTrust() { [...Modal.opened[0]!.contentEl.querySelectorAll('button')].find(button => button.textContent === '我信任此資料夾內容，啟用')!.click(); }

it('defaults to no automatic mutation until explicitly enabled', async () => {
  const plugin = await setup(); await plugin.app.vault.create('Inbox/a.md', input); await tick();
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(input); expect(backups(plugin)).toHaveLength(0);
  expect(plugin.getCleanupSettings()).toEqual({ enabled: false, folder: '', renderHtml: false });
  expect(plugin.settingTabs).toHaveLength(1);
});
it('scans only the configured folder tree without enumerating the whole vault', async () => {
  const plugin = await setup();
  await plugin.app.vault.create('Inbox/sub/example.md', input);
  await plugin.app.vault.create('Elsewhere/private.md', input);
  const enumerate = vi.spyOn(plugin.app.vault, 'getFiles').mockImplementation(() => { throw new Error('whole-vault enumeration'); });
  await enable(plugin); await cleaned(plugin, 'Inbox/sub/example.md');
  expect(enumerate).not.toHaveBeenCalled();
  expect(plugin.app.vault.files.get('Elsewhere/private.md')).toBe(input);
  expect(backups(plugin)).toHaveLength(1);
});
it('cleans existing and nested Markdown in place, preserving names, renderer mode, state and active note', async () => {
  const plugin = await setup();
  await plugin.app.vault.create('Inbox/a.md', input);
  await plugin.app.vault.create('Inbox/sub/a.markdown', input);
  const outside = await plugin.app.vault.create('Inbox Elsewhere/a.md', input);
  await plugin.app.vault.create('Inbox/image.png', input);
  await plugin.app.workspace.getLeaf(false).openFile(outside);
  const open = vi.spyOn(plugin.app.workspace, 'getLeaf');
  await enable(plugin); await cleaned(plugin);
  await vi.waitFor(() => expect(backups(plugin)).toHaveLength(2));
  expect(plugin.app.vault.files.get('Inbox/sub/a.markdown')).toBe(expected);
  expect(plugin.app.vault.files.get(outside.path)).toBe(input);
  expect(plugin.app.vault.files.get('Inbox/image.png')).toBe(input);
  expect(backups(plugin).map(([, content]) => content)).toEqual([input, input]);
  expect((plugin.data as State).entries).toEqual({}); expect(open).not.toHaveBeenCalled();
  expect(Modal.opened).toHaveLength(0);
});
it('automatically handles create, rapid modify, rename into folder and folder rename events', async () => {
  const plugin = await setup(); await enable(plugin);
  const file = await plugin.app.vault.create('Inbox/a.md', input); await cleaned(plugin);
  await plugin.app.vault.modify(file, input); await plugin.app.vault.modify(file, input);
  await cleaned(plugin); await vi.waitFor(() => expect(backups(plugin)).toHaveLength(2));
  const moving = await plugin.app.vault.create('Elsewhere/b.md', input);
  await plugin.app.vault.rename(moving, 'Inbox/sub/b.md'); await cleaned(plugin, moving.path);
  plugin.app.vault.files.set('Inbox/moved/c.md', input);
  plugin.app.vault.emit('rename', new TFolder('Inbox/moved'), 'Elsewhere/moved');
  await cleaned(plugin, 'Inbox/moved/c.md');
  await tick(); expect(backups(plugin)).toHaveLength(4);
});
it('does not create repeated backups from its own modify event or a repeated scan', async () => {
  const plugin = await setup(); await enable(plugin); await plugin.app.vault.create('Inbox/a.md', input);
  await cleaned(plugin); plugin.scanCleanup(); await tick();
  expect(backups(plugin)).toHaveLength(1); expect(plugin.app.vault.files.size).toBe(2);
});
it.each(['disable', 'unload'])('cancels queued work on %s', async action => {
  const plugin = await setup(); await enable(plugin); await plugin.app.vault.create('Inbox/a.md', input);
  if (action === 'disable') await plugin.configureCleanup({ enabled: false, folder: 'Inbox' }); else plugin.onunload();
  await tick(); expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(input); expect(backups(plugin)).toHaveLength(0);
});
it('rejects a queued atomic replacement after automation is disabled', async () => {
  const plugin = await setup(); await enable(plugin);
  let replaceStarted = false; let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const process = plugin.app.vault.process.bind(plugin.app.vault);
  vi.spyOn(plugin.app.vault, 'process').mockImplementationOnce(async (file, fn) => { replaceStarted = true; await hold; return process(file, fn); });
  await plugin.app.vault.create('Inbox/a.md', input); await tick();
  await vi.waitFor(() => expect(replaceStarted).toBe(true));
  const disabling = plugin.configureCleanup({ enabled: false, folder: 'Inbox' });
  release(); await disabling;
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(input);
  expect(backups(plugin)).toHaveLength(1); expect(backups(plugin)[0]![1]).toBe(input);
});
it('preserves a concurrent editor change and the original backup', async () => {
  const plugin = await setup(); await enable(plugin);
  const process = plugin.app.vault.process.bind(plugin.app.vault);
  vi.spyOn(plugin.app.vault, 'process').mockImplementationOnce(async (file, fn) => { plugin.app.vault.files.set(file.path, 'local edit'); return process(file, fn); });
  await plugin.app.vault.create('Inbox/a.md', input); await tick();
  await vi.waitFor(() => expect(plugin.cleanupStatus).toContain('停止覆寫'));
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe('local edit');
  expect(backups(plugin)[0]![1]).toBe(input);
});
it('leaves the source untouched on backup failure and continues other files', async () => {
  const plugin = await setup();
  await plugin.app.vault.create('Inbox/a.md', input); await plugin.app.vault.create('Inbox/b.md', input);
  const create = plugin.app.vault.create.bind(plugin.app.vault); let failed = false;
  vi.spyOn(plugin.app.vault, 'create').mockImplementation(async (path, content) => {
    if (!failed && path.startsWith('GPT Pages Backups/')) { failed = true; throw new Error('backup full'); }
    return create(path, content);
  });
  await enable(plugin); await cleaned(plugin, 'Inbox/b.md');
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(input);
  expect(plugin.cleanupStatus).toContain('Inbox/a.md：backup full');
});
it('excludes tracked import destinations and backup files from automatic writes', async () => {
  const plugin = instance(); const key = await digest('managed');
  plugin.data = { version: 1, entries: { [key]: { destination: 'Inbox/managed.md', outputHash: await digest(input) } } };
  await plugin.app.vault.createFolder('Inbox');
  await plugin.app.vault.create('Inbox/managed.md', input);
  await plugin.app.vault.create('GPT Pages Backups/a.md', input);
  await plugin.onload(); await enable(plugin); await tick();
  expect(plugin.app.vault.files.get('Inbox/managed.md')).toBe(input);
  expect(plugin.app.vault.files.get('GPT Pages Backups/a.md')).toBe(input);
  expect(backups(plugin)).toHaveLength(0);
});
it('scans persisted settings on plugin startup without requiring a fresh file event', async () => {
  const plugin = instance();
  plugin.data = { version: 1, entries: {}, cleanup: { enabled: true, folder: 'Inbox' } };
  await plugin.app.vault.createFolder('Inbox'); await plugin.app.vault.create('Inbox/a.md', input);
  await plugin.onload(); await cleaned(plugin);
});
it('validates paths and requires an existing folder before enabling, retaining prior settings on persistence failure', async () => {
  const plugin = await setup();
  for (const folder of ['', '../Inbox', 'GPT Pages Backups', 'missing']) await expect(plugin.configureCleanup({ enabled: true, folder })).rejects.toThrow();
  vi.spyOn(plugin, 'saveData').mockRejectedValueOnce(new Error('disk full'));
  await expect(enable(plugin)).rejects.toThrow('disk full');
  expect(plugin.getCleanupSettings()).toEqual({ enabled: false, folder: '', renderHtml: false });
  await plugin.app.vault.create('Inbox/a.md', input); await tick();
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(input);
});
it('reports unverified bindings without changing the file', async () => {
  const plugin = await setup(); await enable(plugin);
  const broken = input.replaceAll('v=2', 'v=99'); await plugin.app.vault.create('Inbox/a.md', broken);
  await tick(); await vi.waitFor(() => expect(plugin.cleanupStatus).toContain('需檢查'));
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(broken); expect(backups(plugin)).toHaveLength(0);
});
it.each(['invalid UTF-8', 'over size limit'])('rejects %s without a backup or source write', async kind => {
  const plugin = await setup(); await enable(plugin);
  const read = plugin.app.vault.readBinary.bind(plugin.app.vault);
  vi.spyOn(plugin.app.vault, 'readBinary').mockImplementation(async file => file.path === 'Inbox/a.md'
    ? kind === 'invalid UTF-8' ? Uint8Array.from([0xff]).buffer : new ArrayBuffer(20 * 1024 * 1024 + 1)
    : read(file));
  await plugin.app.vault.create('Inbox/a.md', input); await tick();
  await vi.waitFor(() => expect(plugin.cleanupStatus).toContain('需檢查'));
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(input); expect(backups(plugin)).toHaveLength(0);
});
it('saves settings only after the user presses save, and exposes the explicit rescan command', async () => {
  const plugin = await setup(); const tab = plugin.settingTabs[0]!; tab.display();
  const text = tab.containerEl.querySelector<HTMLInputElement>('input[type=text]')!;
  const toggle = tab.containerEl.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  text.value = 'Inbox'; text.dispatchEvent(new Event('change'));
  toggle.checked = true; toggle.dispatchEvent(new Event('change'));
  expect(plugin.getCleanupSettings().enabled).toBe(false);
  [...tab.containerEl.querySelectorAll('button')].find(button => button.textContent === '儲存設定')!.click();
  await vi.waitFor(() => expect(plugin.getCleanupSettings().enabled).toBe(true));
  await plugin.app.vault.create('Inbox/a.md', input);
  plugin.commands.find(command => command.id === 'clean-watched-folder')!.callback();
  await cleaned(plugin);
});
it('retains folder settings when a manual import persists new tracking state', async () => {
  const plugin = await setup(); await enable(plugin);
  plugin.commands[0]!.callback(); const form = Modal.opened[0]!;
  const picker = form.contentEl.querySelector<HTMLInputElement>('input[type=file]')!;
  const bytes = new TextEncoder().encode('# 手動匯入\n');
  Object.defineProperty(picker, 'files', { value: [{ name: 'manual.md', size: bytes.length, arrayBuffer: async () => bytes.buffer }] });
  picker.dispatchEvent(new Event('change'));
  [...form.contentEl.querySelectorAll('button')].find(button => button.textContent === '預覽')!.click();
  await vi.waitFor(() => expect(Modal.opened[0]?.contentEl.textContent).toContain('確認寫入'));
  [...Modal.opened[0]!.contentEl.querySelectorAll('button')].find(button => button.textContent === '確認寫入')!.click();
  await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
  expect((plugin.data as { cleanup: CleanupSettings }).cleanup).toEqual({ enabled: true, folder: 'Inbox', renderHtml: false });
  expect(Object.keys((plugin.data as State).entries)).toHaveLength(1);
});
it('rejects enabling HTML rendering without explicit confirmation for the configured folder', async () => {
  const plugin = await setup();
  const settings = { enabled: true, folder: 'Inbox', renderHtml: true };
  await expect(plugin.configureCleanup(settings)).rejects.toThrow('確認信任');
  await expect(plugin.configureCleanup(settings, 'Other')).rejects.toThrow('確認信任');
  expect(plugin.getCleanupSettings().renderHtml).toBe(false);
  await plugin.configureCleanup(settings, 'Inbox');
  expect((plugin.data as { cleanup: CleanupSettings }).cleanup.renderHtml).toBe(true);
  await plugin.configureCleanup(settings); // Persisted consent remains valid for the same scope.
  await plugin.app.vault.createFolder('Other');
  await expect(plugin.configureCleanup({ ...settings, folder: 'Other' })).rejects.toThrow('確認信任');
  expect(plugin.getCleanupSettings().folder).toBe('Inbox');
});
it('requires a valid folder before showing a trust confirmation', async () => {
  const plugin = await setup(); const controls = settingsControls(plugin);
  expect(controls.rendering.checked).toBe(false);
  toggle(controls.rendering, true);
  expect(Modal.opened).toHaveLength(0); expect(controls.rendering.checked).toBe(false);
  expect(controls.container.textContent).toContain('請先填入有效');
});
it.each(['cancel', 'dismiss'])('keeps rendering off after trust dialog %s and saving settings', async action => {
  const plugin = await setup(); const controls = settingsControls(plugin);
  setFolder(controls.folder, 'Inbox'); toggle(controls.enabled, true); toggle(controls.rendering, true);
  expect(controls.rendering.checked).toBe(false);
  expect(Modal.opened[0]!.contentEl.textContent).toContain('資料夾：Inbox（含子資料夾）');
  expect(Modal.opened[0]!.contentEl.textContent).toContain('現有及日後新增');
  if (action === 'dismiss') Modal.opened[0]!.close();
  else [...Modal.opened[0]!.contentEl.querySelectorAll('button')].find(button => button.textContent === '取消')!.click();
  controls.save.click(); await vi.waitFor(() => expect(plugin.getCleanupSettings().enabled).toBe(true));
  expect(plugin.getCleanupSettings().renderHtml).toBe(false);
});
it('does not enable rendering before confirmation and save; then cleans and renders trusted content with a backup', async () => {
  const plugin = await setup(); const controls = settingsControls(plugin);
  const source = input.replaceAll('```html', '```html-source');
  await plugin.app.vault.create('Inbox/a.md', source);
  setFolder(controls.folder, 'Inbox'); toggle(controls.enabled, true); toggle(controls.rendering, true);
  expect(plugin.getCleanupSettings().renderHtml).toBe(false);
  confirmTrust(); expect(controls.rendering.checked).toBe(true);
  expect(plugin.getCleanupSettings().renderHtml).toBe(false); expect(plugin.data).toBeNull();
  controls.save.click(); await vi.waitFor(() => expect(plugin.getCleanupSettings().renderHtml).toBe(true));
  await cleaned(plugin);
  expect(backups(plugin)[0]![1]).toBe(source);
  expect(plugin.cleanupStatus).not.toContain('需檢查');
});
it('closes the trust dialog after one confirmation without opening another during toggle synchronization', async () => {
  const plugin = await setup(); const controls = settingsControls(plugin);
  setFolder(controls.folder, 'Inbox'); toggle(controls.enabled, true); toggle(controls.rendering, true);
  expect(Modal.opened).toHaveLength(1);
  confirmTrust();
  expect(Modal.opened).toHaveLength(0);
  expect(controls.rendering.checked).toBe(true);
  expect(plugin.getCleanupSettings().renderHtml).toBe(false);
  toggle(controls.rendering, false);
  expect(Modal.opened).toHaveLength(0);
  toggle(controls.rendering, true);
  expect(Modal.opened).toHaveLength(1);
  confirmTrust();
  expect(Modal.opened).toHaveLength(0);
  controls.save.click();
  await vi.waitFor(() => expect(plugin.getCleanupSettings().renderHtml).toBe(true));
});
it('clears trust when changing the folder and requires confirming the new folder', async () => {
  const plugin = await setup(); await plugin.app.vault.createFolder('Other');
  await plugin.configureCleanup({ enabled: true, folder: 'Inbox', renderHtml: true }, 'Inbox');
  const controls = settingsControls(plugin); expect(controls.rendering.checked).toBe(true);
  setFolder(controls.folder, 'Other'); expect(controls.rendering.checked).toBe(false);
  toggle(controls.rendering, true); expect(Modal.opened[0]!.contentEl.textContent).toContain('資料夾：Other');
  confirmTrust(); controls.save.click();
  await vi.waitFor(() => expect(plugin.getCleanupSettings()).toEqual({ enabled: true, folder: 'Other', renderHtml: true }));
});
it('invalidates an open trust dialog if its folder changes before confirmation', async () => {
  const plugin = await setup(); const controls = settingsControls(plugin);
  setFolder(controls.folder, 'Inbox'); toggle(controls.rendering, true);
  setFolder(controls.folder, 'Other');
  expect(Modal.opened).toHaveLength(0); expect(controls.rendering.checked).toBe(false);
  controls.save.click(); await vi.waitFor(() => expect(plugin.getCleanupSettings().folder).toBe('Other'));
  expect(plugin.getCleanupSettings().renderHtml).toBe(false);
});
it('renders already-cleaned notes, reports a changed file and preserves consent after loading saved settings', async () => {
  const plugin = instance();
  plugin.data = { version: 1, entries: {}, cleanup: { enabled: true, folder: 'Inbox', renderHtml: true } };
  await plugin.app.vault.createFolder('Inbox');
  const source = expected.replaceAll('```html', '```html-source');
  await plugin.app.vault.create('Inbox/a.md', source);
  await plugin.onload(); await cleaned(plugin);
  expect(plugin.cleanupStatus).toContain('1 個檔案、0 組配對');
  expect(backups(plugin)[0]![1]).toBe(source);
  plugin.scanCleanup(); await tick(); expect(backups(plugin)).toHaveLength(1);
});
it('revokes rendering for future files while preserving HTML already enabled', async () => {
  const plugin = await setup();
  await plugin.configureCleanup({ enabled: true, folder: 'Inbox', renderHtml: true }, 'Inbox');
  await plugin.app.vault.create('Inbox/a.md', input.replaceAll('```html', '```html-source')); await cleaned(plugin);
  await plugin.configureCleanup({ enabled: true, folder: 'Inbox', renderHtml: false });
  const source = input.replaceAll('```html', '```html-source');
  await plugin.app.vault.create('Inbox/b.md', source); await tick();
  await vi.waitFor(() => expect(plugin.app.vault.files.get('Inbox/b.md')).toBe(expected.replaceAll('```html', '```html-source')));
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(expected);
});
it('cancels a pending atomic rendering write when trust is revoked', async () => {
  const plugin = await setup();
  await plugin.configureCleanup({ enabled: true, folder: 'Inbox', renderHtml: true }, 'Inbox');
  let started = false; let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const process = plugin.app.vault.process.bind(plugin.app.vault);
  vi.spyOn(plugin.app.vault, 'process').mockImplementationOnce(async (file, fn) => { started = true; await hold; return process(file, fn); });
  const source = expected.replaceAll('```html', '```html-source');
  await plugin.app.vault.create('Inbox/a.md', source); await tick(); await vi.waitFor(() => expect(started).toBe(true));
  const revoking = plugin.configureCleanup({ enabled: true, folder: 'Inbox', renderHtml: false });
  release(); await revoking; await tick();
  expect(plugin.app.vault.files.get('Inbox/a.md')).toBe(source);
});
