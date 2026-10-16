import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { convert, convertVerified, assetReferences } from '../src/convert';
import { applyImport, planImport, type State, type Storage } from '../src/importer';

const document = '<!doctype html>\n<html lang="zh-Hant"><body>中文 🐱 &lt;p&gt; \\alpha<script>throw new Error("must not execute")</script></body></html>\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
interface BoundOptions { id?: string; ref?: string; source?: string; sha256?: string; url?: string; escaped?: boolean; version?: string }
function bound({ id = 'a', ref = 'native-file', source = document, sha256 = hash(source), url = `visualize:${ref}`, escaped = true, version = '2' }: BoundOptions = {}): string {
  let marker = `<!-- gpt-pages:figure v=${version} id=${id} ref=${ref} sha256=${sha256} -->`;
  if (escaped) marker = marker.replace('<!--', '\\<!--').replace('gpt-pages:', 'gpt-pages\\:');
  const reference = `![圖表](${escaped ? url.replace('visualize:', 'visualize\\:') : url})`;
  return `${marker}\n\n${reference}\n\n\`\`\`html\n${source}\`\`\`\n`;
}
const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('verified native visualization bindings', () => {
  it('matches an independently prepared fixture using the observed UI escaping', async () => {
    const output = await convertVerified(fixture('v2-escaped.input.md'));
    expect(output.markdown).toBe(fixture('v2-escaped.expected.md'));
    expect(output.figures).toBe(2);
    expect(output.assets).toEqual([]);
    expect(output.warnings.map(w => w.code)).toEqual(['renderer-disabled']);
  });
  it.each([false, true])('verifies unescaped/escaped native references (escaped=%s)', async escaped => {
    const input = bound({ escaped });
    const output = await convertVerified(input);
    expect(output.figures).toBe(1);
    expect(output.markdown).toBe('\n\n```html-source\n' + document + '```\n');
    expect(output.markdown).toContain(document);
  });
  it('keeps the synchronous API fail-closed for unverified v2 metadata', () => {
    const output = convert(bound());
    expect(output.figures).toBe(0);
    expect(output.markdown).toContain('![圖表](visualize\\:native-file)');
    expect(output.markdown).toContain(bound().split('\n')[0]);
    expect(output.warnings.some(w => w.code === 'verification-required')).toBe(true);
  });
  it('preserves v1 synchronous and asynchronous behavior', async () => {
    const input = fixture('interactive.input.md');
    expect(await convertVerified(input)).toEqual(convert(input));
  });
  it('keeps old unbound UI exports and warns instead of guessing an association', async () => {
    const input = bound().replace(/v=2 id=a ref=native-file sha256=[a-f0-9]+/, 'v=1 id=a');
    const output = await convertVerified(input);
    expect(output.figures).toBe(0);
    expect(output.markdown).toContain('![圖表](visualize\\:native-file)');
    expect(output.warnings.map(w => w.code)).toContain('unpaired-reference');
  });
  it('refuses changed HTML even when the native file ID still matches', async () => {
    const output = await convertVerified(bound({ source: document.replace('中文', 'modified'), sha256: hash(document) }));
    expect(output.figures).toBe(0);
    expect(output.markdown).toContain('![圖表](visualize\\:native-file)');
    expect(output.markdown).toContain(bound().split('\n')[0]);
    expect(output.warnings.some(w => w.code === 'source-hash-mismatch')).toBe(true);
  });
  it.each(['visualize:other-file', 'visualize:native-file#fragment', 'https://example.invalid/chart'])('refuses mismatched native URI %s', async url => {
    const output = await convertVerified(bound({ url }));
    expect(output.figures).toBe(0);
    expect(output.markdown).toContain('![圖表]');
    expect(output.warnings.some(w => w.code === 'reference-mismatch')).toBe(true);
  });
  it('refuses duplicate figure IDs across separate native files', async () => {
    const output = await convertVerified(bound() + bound({ ref: 'other-file' }));
    expect(output.figures).toBe(0);
    expect(output.markdown.match(/!\[圖表\]/g)).toHaveLength(2);
    expect(output.warnings.some(w => w.code === 'duplicate-id')).toBe(true);
  });
  it('refuses duplicate bindings and references', async () => {
    const output = await convertVerified(bound() + bound({ id: 'b' }));
    expect(output.figures).toBe(0);
    expect(output.markdown.match(/!\[圖表\]/g)).toHaveLength(2);
    expect(output.warnings.some(w => w.code === 'duplicate-reference')).toBe(true);
  });
  it('does not let malformed duplicate metadata bypass figure ID uniqueness', async () => {
    const output = await convertVerified(bound() + bound({ ref: 'other-file', sha256: 'bad' }));
    expect(output.figures).toBe(0);
    expect(output.markdown.match(/!\[圖表\]/g)).toHaveLength(2);
    expect(output.warnings.some(w => w.code === 'duplicate-id')).toBe(true);
  });
  it('removes only valid metadata in a document with a mismatched second source', async () => {
    const input = bound() + bound({ id: 'b', ref: 'other-file', source: document.replace('中文', 'changed'), sha256: hash(document) });
    const output = await convertVerified(input);
    expect(output.figures).toBe(1);
    expect(output.markdown).not.toContain('![圖表](visualize\\:native-file)');
    expect(output.markdown).toContain('![圖表](visualize\\:other-file)');
    expect(output.markdown).not.toContain('id=a ref=native-file');
    expect(output.markdown).toContain('id=b ref=other-file');
    expect(output.markdown).toContain(document.replace('中文', 'changed'));
  });
  it('refuses a native reference repeated in another inline image', async () => {
    const output = await convertVerified(bound() + '\nSee ![again](visualize:native-file)\n');
    expect(output.figures).toBe(0);
    expect(output.markdown).toContain('![圖表]');
    expect(output.warnings.some(w => w.code === 'duplicate-reference')).toBe(true);
  });
  it.each([
    ['missing-binding', bound().replace(/ ref=native-file sha256=[a-f0-9]+/, '')],
    ['malformed-marker', bound({ sha256: 'bad' })],
    ['malformed-marker', bound({ ref: '../outside' })],
    ['unknown-version', bound({ version: '99' })],
    ['missing-source', bound().replace(/```\n$/, '')],
    ['incomplete-document', bound({ source: '<div>fragment</div>\n' })],
    ['missing-source', bound().replace('\n\n```html', '\n\nIntervening prose\n\n```html')]
  ])('retains the native reference for %s', async (code, input) => {
    const output = await convertVerified(input);
    expect(output.figures).toBe(0);
    expect(output.markdown).toContain('![圖表]');
    expect(output.markdown).toContain(input.split('\n')[0]);
    expect(output.warnings.some(w => w.code === code)).toBe(true);
  });
  it('does not pair inline, nested or example references', async () => {
    const inline = bound().replace('![圖表](visualize\\:native-file)', '![圖表](visualize\\:native-file) extra text');
    expect((await convertVerified(inline)).figures).toBe(0);
    const quoted = bound().split('\n').map(line => `> ${line}`).join('\n');
    expect((await convertVerified(quoted)).figures).toBe(0);
    const example = '````markdown\n' + bound() + '````\n';
    expect((await convertVerified(example)).markdown).toBe(example);
  });
  it('checks exact BOM/CRLF/Unicode source bytes without normalizing them', async () => {
    const body = document.replaceAll('\n', '\r\n');
    const input = '\uFEFF# 中文 🐱\r\n' + bound({ source: body }).replaceAll(/(?<!\r)\n/g, '\r\n');
    const output = await convertVerified(input);
    expect(output.figures).toBe(1);
    expect(output.markdown).toBe('\uFEFF# 中文 🐱\r\n\r\n\r\n```html-source\r\n' + body + '```\r\n');
    expect((await convertVerified(input.replaceAll('\r\n', '\n'))).figures).toBe(0);
  });
  it('is idempotent after the verified marker and reference are removed', async () => {
    const first = await convertVerified(bound());
    const second = await convertVerified(first.markdown);
    expect(second.markdown).toBe(first.markdown);
    expect(second.figures).toBe(0);
    expect(second.warnings.map(w => w.code)).toEqual(['renderer-disabled']);
  });
  it.each([false, true])('cleans legacy output with a retained marker only after hash verification (changed=%s)', async changed => {
    const legacy = bound().replace('![圖表](visualize\\:native-file)\n', '').replace('```html\n', '```html-source\n');
    const input = changed ? legacy.replace('中文', 'modified') : legacy;
    const output = await convertVerified(input);
    if (changed) {
      expect(output.markdown).toBe(input);
      expect(output.figures).toBe(0);
      expect(output.warnings.some(w => w.code === 'source-hash-mismatch')).toBe(true);
    } else {
      expect(output.markdown).toBe('\n\n```html-source\n' + document + '```\n');
      expect(output.figures).toBe(1);
    }
  });
  it.each([
    { name: 'LF', newline: '\n', bom: '\uFEFF', escaped: false },
    { name: 'escaped LF', newline: '\n', bom: '\uFEFF', escaped: true },
    { name: 'CRLF', newline: '\r\n', bom: '\uFEFF', escaped: false },
    { name: 'escaped CRLF', newline: '\r\n', bom: '\uFEFF', escaped: true },
    { name: 'two opening BOMs', newline: '\n', bom: '\uFEFF\uFEFF', escaped: true }
  ])('preserves $name BOM and source bytes when the removed marker starts the file', async ({ newline, bom, escaped }) => {
    const source = document.replaceAll('\n', newline);
    const input = bom + bound({ source, escaped }).replace(/(?<!\r)\n/g, newline);
    const output = await convertVerified(input);
    expect(output.figures).toBe(1);
    expect(output.markdown).toBe(bom + newline + newline + '```html-source' + newline + source + '```' + newline);
  });
  it('keeps section headings, ordinary captions and marker-like text inside the HTML source', async () => {
    const prose = '## 每週雨水收集量\n\n每週雨水收集量\n\n';
    const source = document.replace('</body>', '<!-- gpt-pages:figure v=1 id=literal -->visualize:literal</body>');
    const input = prose + bound({ source }).replace('![圖表]', '![每週雨水收集量]');
    expect((await convertVerified(input)).markdown).toBe(prose + '\n\n```html-source\n' + source + '```\n');
  });
  it('keeps rendering opt-in separate from successful binding verification', async () => {
    expect((await convertVerified(bound())).markdown).toContain('```html-source\n' + document);
    expect((await convertVerified(bound(), true)).markdown).toContain('```html\n' + document);
  });
  it('keeps references intact when Web Crypto cannot verify the checksum', async () => {
    const mock = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('unavailable'));
    try {
      const output = await convertVerified(bound());
      expect(output.figures).toBe(0);
      expect(output.markdown).toContain('![圖表]');
      expect(output.markdown).toContain(bound().split('\n')[0]);
      expect(output.warnings.some(w => w.code === 'hash-unavailable')).toBe(true);
    } finally { mock.mockRestore(); }
  });
  it('does not misclassify escaped native references as vault assets', () => {
    expect(assetReferences('![圖表](visualize\\:native-file) ![local](local.png)')).toEqual(['local.png']);
  });
  it('uses verified v2 conversion in the actual import lifecycle', async () => {
    const files = new Map<string, string>();
    const storage: Storage = {
      read: async path => files.get(path) ?? null,
      exists: async path => files.has(path),
      create: async (path, content) => { if (files.has(path)) throw new Error('exists'); files.set(path, content); },
      replace: async (path, expected, content) => { if (files.get(path) !== expected) throw new Error('changed'); files.set(path, content); }
    };
    const empty: State = { version: 1, entries: {} };
    const plan = await planImport(storage, empty, 'v2-page', bound(), 'GPT Pages');
    expect(plan.conversion.figures).toBe(1);
    const { state } = await applyImport(storage, empty, plan, async () => {});
    expect(files.get(plan.destination)).not.toContain('![圖表]');
    expect(files.get(plan.destination)).not.toContain('gpt-pages');
    expect((await planImport(storage, state, 'v2-page', bound(), 'GPT Pages')).status).toBe('unchanged');
    expect((await planImport(storage, state, 'v2-page', bound({ source: document.replace('中文', 'changed') }), 'GPT Pages')).status).toBe('update');
  });
  it.each([false, true])('upgrades a tracked legacy import with backup while protecting local edits (edited=%s)', async edited => {
    const files = new Map<string, string>();
    const storage: Storage = {
      read: async path => files.get(path) ?? null,
      exists: async path => files.has(path),
      create: async (path, content) => { if (files.has(path)) throw new Error('exists'); files.set(path, content); },
      replace: async (path, expected, content) => { if (files.get(path) !== expected) throw new Error('changed'); files.set(path, content); }
    };
    const source = '\uFEFF' + bound();
    const legacy = source.replace('![圖表](visualize\\:native-file)\n', '').replace('```html\n', '```html-source\n');
    const initial = await planImport(storage, { version: 1, entries: {} }, 'legacy-v2-page', source, 'GPT Pages');
    const state: State = { version: 1, entries: { [initial.key]: { destination: initial.destination, outputHash: hash(legacy) } } };
    const before = edited ? legacy + '本機編輯\n' : legacy;
    files.set(initial.destination, before);
    const plan = await planImport(storage, state, 'legacy-v2-page', source, 'GPT Pages');
    if (edited) {
      expect(plan.status).toBe('conflict');
      await expect(applyImport(storage, state, plan, async () => {})).rejects.toThrow('本機修改');
      expect(files.get(initial.destination)).toBe(before);
      expect(files.size).toBe(1);
    } else {
      expect(plan.status).toBe('update');
      const result = await applyImport(storage, state, plan, async () => {});
      expect(files.get(result.backup!)).toBe(legacy);
      expect(files.get(plan.destination)).toBe('\uFEFF\n\n```html-source\n' + document + '```\n');
      expect(result.state.entries[plan.key]!.outputHash).toBe(hash(files.get(plan.destination)!));
      expect((await planImport(storage, result.state, 'legacy-v2-page', source, 'GPT Pages')).status).toBe('unchanged');
      expect(files.size).toBe(2);
    }
  });
});
