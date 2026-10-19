// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as obsidian from './obsidian-stub';
import GPTPagesImporter from '../src/main';
import { CleanupSettingTab } from '../src/cleanup-settings';
import { addRendererStatus } from '../src/renderer-status';
import { initializeLanguage } from '../src/language';
import { digest, type State } from '../src/importer';
import { Menu, Modal, Notice, Setting, TestApp, type Plugin } from './obsidian-stub';

type Host = Plugin & { onload(): Promise<void>; onunload(): void; cleanupStatus: string };
const plugins: Host[] = [];
beforeEach(() => {
  document.body.replaceChildren(); Modal.opened = []; Notice.messages = [];
  window.localStorage.clear();
});
afterEach(() => {
  for (const plugin of plugins.splice(0)) plugin.onunload();
  for (const modal of [...Modal.opened]) modal.close();
  vi.restoreAllMocks();
});
async function load(language: string) {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue(language);
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as Host;
  plugins.push(plugin); await plugin.onload(); return plugin;
}
function click(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll('button')].find(element => element.textContent === label);
  expect(button, label).toBeDefined(); button!.click();
}

it.each([
  ['en', 'Import Pages Markdown', 'Import GPT Pages Markdown', 'Automatic folder cleanup', 'Import with GPT Pages Importer', 'Select a Markdown file', 'not installed'],
  ['de', 'Import Pages Markdown', 'Import GPT Pages Markdown', 'Automatic folder cleanup', 'Import with GPT Pages Importer', 'Select a Markdown file', 'not installed'],
  ['zh-TW', '匯入 Pages Markdown', '匯入 GPT Pages Markdown', '指定資料夾自動清理', '使用 GPT Pages Importer 匯入', '選取 Markdown 檔案', '未安裝'],
  ['zh', '导入 Pages Markdown', '导入 GPT Pages Markdown', '指定文件夹自动清理', '使用 GPT Pages Importer 导入', '选择 Markdown 文件', '未安装'],
  ['zh-CN', '导入 Pages Markdown', '导入 GPT Pages Markdown', '指定文件夹自动清理', '使用 GPT Pages Importer 导入', '选择 Markdown 文件', '未安装']
])('uses the app language %s for commands, menus, settings, forms and renderer status', async (language, command, title, heading, context, fileLabel, missing) => {
  const plugin = await load(language);
  expect(plugin.commands[0]!.name).toBe(command);
  expect(plugin.ribbonIcons[0]!.title).toBe(command);
  const source = await plugin.app.vault.create('example.md', '# Example');
  const menu = new Menu(); plugin.app.workspace.fileMenuHandlers[0]!(menu, source);
  expect(menu.items[0]!.title).toBe(context);
  plugin.commands[0]!.callback();
  const form = Modal.opened[0]!.contentEl;
  expect(form.querySelector('h2')!.textContent).toBe(title);
  expect(form.querySelector('input[type=file]')!.getAttribute('aria-label')).toBe(fileLabel);
  expect(form.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
  await vi.waitFor(() => expect(form.querySelector('[aria-live=polite]')!.textContent).toContain(missing));
  const tab = plugin.settingTabs[0] as unknown as CleanupSettingTab;
  tab.display();
  expect(tab.containerEl.querySelector('.setting-item-heading')!.textContent).toBe(heading);
  expect(tab.getSettingDefinitions()[0]).toMatchObject({ heading });
  if (language === 'en' || language === 'de') {
    expect(form.textContent).not.toMatch(/[\u3400-\u9fff]/);
    expect(tab.containerEl.textContent).not.toMatch(/[\u3400-\u9fff]/);
    expect(plugin.cleanupStatus).toBe('Automatic cleanup is not enabled.');
  }
});

it('reinitializes language when the plugin loads again after an Obsidian language change', async () => {
  const chinese = await load('zh-TW');
  expect(chinese.commands[0]!.name).toBe('匯入 Pages Markdown');
  chinese.onunload();
  const simplified = await load('zh');
  expect(simplified.commands[0]!.name).toBe('导入 Pages Markdown');
  simplified.onunload();
  const english = await load('en');
  expect(english.commands[0]!.name).toBe('Import Pages Markdown');
  english.commands[0]!.callback();
  expect(Modal.opened[0]!.contentEl.querySelector('h2')!.textContent).toBe('Import GPT Pages Markdown');
});

it('uses English through the actual initializer without reading stale storage when the API returns no language', () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue(undefined as never);
  window.localStorage.setItem('language', 'zh-TW');
  const storageRead = vi.spyOn(Storage.prototype, 'getItem');
  initializeLanguage();
  const setting = new Setting(document.createElement('div'));
  addRendererStatus(setting as never, new TestApp() as never);
  expect(setting.element.querySelector('button')!.textContent).toBe('Recheck renderer');
  expect(storageRead).not.toHaveBeenCalled();
});

