import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { convertVerified } from '../src/convert';
import { prepareImages } from '../src/images';

const root = 'skills/gpt-pages-obsidian-visualizations/scripts/';
const dir = mkdtempSync(join(tmpdir(), 'portable-image-skill-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const formats = [
  ['png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.alloc(8)])],
  ['jpg', Buffer.from([255, 216, 255, 217])],
  ['gif', Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(7)])],
  ['webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])]
] as const;
const run = (args: string[]) => spawnSync(process.execPath, [root + 'build_image_asset.mjs', ...args], { encoding: 'utf8' });
const verify = (file: string, args: string[] = []) => spawnSync('python', [root + 'verify_image_export.py', file, ...args], { encoding: 'utf8' });

it.each(formats)('agrees on %s signatures across generator, importer and export verifier', async (ext, bytes) => {
  // Signature fixtures exercise accepted headers; they are not rendering evidence.
  const path = join(dir, 'image.' + ext); writeFileSync(path, bytes);
  const result = run(['image-a', 'library-file:fixture-image', path]);
  expect(result.status, result.stderr).toBe(0);
  const generated = JSON.parse(result.stdout);
  expect(generated.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  const markdown = '![image](library-file\\:fixture-image)\n\n' + generated.source_markdown;
  const file = join(dir, 'export-' + ext + '.md'); writeFileSync(file, '\uFEFF' + markdown.replaceAll('\n', '\r\n'));
  const output = await prepareImages(await convertVerified(markdown), 'Inbox/test.md');
  expect(output.images).toHaveLength(1);
  const out = join(dir, 'extract-' + ext);
  const checked = verify(file, ['--expected', file, '--out', out]);
  expect(checked.status, checked.stderr).toBe(0);
  expect(readFileSync(join(out, readdirSync(out)[0]!))).toEqual(bytes);
  expect(verify(file, ['--out', out]).status).toBe(1);
});

it('rejects generator input with unknown image bytes, over-limit size or invalid native references', () => {
  const path = join(dir, 'bad.bin'); writeFileSync(path, '<svg></svg>');
  expect(run(['x', 'library-file:fixture-image', path]).status).toBe(1);
  writeFileSync(path, Buffer.alloc(1024 * 1024 + 1));
  expect(run(['x', 'library-file:fixture-image', path]).status).toBe(1);
  expect(run(['x', 'https://example.com/a.png', path]).status).toBe(1);
});

it('verifier rejects changed bytes and metadata, unclosed sources and fenced examples', () => {
  const path = join(dir, 'image.png'); writeFileSync(path, formats[0][1]);
  const generated = JSON.parse(run(['x', 'library-file:fixture-image', path]).stdout);
  const good = join(dir, 'canonical.md'); writeFileSync(good, generated.source_markdown);
  const file = join(dir, 'bad.md');
  for (const bad of [generated.source_markdown.replace(generated.sha256, '0'.repeat(64)),
    generated.source_markdown.replace('"version": 1', '"version": 2'),
    generated.source_markdown.replace(/```\n$/, ''), '````markdown\n' + generated.source_markdown + '````\n',
    generated.source_markdown + generated.source_markdown]) {
    writeFileSync(file, bad);
    expect(verify(file).status).toBe(1);
  }
  const different = { ...generated, id: 'different' }; delete different.source_markdown;
  writeFileSync(file, '```gpt-pages-asset\n' + JSON.stringify(different) + '\n```\n');
  expect(verify(file, ['--expected', good]).status).toBe(1);
});
