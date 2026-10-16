import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertVerified } from '../src/convert';

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
  it.each([2, 3])('generates v%s pairs that the importer verifies with exact UTF-8 source bytes', async version => {
    const result = run([...(version === 3 ? ['--v3'] : []), 'chart-a', 'native-chart-a', path]);
    expect(result.status, result.stderr).toBe(0);
    const pair = JSON.parse(result.stdout);
    expect(pair.sha256).toBe(createHash('sha256').update(source).digest('hex'));
    expect(pair.html_bytes).toBe(Buffer.byteLength(source));
    expect(pair.source_markdown).toContain('````html\n' + source + '````\n');
    const output = await convertVerified(pair.figure_marker + '\n\n![圖](visualize:native-chart-a)\n\n保留圖說。\n\n' + pair.source_markdown);
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain('````html-source\n' + source + '````\n');
    expect(output.markdown).toContain('保留圖說。');
    expect(output.markdown).not.toMatch(/gpt-pages|visualize:/);
    expect(output.warnings.map(w => w.code)).toEqual(['renderer-disabled']);
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