it.each([['en', 'legacy'], ['en', 'declarative'], ['zh', 'legacy'], ['zh', 'declarative']])('keeps the %s %s folder trust confirmation and save requirement intact', async (language, mode) => {
  await load(language);
  const labels = language === 'zh' ? {
    names: ['自动清理文件夹', '启用自动清理', '清理后启用 HTML 渲染', '清理状态与操作'],
    title: '确认信任文件夹内容', scope: '现有及日后新增或修改的所有 HTML',
    cancel: '取消', confirm: '我信任此文件夹内容，启用渲染', save: '保存设置'
  } : {
    names: ['Watched folder', 'Enable automatic cleanup', 'Enable HTML rendering after cleanup', 'Cleanup status and actions'],
    title: 'Confirm trust in folder contents', scope: 'existing and future HTML',
    cancel: 'Cancel', confirm: 'I trust this folder; enable rendering', save: 'Save settings'
  };
  const configure = vi.fn(async () => {});
  const tab = new CleanupSettingTab(new TestApp() as never, {} as never, {
    getCleanupSettings: () => ({ enabled: false, folder: 'Inbox', renderHtml: false }),
    configureCleanup: configure, scanCleanup: vi.fn(), cleanupStatus: 'Automatic cleanup is not enabled.'
  });
  if (mode === 'legacy') tab.display();
  else {
    const group = tab.getSettingDefinitions()[0]!;
    if (!('items' in group)) throw new Error('Missing group');
    expect(group.items?.map(item => 'name' in item ? item.name : '')).toEqual(labels.names);
    for (const item of group.items ?? []) if ('render' in item && item.render) item.render(new Setting(tab.containerEl) as never, {} as never);
  }
  const rendering = tab.containerEl.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[1]!;
  rendering.checked = true; rendering.dispatchEvent(new Event('change'));
  expect(rendering.checked).toBe(false);
  const dialog = Modal.opened[0]!;
  expect(dialog.contentEl.querySelector('h2')!.textContent).toBe(labels.title);
  expect(dialog.contentEl.textContent).toContain(labels.scope);
  if (language === 'en') expect(dialog.contentEl.textContent).not.toMatch(/[\u3400-\u9fff]/);
  click(dialog.contentEl, labels.cancel);
  expect(rendering.checked).toBe(false);
  rendering.checked = true; rendering.dispatchEvent(new Event('change'));
  click(Modal.opened[0]!.contentEl, labels.confirm);
  expect(rendering.checked).toBe(true);
  expect(configure).not.toHaveBeenCalled();
  click(tab.containerEl, labels.save);
  await vi.waitFor(() => expect(configure).toHaveBeenCalledWith({ enabled: false, folder: 'Inbox', renderHtml: true }, 'Inbox'));
});

