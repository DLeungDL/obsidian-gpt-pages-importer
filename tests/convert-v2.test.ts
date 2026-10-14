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
    expect(output.markdown).toBe(input.replace(/!\[圖表\]\([^\n]+\)\n/, '').replace('```html\n', '```html-source\n'));
    expect(output.markdown).toContain(document);
  });
  it('keeps the synchronous API fail-closed for unverified v2 metadata', () => {
    const output = convert(bound());
    expect(output.figures).toBe(0);
    expect(output.markdown).toContain('![圖表](visualize\\:native-file)');
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
  it('removes only the valid reference in a document with a mismatched second source', async () => {
    const input = bound() + bound({ id: 'b', ref: 'other-file', source: document.replace('中文', 'changed'), sha256: hash(document) });
    const output = await convertVerified(input);
    expect(output.figures).toBe(1);
    expect(output.markdown).not.toContain('![圖表](visualize\\:native-file)');
    expect(output.markdown).toContain('![圖表](visualize\\:other-file)');
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
    expect(output.markdown).toBe(input.replace(/!\[圖表\]\([^\r\n]+\)\r\n/, '').replace('```html\r\n', '```html-source\r\n'));
    expect((await convertVerified(input.replaceAll('\r\n', '\n'))).figures).toBe(0);
  });
  it('is idempotent after the reference is removed and still checks the retained binding', async () => {
    const first = await convertVerified(bound());
    const second = await convertVerified(first.markdown);
    expect(second).toEqual(first);
    expect((await convertVerified(first.markdown.replace('中文', 'modified'))).warnings.some(w => w.code === 'source-hash-mismatch')).toBe(true);
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
    expect((await planImport(storage, state, 'v2-page', bound(), 'GPT Pages')).status).toBe('unchanged');
    expect((await planImport(storage, state, 'v2-page', bound({ source: document.replace('中文', 'changed') }), 'GPT Pages')).status).toBe('update');
  });
});
