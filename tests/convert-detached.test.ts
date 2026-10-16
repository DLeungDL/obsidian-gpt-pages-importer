import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanVerified, convert, convertVerified } from '../src/convert';
import { cleanFile } from '../src/cleanup';
import { applyImport, planImport, type State, type Storage } from '../src/importer';

const source = '<!doctype html>\n<html lang="zh-Hant"><body>中文 📚 &lt;p&gt; \\alpha<script>throw new Error("never execute")</script></body></html>\n';
const secondSource = source.replace('中文', '第二圖');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const escape = (text: string) => text.replace('<!--', '\\<!--').replace('gpt-pages:', 'gpt-pages\\:').replace('visualize:', 'visualize\\:');
const figure = (id = 'first', body = source) => `<!-- gpt-pages:figure v=2 id=${id} ref=native-${id} sha256=${hash(body)} -->\n\n![圖表](visualize:native-${id})\n`;
const label = (id = 'first') => `<!-- gpt-pages:source v=2 id=${id} -->`;
const fence = (body = source, language = 'html') => '```' + language + '\n' + body + '```\n';
const appendix = (id = 'first', body = source) => label(id) + '\n\n' + fence(body);
const input = () => '# 第一圖\n\n' + figure() + '\n保留圖說。\n\n# 原始碼\n\n' + appendix();
const codes = (result: { warnings: { code: string }[] }) => result.warnings.map(w => w.code);
beforeEach(() => vi.stubGlobal('crypto', webcrypto));