it.each(['not installed', 'disabled', 'enabled', 'unable to determine'])('renders and refreshes English renderer status: %s', async state => {
  const plugin = await load('en');
  if (state !== 'not installed') {
    plugin.app.vault.configFiles.set('.obsidian/plugins/polyglot-renderer/manifest.json', '{"id":"polyglot-renderer"}');
    plugin.app.vault.configFiles.set('.obsidian/plugins/polyglot-renderer/main.js', '// Never executed');
    plugin.app.vault.configFiles.set('.obsidian/community-plugins.json', state === 'enabled' ? '["polyglot-renderer"]' : state === 'disabled' ? '[]' : '{');
  }
  plugin.commands[0]!.callback();
  const form = Modal.opened[0]!.contentEl;
  await vi.waitFor(() => expect(form.querySelector('[aria-live=polite]')!.textContent).toContain('Polyglot Renderer: ' + state));
  click(form, 'Recheck renderer');
  await vi.waitFor(() => expect(form.querySelector('[aria-live=polite]')!.textContent).toContain('Polyglot Renderer: ' + state));
  expect(form.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
});

it.each(['en', 'zh'])('imports and re-imports from the %s UI with exact bytes, hashes, warnings and notices', async language => {
  const plugin = await load(language);
  const labels = language === 'zh' ? {
    selected: '已选择：example.md', preview: '预览', title: '导入预览', paired: '成功配对：1',
    warning: 'HTML 已保留为 html-source', done: '完成（无更改）', confirm: '确认导入',
    unchanged: '内容相同，未写入', imported: '已导入：'
  } : {
    selected: 'Selected: example.md', preview: 'Preview', title: 'Import preview', paired: 'paired figures: 1',
    warning: 'HTML was preserved as html-source', done: 'Done (no changes)', confirm: 'Confirm import',
    unchanged: 'Content unchanged; nothing written', imported: 'Imported:'
  };
  const source = '\uFEFF' + readFileSync('tests/fixtures/interactive.input.md', 'utf8').replace(/\r?\n/g, '\r\n');
  const expected = '\uFEFF' + readFileSync('tests/fixtures/interactive.expected.md', 'utf8').replace(/\r?\n/g, '\r\n');
  const original = await plugin.app.vault.create('exports/example.md', source);
  for (const unchanged of [false, true]) {
    await plugin.app.workspace.getLeaf(false).openFile(original);
    plugin.commands.find(command => command.id === 'import-current-note')!.callback();
    const form = Modal.opened[0]!.contentEl;
    expect(form.textContent).toContain(labels.selected);
    click(form, labels.preview);
    await vi.waitFor(() => expect(Modal.opened[0]!.contentEl.querySelector('h2')!.textContent).toBe(labels.title));
    const preview = Modal.opened[0]!.contentEl;
    expect(preview.textContent).toContain(labels.paired);
    expect(preview.textContent).toContain(labels.warning);
    expect(preview.querySelector('script,img,iframe')).toBeNull();
    click(preview, unchanged ? labels.done : labels.confirm);
    await vi.waitFor(() => expect(Modal.opened).toHaveLength(0));
    const entry = Object.values((plugin.data as State).entries)[0]!;
    expect(plugin.app.vault.files.get(entry.destination)).toBe(expected);
    expect(entry.outputHash).toBe(await digest(expected));
    expect(plugin.app.vault.files.get(original.path)).toBe(source);
    expect(Notice.messages.at(-1)).toContain(unchanged ? labels.unchanged : labels.imported);
  }
  expect(plugin.app.vault.files.size).toBe(2);
});

it('reports damaged persisted settings in English after initializing the app language', async () => {
  vi.spyOn(obsidian, 'getLanguage').mockReturnValue('en');
  const plugin = new GPTPagesImporter({} as never, {} as never) as unknown as Host;
  plugins.push(plugin); plugin.data = { version: 9 };
  await plugin.onload();
  expect(Notice.messages.at(-1)).toContain('Unknown import history format');
  expect(plugin.commands).toHaveLength(0);
});
