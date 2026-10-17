// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { addRendererStatus, detectRendererStatus } from '../src/renderer-status';
import { Setting, TestApp, TestVault } from './obsidian-stub';

function install(vault: TestVault, enabled: string[] = []) {
  const directory = `${vault.configDir}/plugins/polyglot-renderer`;
  vault.configFiles.set(`${directory}/manifest.json`, '{"id":"polyglot-renderer"}');
  vault.configFiles.set(`${directory}/main.js`, '// Renderer fixture; never executed.');
  vault.configFiles.set(`${vault.configDir}/community-plugins.json`, JSON.stringify(enabled));
}

it('reports not installed even when a stale enabled entry remains', async () => {
  const vault = new TestVault();
  vault.configFiles.set('.obsidian/community-plugins.json', '["polyglot-renderer"]');
  expect(await detectRendererStatus(vault)).toBe('not-installed');
});

it.each([{ enabled: [] }, { enabled: ['other-renderer'] }, { enabled: ['polyglot-renderer'] }])('uses the exact plugin ID in enabled settings $enabled', async ({ enabled }) => {
  const vault = new TestVault(); install(vault, enabled);
  expect(await detectRendererStatus(vault)).toBe(enabled.includes('polyglot-renderer') ? 'enabled' : 'disabled');
});

it('reports an installed plugin as disabled when no enabled list exists', async () => {
  const vault = new TestVault(); install(vault);
  vault.configFiles.delete('.obsidian/community-plugins.json');
  expect(await detectRendererStatus(vault)).toBe('disabled');
});

it('uses the current vault configuration directory and accepts UTF-8 BOMs', async () => {
  const vault = new TestVault(); vault.configDir = '.custom-obsidian';
  install(vault, ['polyglot-renderer']);
  for (const [path, content] of vault.configFiles) {
    if (path.endsWith('.json')) vault.configFiles.set(path, '\uFEFF' + content);
  }
  expect(await detectRendererStatus(vault)).toBe('enabled');
  expect([...vault.configFiles.keys()].every(path => path.startsWith('.custom-obsidian/'))).toBe(true);
});

it.each([
  ['plugins/polyglot-renderer/manifest.json', '{'],
  ['plugins/polyglot-renderer/manifest.json', '{"id":"another-plugin"}'],
  ['community-plugins.json', '{'],
  ['community-plugins.json', '{}'],
  ['community-plugins.json', '["polyglot-renderer",42]']
])('reports unknown for invalid configuration at %s: %s', async (path, content) => {
  const vault = new TestVault(); install(vault, ['polyglot-renderer']);
  vault.configFiles.set(`.obsidian/${path}`, content);
  expect(await detectRendererStatus(vault)).toBe('unknown');
});

it('does not report an incomplete installation as enabled', async () => {
  const vault = new TestVault(); install(vault, ['polyglot-renderer']);
  vault.configFiles.delete('.obsidian/plugins/polyglot-renderer/main.js');
  expect(await detectRendererStatus(vault)).toBe('unknown');
});

it.each(['exists', 'read'] as const)('handles %s failures without rejecting or changing configuration', async method => {
  const vault = new TestVault(); install(vault, ['polyglot-renderer']);
  const before = [...vault.configFiles];
  vi.spyOn(vault.adapter, method).mockRejectedValue(new Error('Cannot read settings'));
  expect(await detectRendererStatus(vault)).toBe('unknown');
  expect([...vault.configFiles]).toEqual(before);
});

it('keeps the newest refresh result when an earlier read finishes late', async () => {
  const app = new TestApp(); install(app.vault);
  let finish!: (text: string) => void;
  const read = app.vault.adapter.read;
  vi.spyOn(app.vault.adapter, 'read').mockImplementation(path => path.endsWith('community-plugins.json')
    ? new Promise<string>(resolve => { finish = resolve; }) : read(path));
  const setting = new Setting(document.createElement('div'));
  addRendererStatus(setting as never, app as never);
  await vi.waitFor(() => expect(finish).toBeDefined());
  vi.mocked(app.vault.adapter.read).mockImplementation(read);
  app.vault.configFiles.set('.obsidian/community-plugins.json', '["polyglot-renderer"]');
  setting.element.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(() => expect(setting.descEl.textContent).toContain('已啟用'));
  finish('[]');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(setting.descEl.textContent).toContain('已啟用');
});
