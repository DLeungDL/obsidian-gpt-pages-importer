import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanVerified, convert, convertVerified } from '../src/convert';
import { applyImport, planImport, type Storage } from '../src/importer';

const body = '<!doctype html>\n<html lang="zh-Hant"><body>中文 📚 \\alpha &lt;p&gt;<script>throw new Error("never execute")</script></body></html>\n';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const figure = (id = 'chart') => `<!-- gpt-pages:figure id=${id} -->\n\n![圖表](visualize:native-${id})\n`;
const label = (id = 'chart', source = body) => `<!-- gpt-pages:source v=3 id=${id} ref=native-${id} sha256=${hash(source)} -->`;
const fence = (source = body, language = 'html') => '```' + language + '\n' + source + '```\n';
const appendix = (id = 'chart', source = body) => label(id, source) + '\n\n' + fence(source);
const input = () => '# 圖表\n\n' + figure() + '\n保留圖說。\n\n' + appendix();
const codes = (result: { warnings: { code: string }[] }) => result.warnings.map(w => w.code);
beforeEach(() => vi.stubGlobal('crypto', webcrypto));

describe('compact v3 figures with footer bindings', () => {
  it('resolves only the body ID and moves the verified source without changing its bytes', async () => {
    const output = await convertVerified(input());
    expect(output.figures).toBe(1);
    expect(output.markdown).toBe('# 圖表\n\n' + fence(body, 'html-source') + '\n\n保留圖說。\n\n\n');
    expect(codes(output)).toEqual(['renderer-disabled']);
    expect((await convertVerified(output.markdown)).markdown).toBe(output.markdown);
  });

  it('pairs out-of-order sources and identical bodies by ID, alongside legacy v2', async () => {
    const legacy = `<!-- gpt-pages:figure v=2 id=old ref=native-old sha256=${hash(body)} -->\n\n![舊圖](visualize:native-old)\n\n` + fence();
    const markdown = figure('one') + '\n# 第二圖\n\n' + figure('two') + '\n# 舊圖\n\n' + legacy + '\n' + appendix('two') + '\n' + appendix('one');
    const output = await convertVerified(markdown);
    expect(output.figures).toBe(3);
    expect(output.markdown).not.toMatch(/gpt-pages|visualize:/);
    expect(output.markdown.match(/<!doctype html>/g)).toHaveLength(3);
    expect(output.markdown.indexOf(body)).toBeLessThan(output.markdown.indexOf('# 第二圖'));
    expect(output.markdown.lastIndexOf(body)).toBeGreaterThan(output.markdown.indexOf('# 舊圖'));
  });

  it('accepts escaped Pages metadata without unescaping the HTML', async () => {
    const escaped = input().replace(/^.*gpt-pages:.*$/gm, line => line.replace('<!--', '\\<!--').replace('gpt-pages:', 'gpt-pages\\:')).replace('visualize:', 'visualize\\:');
    const output = await cleanVerified(escaped);
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain(fence());
    expect(output.markdown).not.toMatch(/gpt-pages|visualize/);
  });

  it('preserves BOM, CRLF and long tilde fences, with trust still explicit', async () => {
    const source = '\uFEFF' + body.replaceAll('\n', '\r\n');
    const originalFence = '  ~~~~HTML extra\r\n' + source + '  ~~~~';
    const markdown = '\uFEFF' + figure().replaceAll('\n', '\r\n') + '\r\n文字\r\n\r\n' + label('chart', source) + '\r\n\r\n' + originalFence;
    const clean = await cleanVerified(markdown);
    expect(clean.figures).toBe(1);
    expect(clean.markdown).toBe('\uFEFF' + originalFence + '\r\n\r\n\r\n文字\r\n\r\n\r\n');
    expect((await convertVerified(markdown)).markdown).toContain(originalFence.replace('~~~~HTML', '~~~~html-source'));
    expect((await cleanVerified(markdown, true)).markdown).toContain(originalFence.replace('~~~~HTML', '~~~~html'));
  });

  it.each([
    ['missing-source', figure() + '\n' + fence()],
    ['missing-source', input().replace('id=chart ref=', 'id=other ref=')],
    ['missing-binding', input().replace(/ ref=native-chart sha256=[a-f0-9]+/, '')],
    ['invalid-source-marker', input().replace('source v=3', 'source v=2')],
    ['invalid-source-marker', input().replace('source v=3', 'source v=9')],
    ['malformed-source', input().replace(/sha256=[a-f0-9]+/, 'sha256=bad')],
    ['source-hash-mismatch', input().replace('中文', '修改')],
    ['reference-mismatch', input().replace('(visualize:native-chart)', '(visualize:wrong)')],
    ['missing-reference', input().replace('![圖表](visualize:native-chart)', '一般圖說')],
    ['duplicate-id', input() + '\n<!-- gpt-pages:figure id=chart extra=bad -->\n'],
    ['duplicate-id', input() + '\n<!-- gpt-pages:figure v=2 id=chart -->\n'],
    ['duplicate-source', input() + '\n' + appendix()],
    ['duplicate-source', input() + '\n' + label().replace(' -->', ' extra=bad -->')],
    ['duplicate-reference', input() + '\n![重複](visualize:native-chart)\n'],
    ['duplicate-reference', input() + '\n' + label('orphan').replace('ref=native-orphan', 'ref=native-chart')],
    ['ambiguous-source', input().replace('\n保留圖說。', '\n' + fence() + '\n保留圖說。')],
    ['missing-source', input().replace(label(), label() + '\n\n介入段落。')],
    ['missing-source', input().replace(/```\n$/, '')],
    ['incomplete-document', input().replace('</html>', '')],
    ['malformed-marker', input().replace('figure id=chart', `figure v=3 id=chart ref=native-chart sha256=${hash(body)}`)]
  ])('preserves unsafe or ambiguous pairs (%s)', async (code, markdown) => {
    const output = await cleanVerified(markdown);
    expect(output.figures).toBe(0);
    expect(output.markdown).toBe(markdown);
    expect(codes(output)).toContain(code);
  });

  it('rejects a native reference shared by v2 body and v3 footer bindings', async () => {
    const legacy = `<!-- gpt-pages:figure v=2 id=old ref=native-chart sha256=${hash(body)} -->\n\n` + fence();
    const markdown = input() + '\n' + legacy;
    const output = await cleanVerified(markdown);
    expect(output.figures).toBe(0);
    expect(output.markdown).toBe(markdown);
    expect(codes(output).filter(code => code === 'duplicate-reference')).toHaveLength(2);
  });

  it('does not use examples, inline markers or nested labels as binding metadata', async () => {
    for (const metadata of ['> ' + label(), '- ' + label(), '`' + label() + '`', '```text\n' + label() + '\n```']) {
      const markdown = figure() + '\n' + metadata + '\n\n' + fence();
      expect((await cleanVerified(markdown)).markdown).toBe(markdown);
      expect((await cleanVerified(markdown)).figures).toBe(0);
    }
  });

  it('keeps an invalid pair while processing an independent valid pair', async () => {
    const invalid = input().replace('中文', '修改');
    const output = await cleanVerified(invalid + '\n' + figure('valid') + '\n' + appendix('valid'));
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain(invalid);
    expect(output.markdown).not.toContain('id=valid');
  });

  it('retains unverified compact markers when synchronous or hash APIs cannot verify', async () => {
    expect(convert(input(), true).markdown).toBe(input());
    expect(codes(convert(input(), true))).toContain('verification-required');
    vi.stubGlobal('crypto', undefined);
    const output = await cleanVerified(input());
    expect(output.markdown).toBe(input());
    expect(codes(output)).toContain('hash-unavailable');
  });

  it('reimports a v2 note as v3 without rewriting or backing up identical output, and protects local edits', async () => {
    const files = new Map<string, string>();
    const storage: Storage = {
      read: async path => files.get(path) ?? null,
      exists: async path => files.has(path),
      create: async (path, text) => {
        if (files.has(path)) throw new Error('exists');
        files.set(path, text);
      },
      replace: async (path, expected, text) => {
        if (files.get(path) !== expected) throw new Error('conflict');
        files.set(path, text);
      }
    };
    const legacy = input().replace('figure id=chart', `figure v=2 id=chart ref=native-chart sha256=${hash(body)}`).replace(label(), '<!-- gpt-pages:source v=2 id=chart -->');
    const initial = await planImport(storage, { version: 1, entries: {} }, 'example', legacy, 'Pages', false);
    const result = await applyImport(storage, { version: 1, entries: {} }, initial, async () => {});
    const count = files.size;
    const repeat = await planImport(storage, result.state, 'example', input(), 'Pages', false);
    expect(repeat.conversion.figures).toBe(1);
    expect(repeat.status).toBe('unchanged');
    expect((await applyImport(storage, result.state, repeat, async () => {})).backup).toBeUndefined();
    expect(files.size).toBe(count);
    files.set(initial.destination, '本機修改');
    const conflict = await planImport(storage, result.state, 'example', input(), 'Pages', false);
    expect(conflict.status).toBe('conflict');
    await expect(applyImport(storage, result.state, conflict, async () => {})).rejects.toThrow('本機修改');
    expect(files.get(initial.destination)).toBe('本機修改');
  });
});
