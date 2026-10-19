import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanVerified, convertVerified } from '../src/convert';

const root = 'skills/gpt-pages-obsidian-visualizations';
const path = join(tmpdir(), `gpt-pages-skill-${process.pid}.html`);
const source = '\uFEFF<!doctype html>\r\n<html lang="zh-Hant"><head><meta charset="utf-8"></head><body>中文 📚 \\alpha &lt;p&gt;<pre>```</pre><script>throw new Error("do not execute");</script></body></html>\r\n';
const run = (args: string[]) => spawnSync(process.execPath, [root + '/scripts/build_figure_pair.mjs', ...args], { encoding: 'utf8' });
beforeEach(() => {
  writeFileSync(path, source, 'utf8');
  vi.stubGlobal('crypto', webcrypto);
});
afterAll(() => unlinkSync(path));

describe('published portable Page skill', () => {
  it.each(['plotly-function.html', 'mathbox-curve.html'])('preserves CDN template %s through v3 pairing and conversion', async name => {
    const bytes = readFileSync(root + '/assets/' + name);
    writeFileSync(path, bytes);
    const result = run(['cdn-example', 'native-cdn-example', path]);
    expect(result.status, result.stderr).toBe(0);
    const pair = JSON.parse(result.stdout);
    expect(pair.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    const output = await convertVerified(pair.figure_marker + '\n\n![圖](visualize:native-cdn-example)\n\n' + pair.source_markdown);
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain(bytes.toString('utf8'));
    expect(output.markdown).toContain('```html-source');
    expect(output.markdown).not.toMatch(/gpt-pages:|visualize:/);
  });

  it.each([
    ['default invocation', []],
    ['explicit --v3', ['--v3']]
  ])('generates only v3 pairs with exact UTF-8 source bytes: %s', async (_name, flags) => {
    const result = run([...flags, 'chart-a', 'native-chart-a', path]);
    expect(result.status, result.stderr).toBe(0);
    const pair = JSON.parse(result.stdout);
    expect(pair.format_version).toBe(3);
    expect(pair.figure_marker).toBe('<!-- gpt-pages:figure id=chart-a -->');
    expect(pair.sha256).toBe(createHash('sha256').update(source).digest('hex'));
    expect(pair.source_markdown).toContain(`<!-- gpt-pages:source v=3 id=chart-a ref=native-chart-a sha256=${pair.sha256} -->`);
    expect(pair.html_bytes).toBe(Buffer.byteLength(source));
    expect(pair.source_markdown).toContain('````html\n' + source + '````\n');
    const output = await convertVerified(pair.figure_marker + '\n\n![圖](visualize:native-chart-a)\n\n保留圖說。\n\n' + pair.source_markdown);
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain('````html-source\n' + source + '````\n');
    expect(output.markdown).toContain('保留圖說。');
    expect(output.markdown).not.toMatch(/gpt-pages|visualize:/);
    expect(output.warnings.map(w => w.code)).toEqual(['renderer-disabled']);
  });

  it('rejects a CLI request for v2 instead of silently downgrading', () => {
    const result = run(['--v2', 'chart-a', 'native-chart-a', path]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('v3 pairs only');
  });

  it('rejects a legacy version passed to the exported builder', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import { buildFigurePair } from './${root}/scripts/build_figure_pair.mjs';
      buildFigurePair('chart-a', 'native-chart-a', new Uint8Array(), 2);
    `], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('v3 pairs only');
  });

  it('distinguishes ordinary export cleanup from a separate non-executable trust-test copy', async () => {
    const result = run(['chart-a', 'native-chart-a', path]);
    expect(result.status, result.stderr).toBe(0);
    const pair = JSON.parse(result.stdout);
    const figure = pair.figure_marker + '\n\n![圖](visualize:native-chart-a)\n\n';
    const ordinary = figure + pair.source_markdown;
    const testCopy = figure + pair.source_markdown.replace('````html\n', '````html-source\n');

    const ordinaryCleanup = await cleanVerified(ordinary);
    const beforeTrust = await cleanVerified(testCopy);
    const afterTrust = await cleanVerified(testCopy, true);
    expect(ordinaryCleanup.figures).toBe(1);
    expect(ordinaryCleanup.markdown).toContain('````html\n' + source + '````\n');
    expect(beforeTrust.figures).toBe(1);
    expect(beforeTrust.markdown).toContain('````html-source\n' + source + '````\n');
    expect(beforeTrust.markdown.replace('````html-source\n', '````html\n')).toBe(ordinaryCleanup.markdown);
    expect(beforeTrust.markdown).not.toMatch(/gpt-pages|visualize:/);
    expect(afterTrust.figures).toBe(1);
    expect(afterTrust.markdown).toBe(ordinaryCleanup.markdown);
    expect((await cleanVerified(beforeTrust.markdown)).markdown).toBe(beforeTrust.markdown);
    expect((await cleanVerified(beforeTrust.markdown, true)).markdown).toBe(afterTrust.markdown);
    expect((await cleanVerified(afterTrust.markdown)).markdown).toBe(afterTrust.markdown);
    expect(beforeTrust.warnings).toEqual([]);
    expect(afterTrust.warnings.map(w => w.code)).toEqual(['trusted-rendering']);
  });

  it('pairs the bundled self-contained interactive example without changing its source', async () => {
    const example = readFileSync(root + '/assets/weighted-sum.html');
    writeFileSync(path, example);
    const result = run(['--v3', 'weighted-sum', 'native-weighted-sum', path]);
    expect(result.status, result.stderr).toBe(0);
    const pair = JSON.parse(result.stdout);
    const output = await convertVerified(pair.figure_marker + '\n\n![圖](visualize:native-weighted-sum)\n\n' + pair.source_markdown);
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain(example.toString('utf8'));
    expect(output.assets).toEqual([]);
  });

  it.each([
    ['missing newline', Buffer.from(source.trimEnd())],
    ['incomplete document', Buffer.from(source.replace('</html>', ''))],
    ['invalid UTF-8', Buffer.from([0xff, 0x0a])],
    ['oversized source', Buffer.alloc(256 * 1024 + 1, 0x20)]
  ])('rejects %s instead of producing misleading pairing metadata', (_name, bytes) => {
    writeFileSync(path, bytes);
    const result = run(['--v3', 'chart-a', 'native-chart-a', path]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toBe('');
  });
});