describe('explicit HTML sources in an appendix', () => {
  it('moves a verified fence to its figure while keeping captions and appendix prose', async () => {
    const output = await convertVerified(input());
    expect(output.figures).toBe(1);
    expect(output.markdown).toBe('# 第一圖\n\n```html-source\n' + source + '```\n\n\n保留圖說。\n\n# 原始碼\n\n\n');
    expect(codes(output)).toEqual(['renderer-disabled']);
    expect((await convertVerified(output.markdown)).markdown).toBe(output.markdown);
  });

  it('pairs multiple out-of-order sources by ID, keeping identical sources distinct', async () => {
    const markdown = figure() + '\n# 第二圖\n\n' + figure('second', secondSource) + '\n# 第三圖\n\n' + figure('third') + '\n# 原始碼\n\n' + appendix('second', secondSource) + '\n' + appendix('third') + '\n' + appendix();
    const output = await convertVerified(markdown);
    expect(output.figures).toBe(3);
    expect(output.markdown).not.toMatch(/gpt-pages|visualize:/);
    expect(output.markdown.indexOf(source)).toBeLessThan(output.markdown.indexOf('# 第二圖'));
    expect(output.markdown.indexOf(secondSource)).toBeGreaterThan(output.markdown.indexOf('# 第二圖'));
    expect(output.markdown.indexOf(secondSource)).toBeLessThan(output.markdown.indexOf('# 第三圖'));
    expect(output.markdown.lastIndexOf(source)).toBeGreaterThan(output.markdown.indexOf('# 第三圖'));
    expect(output.markdown.match(/<!doctype html>/g)).toHaveLength(3);
  });

  it('supports escaped Page markers and native references without decoding source bytes', async () => {
    const markdown = input().replace(/^.*gpt-pages:(?:figure|source).*$/gm, escape).replace(/^!\[圖表\].*$/gm, escape);
    const output = await convertVerified(markdown);
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain(source);
    expect(output.markdown).not.toMatch(/gpt-pages|visualize/);
  });

  it.each([false, true])('keeps trust separate from verified relocation (trusted=%s)', async trusted => {
    const output = await convertVerified(input(), trusted);
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain(fence(source, trusted ? 'html' : 'html-source'));
    expect(output.markdown.match(/<!doctype html>/g)).toHaveLength(1);
  });

  it('preserves BOM, CRLF, long tilde fences, indentation and metadata when relocating', async () => {
    const body = '\uFEFF' + source.replaceAll('\n', '\r\n');
    const originalFence = '  ~~~~HTML extra\r\n' + body + '  ~~~~\r\n';
    const markdown = '\uFEFF' + figure('first', body).replaceAll('\n', '\r\n') + '\r\n保留文字\r\n\r\n' + label() + '\r\n\r\n' + originalFence;
    const output = await cleanVerified(markdown);
    expect(output.figures).toBe(1);
    expect(output.markdown).toBe('\uFEFF' + originalFence + '\r\n\r\n保留文字\r\n\r\n\r\n');
    const untrusted = await convertVerified(markdown);
    expect(untrusted.markdown).toContain(originalFence.replace('~~~~HTML extra', '~~~~html-source extra'));
    expect((await cleanVerified(markdown.replace('中文', 'changed'))).figures).toBe(0);
  });

  it('adds a fence boundary at the insertion point when the appendix ends without a newline', async () => {
    const output = await convertVerified(input().replace(/\n$/, ''));
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain(fence(source, 'html-source') + '\n\n保留圖說。');
    expect((await convertVerified(output.markdown)).markdown).toBe(output.markdown);
  });

  it('can resolve an explicitly labeled source before the figure while keeping the file BOM', async () => {
    const output = await cleanVerified('\uFEFF' + appendix() + '\n# 第一圖\n\n' + figure());
    expect(output.figures).toBe(1);
    expect(output.markdown).toBe('\uFEFF\n\n# 第一圖\n\n' + fence() + '\n');
  });

  it.each([
    ['duplicate-source', input() + '\n' + appendix()],
    ['duplicate-source', input() + '\n' + label().replace(' -->', ' extra=bad -->')],
    ['invalid-source-marker', input().replace(label(), label().replace('v=2', 'v=99'))],
    ['invalid-source-marker', input().replace(label(), label().replace(' -->', ' extra=bad -->'))],
    ['missing-source', input().replace(label(), '')],
    ['missing-source', input().replace(label(), label('other'))],
    ['missing-source', input().replace(label(), label() + '\n\nIntervening prose')],
    ['missing-source', input().replace(/```\n$/, '')],
    ['incomplete-document', input().replace(fence(), fence('<div>fragment</div>\n'))],
    ['source-hash-mismatch', input().replace(fence(), fence(source.replace('中文', 'changed')))],
    ['missing-reference', input().replace('![圖表](visualize:native-first)\n', '')],
    ['reference-mismatch', input().replace('visualize:native-first', 'visualize:other')],
    ['duplicate-reference', input() + '\nSee ![again](visualize:native-first)\n'],
    ['duplicate-id', input() + '\n' + figure()],
    ['ambiguous-source', input().replace('![圖表](visualize:native-first)\n', '![圖表](visualize:native-first)\n\n' + fence())]
  ])('preserves unverified input for %s', async (code, markdown) => {
    const output = await cleanVerified(markdown);
    expect(output.figures).toBe(0);
    expect(output.markdown).toBe(markdown);
    expect(codes(output)).toContain(code);
  });

  it.each(['quote', 'list', 'example', 'inline'])('does not interpret a source label in a %s', async kind => {
    const transform = (text: string) => kind === 'quote' ? text.split('\n').map(line => '> ' + line).join('\n')
      : kind === 'list' ? '- Nested\n' + text.split('\n').map(line => '  ' + line).join('\n')
      : kind === 'example' ? '````markdown\n' + text + '````\n' : 'inline ' + text;
    const markdown = figure() + '\n# 原始碼\n\n' + transform(appendix());
    const output = await cleanVerified(markdown);
    expect(output.figures).toBe(0);
    expect(output.markdown).toBe(markdown);
  });

  it('cleans a good pair while preserving another pair with changed source bytes', async () => {
    const markdown = figure() + '\n' + figure('second', secondSource) + '\n# 原始碼\n\n' + appendix('second', secondSource.replace('第二圖', 'changed')) + '\n' + appendix();
    const output = await cleanVerified(markdown);
    expect(output.figures).toBe(1);
    expect(output.markdown).not.toContain(label());
    expect(output.markdown).toContain(label('second'));
    expect(output.markdown).toContain(figure('second', secondSource));
    expect(output.markdown).toContain(secondSource.replace('第二圖', 'changed'));
    expect(output.markdown.match(/<!doctype html>/g)).toHaveLength(2);
  });

  it('retains all markers and appendix content when checksum verification is unavailable', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValueOnce(new Error('unavailable'));
    try {
      const output = await cleanVerified(input());
      expect(output.markdown).toBe(input());
      expect(output.figures).toBe(0);
      expect(codes(output)).toContain('hash-unavailable');
    } finally { digest.mockRestore(); }
    const synchronous = convert(input());
    expect(synchronous.figures).toBe(0);
    expect(synchronous.markdown).toContain(label());
    expect(synchronous.markdown).toContain('![圖表]');
    expect(codes(synchronous)).toContain('verification-required');
  });
});

class MemoryStorage implements Storage {
  files = new Map<string, string>();
  async read(path: string) { return this.files.get(path) ?? null; }
  async exists(path: string) { return this.files.has(path); }
  async create(path: string, content: string) { if (this.files.has(path)) throw new Error('exists'); this.files.set(path, content); }
  async replace(path: string, expected: string, content: string) { if (this.files.get(path) !== expected) throw new Error('changed'); this.files.set(path, content); }
}

it('backs up the exact appendix file before cleanup and enables rendering only after trust', async () => {
  const storage = new MemoryStorage();
  const original = input().replace('```html', '```html-source');
  storage.files.set('Inbox/example.md', original);
  const first = await cleanFile(storage, 'Inbox/example.md');
  expect(first.figures).toBe(1);
  expect(storage.files.get(first.backup!)).toBe(original);
  const cleaned = storage.files.get('Inbox/example.md')!;
  expect(cleaned).toContain('```html-source');
  expect(cleaned).not.toContain('gpt-pages');
  const before = new Map(storage.files);
  expect((await cleanFile(storage, 'Inbox/example.md')).backup).toBeUndefined();
  expect(storage.files).toEqual(before);
  const trusted = await cleanFile(storage, 'Inbox/example.md', () => true, true);
  expect(storage.files.get(trusted.backup!)).toBe(cleaned);
  expect(storage.files.get('Inbox/example.md')).toBe(cleaned.replace('```html-source', '```html'));
});

it('does not relocate or remove appendix source if its backup cannot be saved', async () => {
  const storage = new MemoryStorage(); storage.files.set('Inbox/example.md', input());
  vi.spyOn(storage, 'create').mockRejectedValueOnce(new Error('backup failed'));
  await expect(cleanFile(storage, 'Inbox/example.md')).rejects.toThrow('backup failed');
  expect(storage.files.get('Inbox/example.md')).toBe(input());
});

it('supports repeated imports and rejects overwriting local edits after appendix relocation', async () => {
  const storage = new MemoryStorage(), empty: State = { version: 1, entries: {} };
  const plan = await planImport(storage, empty, 'appendix-example', input(), 'GPT Pages');
  expect(plan.conversion.figures).toBe(1);
  const result = await applyImport(storage, empty, plan, async () => {});
  expect((await planImport(storage, result.state, 'appendix-example', input(), 'GPT Pages')).status).toBe('unchanged');
  const edited = storage.files.get(plan.destination)! + '\nLocal edit\n';
  storage.files.set(plan.destination, edited);
  const conflict = await planImport(storage, result.state, 'appendix-example', input(), 'GPT Pages');
  expect(conflict.status).toBe('conflict');
  await expect(applyImport(storage, result.state, conflict, async () => {})).rejects.toThrow('本機修改');
  expect(storage.files.get(plan.destination)).toBe(edited);
});
