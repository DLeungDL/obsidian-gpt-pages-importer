import { build } from 'esbuild';
import { Script } from 'node:vm';
import { expect, it } from 'vitest';

it.each([
  { name: 'modern English API', getLanguage: () => 'en', storage: 'stale', expected: 'Import Pages Markdown' },
  { name: 'modern Traditional Chinese API', getLanguage: () => 'zh-TW', storage: 'blocked', expected: '匯入 Pages Markdown' },
  { name: 'unsupported French API', getLanguage: () => 'fr', storage: 'stale', expected: 'Import Pages Markdown' },
  { name: 'unsupported Japanese API', getLanguage: () => 'ja', storage: 'stale', expected: 'Import Pages Markdown' },
  { name: 'legacy host with stale language storage', storage: 'stale', expected: 'Import Pages Markdown' },
  { name: 'legacy host with blocked storage', storage: 'blocked', expected: 'Import Pages Markdown' },
  { name: 'legacy host without a window', storage: 'absent', expected: 'Import Pages Markdown' },
  { name: 'failed modern API', getLanguage: () => { throw new Error('Unavailable'); }, storage: 'stale', expected: 'Import Pages Markdown' }
])('loads the real bundle and registers commands on a $name', async ({ getLanguage, storage, expected }) => {
  const result = await build({
    entryPoints: ['src/main.ts'], bundle: true, write: false,
    platform: 'neutral', format: 'cjs', target: 'es2022', external: ['obsidian']
  });
  let storageAccesses = 0;
  class HostPlugin {
    commands: { name: string }[] = [];
    app = {
      workspace: { on: () => ({}), onLayoutReady: () => {} }
    };
    async loadData() { return null; }
    addCommand(command: { name: string }) { this.commands.push(command); }
    addRibbonIcon() {}
    registerEvent() {}
    addSettingTab() {}
  }
  const host = {
    Plugin: HostPlugin, Modal: class {}, PluginSettingTab: class {},
    ...(getLanguage ? { getLanguage } : {})
  };
  const module = { exports: {} as { default: new () => HostPlugin & { onload(): Promise<void> } } };
  const globals = {
    module,
    require: (name: string) => { if (name !== 'obsidian') throw new Error('Unexpected dependency'); return host; },
    ...(storage === 'absent' ? {} : { window: {
      get localStorage() {
        storageAccesses++;
        if (storage === 'blocked') throw new Error('SecurityError');
        return { getItem: () => 'zh-TW' };
      },
      get sessionStorage() { storageAccesses++; throw new Error('SecurityError'); }
    } })
  };
  // No document or DOM helpers: loading must not require browser storage.
  new Script(result.outputFiles[0]!.text).runInNewContext(globals);
  expect(storageAccesses).toBe(0);
  const plugin = new module.exports.default();
  await plugin.onload();
  expect(plugin.commands[0]!.name).toBe(expected);
  expect(storageAccesses).toBe(0);
  expect(/\b(?:localStorage|sessionStorage)\b/.test(result.outputFiles[0]!.text)).toBe(false);
});
