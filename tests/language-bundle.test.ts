import { build } from 'esbuild';
import { Script } from 'node:vm';
import { expect, it } from 'vitest';

it.each([
  { name: 'modern API', modern: true, storage: true, expected: 'Import Pages Markdown' },
  { name: 'legacy host without getLanguage', modern: false, storage: true, expected: '匯入 Pages Markdown' },
  { name: 'legacy host without usable storage', modern: false, storage: false, expected: 'Import Pages Markdown' }
])('loads the real bundle and registers commands on a $name', async ({ modern, storage, expected }) => {
  const result = await build({
    entryPoints: ['src/main.ts'], bundle: true, write: false,
    platform: 'neutral', format: 'cjs', target: 'es2022', external: ['obsidian']
  });
  let storageReads = 0;
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
    ...(modern ? { getLanguage: () => 'en' } : {})
  };
  const module = { exports: {} as { default: new () => HostPlugin & { onload(): Promise<void> } } };
  const globals = {
    module,
    require: (name: string) => { if (name !== 'obsidian') throw new Error('Unexpected dependency'); return host; },
    ...(storage ? { window: { localStorage: { getItem: (key: string) => { expect(key).toBe('language'); storageReads++; return 'zh-TW'; } } } } : {})
  };
  // No document or DOM helpers: language reads must happen at load, not module import.
  new Script(result.outputFiles[0]!.text).runInNewContext(globals);
  expect(storageReads).toBe(0);
  const plugin = new module.exports.default();
  await plugin.onload();
  expect(plugin.commands[0]!.name).toBe(expected);
  expect(storageReads).toBe(!modern && storage ? 1 : 0);
});
