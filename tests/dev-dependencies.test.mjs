import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// Resolve through Vitest so the checks use its actual transitive dependencies.
const vitestRequire = createRequire(require.resolve('vitest/package.json'));
const obsidianRequire = createRequire(require.resolve('obsidian/package.json'));
const { interceptorPlugin } = await import(pathToFileURL(vitestRequire.resolve('@vitest/mocker/node')).href);
const { resolveConfig } = await import(pathToFileURL(vitestRequire.resolve('vite')).href);

function momentHarness() {
  const requests = [];
  const module = { exports: {} };
  // Observe attempted module loads without executing any attacker-selected file.
  runInNewContext(readFileSync(obsidianRequire.resolve('moment'), 'utf8'), {
    module,
    exports: module.exports,
    require: id => { requests.push(id); return {}; },
    console: { warn() {} }
  });
  return { moment: module.exports, requests };
}

describe('Moment locale module-loading boundary (GHSA-4p3w-j4w9-5jqw)', () => {
  it.each(['../package.json', '..\\package.json'])('rejects a crafted non-string locale coercing to %s', path => {
    const { moment, requests } = momentHarness();
    const locale = { toString: () => path, match: () => ['bypass'], toLowerCase: () => 'en' };
    expect(moment.locale(locale)).toBe('en');
    expect(requests).toEqual([]);
  });

  it('preserves normal locale selection and date formatting', () => {
    const { moment, requests } = momentHarness();
    expect(moment.locale(['en-US', 'en'])).toBe('en');
    expect(moment.utc('2026-10-19').format('YYYY-MM-DD')).toBe('2026-10-19');
    expect(requests).toEqual(['./locale/en-us']);
  });
});

describe('Vitest redirect mock file-serving boundary (GHSA-82fw-gwwq-j7x9)', () => {
  let config;

  beforeAll(async () => {
    const root = fileURLToPath(new URL('./', import.meta.url)).replaceAll('\\', '/');
    config = await resolveConfig({
      root, configFile: false, envDir: false, publicDir: false,
      server: { fs: { strict: true, allow: [root], deny: ['**/static.input.md'] } }
    }, 'serve');
  });

  async function loadRedirect(redirect) {
    const handlers = new Map();
    const plugin = interceptorPlugin();
    // Exercise the real registration and load hooks without opening a socket.
    plugin.configureServer({
      config,
      ws: { on: (name, handler) => handlers.set(name, handler), send() {} }
    });
    await handlers.get('vitest:interceptor:register')({
      type: 'redirect', raw: 'audit-probe', id: '/audit-probe', url: '/audit-probe', redirect
    });
    return plugin.load.handler('/audit-probe');
  }

  it.each([
    'audit:../package.json', 'audit:..\\package.json',
    'audit:fixtures/static.input.md', 'audit:fixtures\\static.input.md'
  ])('blocks %s', async redirect => {
    expect(await loadRedirect(redirect)).toBeUndefined();
  });

  it('still loads an allowed in-root mock', async () => {
    expect(await loadRedirect('audit:fixtures/static.expected.md')).toBe(
      readFileSync(new URL('./fixtures/static.expected.md', import.meta.url), 'utf8')
    );
  });
});
