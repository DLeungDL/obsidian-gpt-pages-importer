import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { convertVerified } from '../src/convert';
import { prepareImages, MAX_IMAGE_BYTES, writeImages } from '../src/images';
import { applyImport, assetReport, planImport, type State, type Storage } from '../src/importer';
import { cleanFile } from '../src/cleanup';
import { asset, png, source } from './image-fixture';

export class ImageMemory implements Storage {
  files = new Map<string, string>();
  binaries = new Map<string, ArrayBuffer>();
  failImage = false;
  failBackup = false;
  async read(path: string) { return this.files.get(path) ?? null; }
  async exists(path: string) { return this.files.has(path) || this.binaries.has(path); }
  async create(path: string, text: string) {
    if (await this.exists(path) || this.failBackup && path.startsWith('GPT Pages Backups/')) throw new Error('write failed');
    this.files.set(path, text);
  }
  async replace(path: string, expected: string, text: string) {
    if (this.files.get(path) !== expected) throw new Error('race');
    this.files.set(path, text);
  }
  async readBinary(path: string) { return this.binaries.get(path) ?? null; }
  async createBinary(path: string, bytes: ArrayBuffer) {
    if (await this.exists(path) || this.failImage) throw new Error('image write failed');
    this.binaries.set(path, bytes.slice(0));
  }
}
const empty = (): State => ({ version: 1, entries: {} });
const persist = async () => {};
const prepare = async (text: string) => prepareImages(await convertVerified(text), 'Inbox/nested/note.md');

describe('portable image conversion', () => {
  const dataUri = `data:image/png;base64,${png.toString('base64')}`;
  it.each([
    ['image/jpeg', Buffer.from([255, 216, 255, 217]), 'jpg'],
    ['image/gif', Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(7)]), 'gif'],
    ['image/webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]), 'webp']
  ] as const)('restores %s reference-style data exports with a matching payload', async (mime, bytes, ext) => {
    const payload = { ...asset('image-a', 'library-file:fixture-image', bytes), mime };
    const input = `[image1]: data:${mime};base64,${bytes.toString('base64')}\n\n![image][image1]\n\n` + source(payload).split('\n\n')[1];
    const output = await prepare(input);
    expect(output.images).toHaveLength(1);
    expect(Buffer.from(output.images![0]!.bytes)).toEqual(bytes);
    expect(output.markdown).toContain(`${payload.sha256}.${ext}`);
    expect(output.markdown).not.toMatch(/data:|gpt-pages-asset/);
  });
  it.each(['library-file', 'project-file'])('pairs only the known display fragment for %s images', async scheme => {
    const input = source(asset('image-a', `${scheme}:fixture-image`)).replace('<' + scheme + ':fixture-image>', '<' + scheme + ':fixture-image#display=full>');
    expect((await prepare(input)).images).toHaveLength(1);
    for (const fragment of ['#other', '#display=full&other=1', '?display=full']) {
      const unknown = input.replace('#display=full', fragment);
      expect((await prepare(unknown)).markdown).toBe(unknown);
    }
  });
  it.each(['inline', 'reference', 'collapsed', 'shortcut'])('restores standalone %s data images with exact bytes', async kind => {
    const image = kind === 'inline' ? `![圖片](<${dataUri}> "caption")` : kind === 'reference' ? '![圖片][image1]' : kind === 'collapsed' ? '![image1][]' : '![image1]';
    const input = kind === 'inline' ? image : `[image1]: ${dataUri} "caption"\n\n${image}`;
    const output = await prepare(input);
    expect(output.images).toHaveLength(1);
    expect(Buffer.from(output.images![0]!.bytes)).toEqual(png);
    expect(output.markdown).toContain('GPT%20Pages%20Assets/');
    expect(output.markdown).toContain('"caption"');
    expect(output.markdown).not.toContain('data:');
  });
  it('matches exported data bytes to a unique verified footer and removes only unused definitions', async () => {
    const input = `[image1]: ${dataUri}\n\n![圖片][image1]\n\n` + source().split('\n\n')[1];
    const output = await prepare(input);
    expect(output.images).toHaveLength(1);
    expect(output.markdown).not.toMatch(/data:|gpt-pages-asset/);
    const shared = input + '\n\n[download][image1]\n';
    const result = await prepare(shared);
    expect(result.images).toHaveLength(1);
    expect(result.markdown).toContain(`[image1]: ${dataUri}`);
    expect(result.markdown).toContain('[download][image1]');
  });
  it('preserves ambiguous data images, invalid footers and conflicting bytes', async () => {
    for (const input of [
      `![a](${dataUri})\n\n![b](${dataUri})`,
      `text ![a](${dataUri})`,
      `![a](${dataUri})\n\n` + source({ ...asset(), sha256: '0'.repeat(64) }).split('\n\n')[1],
      `![a](${dataUri})\n\n` + source(asset('image-a', 'library-file:fixture-image', Buffer.concat([png, Buffer.from([0])]))).split('\n\n')[1],
      `![a](${dataUri})\n\n` + source().split('\n\n')[1] + '\n' + source(asset('other', 'library-file:other')).split('\n\n')[1]
    ]) {
      const output = await prepare(input);
      expect(output.markdown).toBe(input);
      expect(output.images).toHaveLength(0);
    }
  });
  it.each(['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/png;base64,!!!!', 'data:image/jpeg;base64,aGVsbG8=', 'data:image/png;base64,aA==', 'data:image/png,hello'])('preserves invalid or unsupported data URI %s', async uri => {
    const input = `![image](${uri})`;
    const result = await prepare(input);
    expect(result.markdown).toBe(input);
    expect(result.images).toHaveLength(0);
    expect(result.warnings.some(w => w.code === 'invalid-image-asset')).toBe(true);
  });
  it('preserves BOM/CRLF, code examples and shared nested image definitions', async () => {
    const input = `\uFEFF[image1]: ${dataUri}\r\n\r\n![圖片][image1]\r\n\r\n保留 \\alpha\r\n`;
    const output = await prepare(input);
    expect(output.images).toHaveLength(1);
    expect(output.markdown.startsWith('\uFEFF')).toBe(true);
    expect(output.markdown.endsWith('保留 \\alpha\r\n')).toBe(true);
    expect(output.markdown.replaceAll('\r\n', '')).not.toContain('\n');
    for (const text of ['```markdown\n' + input.slice(1) + '```', input + '\r\ntext ![nested][image1]']) expect((await prepare(text)).markdown).toBe(text);
  });
  it('preserves duplicate definitions instead of choosing one silently', async () => {
    const input = `[image1]: ${dataUri}\n[image1]: https://example.com/image.png\n\n![image][image1]`;
    expect((await prepare(input)).markdown).toBe(input);
  });
  it('enforces count, individual and aggregate budgets for data images', async () => {
    const uri = (bytes: Buffer) => `data:image/png;base64,${bytes.toString('base64')}`;
    const many = Array.from({ length: 33 }, (_, i) => `![${i}](${uri(Buffer.concat([png, Buffer.from([i])]))})`).join('\n\n');
    expect((await prepare(many)).images).toHaveLength(0);
    const huge = `![large](${uri(Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES)]))})`;
    expect((await prepare(huge)).markdown).toBe(huge);
    const total = Array.from({ length: 5 }, (_, i) => `![${i}](${uri(Buffer.concat([png, Buffer.alloc(900000, i)]))})`).join('\n\n');
    const result = await prepare(total);
    expect(result.images).toHaveLength(4);
    expect(result.markdown).toContain('data:');
  }, 20000);
  it('restores exact image bytes, preserves alt/title and uses a deterministic relative path', async () => {
    const p = asset();
    const result = await prepare(source(p, true));
    expect(result.markdown).toBe(`![圖片](GPT%20Pages%20Assets/${p.sha256}.png "caption")\n\n\n`);
    expect(Buffer.from(result.images![0]!.bytes)).toEqual(png);
    expect(result.images![0]!.path).toBe(`Inbox/nested/GPT Pages Assets/${p.sha256}.png`);
    expect(result.warnings.some(w => w.code === 'invalid-image-asset')).toBe(false);
  });
  it('preserves BOM, CRLF and unrelated HTML bytes', async () => {
    const html = '```html-source\r\n<html>\\path library-file:fixture-image</html>\r\n```\r\n';
    const result = await prepare('\uFEFF' + source().replaceAll('\n', '\r\n') + html);
    expect(result.images).toHaveLength(1);
    expect(result.markdown.startsWith('\uFEFF![圖片]')).toBe(true);
    expect(result.markdown.endsWith(html)).toBe(true);
    expect(result.markdown.replaceAll('\r\n', '')).not.toContain('\n');
  });
  it('handles multiple distinct images and deduplicates identical bytes on disk', async () => {
    const result = await prepare(source() + source(asset('image-b', 'project-file:fixture-other')));
    expect(result.images).toHaveLength(2);
    const storage = new ImageMemory();
    await writeImages(storage, result.images!);
    expect(storage.binaries.size).toBe(1);
  });
  it.each([
    ['version', 2], ['base64', '!!!!'], ['sha256', '0'.repeat(64)], ['byte_size', 1],
    ['byte_size', MAX_IMAGE_BYTES + 1], ['mime', 'image/svg+xml'], ['filename', '../escape.png']
  ])('retains invalid %s payload and original image', async (field, value) => {
    const p = { ...asset(), [field]: value };
    const input = source(p);
    const result = await prepare(input);
    expect(result.markdown).toBe(input);
    expect(result.images).toHaveLength(0);
    expect(result.warnings.some(w => w.code === 'invalid-image-asset')).toBe(true);
  });
  it('rejects a hash-valid payload whose bytes do not have the claimed raster signature', async () => {
    const input = source(asset('image-a', 'library-file:fixture-image', Buffer.from('<script>bad</script>')));
    expect((await prepare(input)).markdown).toBe(input);
  });
  it('retains duplicate source IDs, duplicate reference bindings and duplicate image occurrences', async () => {
    for (const input of [source() + source(), source() + source(asset('other')), source() + '\ntext ![duplicate](library-file:fixture-image)']) {
      const result = await prepare(input);
      expect(result.markdown).toBe(input);
      expect(result.images).toHaveLength(0);
    }
  });
  it('does not interpret a fenced example, inline code, nested source or ordinary JSON', async () => {
    const inputs = ['````markdown\n' + source() + '````\n', '`![image](library-file:fixture-image)`\n\n' + source().split('\n\n')[1],
      source().split('\n').map(l => '> ' + l).join('\n'), source().replace('```gpt-pages-asset', '```json')];
    for (const input of inputs) expect((await prepare(input!)).markdown).toBe(input);
  });
  it('retains unclosed or malformed asset fences', async () => {
    for (const input of [source().replace(/```\n$/, ''), source().replace('"version":1', '"version":')]) {
      expect((await prepare(input)).markdown).toBe(input);
    }
  });
  it('preserves a bad source while restoring its valid neighbor', async () => {
    const invalid = source({ ...asset('bad', 'library-file:fixture-bad'), sha256: '0'.repeat(64) });
    const result = await prepare(source() + invalid);
    expect(result.images).toHaveLength(1);
    expect(result.markdown).toContain(invalid);
  });
  it('rejects excess source count and total decoded byte budget', async () => {
    const count = Array.from({ length: 33 }, (_, i) => source(asset(`a-${i}`, `library-file:fixture-${i}`))).join('\n');
    expect((await prepare(count)).images).toHaveLength(0);
    const large = Buffer.concat([png, deflateSync(Buffer.alloc(700000)), Buffer.alloc(900000)]);
    const result = await prepare(Array.from({ length: 5 }, (_, i) => source(asset(`a-${i}`, `library-file:fixture-${i}`, large))).join('\n'));
    expect(result.images).toHaveLength(4);
    expect(result.markdown).toContain('gpt-pages-asset');
  }, 20000);
});

describe('binary write lifecycle', () => {
  it('imports and cleans data URI exports with exact backups and repeat-import stability', async () => {
    const input = `[image1]: data:image/png;base64,${png.toString('base64')}\n\n![image][image1]\n`;
    const storage = new ImageMemory();
    const plan = await planImport(storage, empty(), 'data.md', input, 'Inbox');
    expect(storage.binaries.size).toBe(0);
    const { state } = await applyImport(storage, empty(), plan, persist);
    expect(storage.binaries.size).toBe(1);
    expect((await planImport(storage, state, 'data.md', input, 'Inbox')).status).toBe('unchanged');
    storage.files.set('Inbox/cleanup.md', input);
    const clean = await cleanFile(storage, 'Inbox/cleanup.md');
    expect(storage.files.get(clean.backup!)).toBe(input);
    expect(storage.files.get('Inbox/cleanup.md')).not.toContain('data:');
    expect((await cleanFile(storage, 'Inbox/cleanup.md')).backup).toBeUndefined();
    const failed = new ImageMemory(); failed.files.set('Inbox/cleanup.md', input); failed.failImage = true;
    await expect(cleanFile(failed, 'Inbox/cleanup.md')).rejects.toThrow();
    expect(failed.files.get('Inbox/cleanup.md')).toBe(input);
  });
  it('plans without writes, commits exact binaries, and repeats without backups or duplicate files', async () => {
    const storage = new ImageMemory();
    const plan = await planImport(storage, empty(), 'page.md', source(), 'Inbox');
    expect(storage.binaries.size).toBe(0);
    expect((await assetReport(storage, plan)).join()).toContain('已驗證');
    const { state } = await applyImport(storage, empty(), plan, persist);
    const count = storage.files.size;
    const repeat = await planImport(storage, state, 'page.md', source(), 'Inbox');
    expect(repeat.status).toBe('unchanged');
    await applyImport(storage, state, repeat, persist);
    expect(storage.files.size).toBe(count);
    expect(storage.binaries.size).toBe(1);
    storage.binaries.clear();
    await applyImport(storage, state, repeat, persist);
    expect(storage.binaries.size).toBe(1);
  });
  it('stops note creation if binary write or readback verification fails', async () => {
    for (const broken of ['write', 'readback']) {
      const storage = new ImageMemory();
      const plan = await planImport(storage, empty(), 'page.md', source(), 'Inbox');
      if (broken === 'write') storage.failImage = true;
      else storage.readBinary = async () => new Uint8Array([1]).buffer;
      await expect(applyImport(storage, empty(), plan, persist)).rejects.toThrow();
      expect(storage.files.has(plan.destination)).toBe(false);
    }
  });
  it('backs up before an update and retains the note and existing conflicting binary', async () => {
    const storage = new ImageMemory();
    const initial = await planImport(storage, empty(), 'page.md', 'old note', 'Inbox');
    const { state } = await applyImport(storage, empty(), initial, persist);
    const plan = await planImport(storage, state, 'page.md', source(), 'Inbox');
    const image = plan.conversion.images![0]!;
    storage.binaries.set(image.path, new Uint8Array([9]).buffer);
    await expect(applyImport(storage, state, plan, persist)).rejects.toThrow('圖片內容衝突');
    expect(storage.files.get(plan.destination)).toBe('old note');
    expect([...storage.files].some(([p, text]) => p.startsWith('GPT Pages Backups/') && text === 'old note')).toBe(true);
    expect(new Uint8Array(storage.binaries.get(image.path)!)).toEqual(new Uint8Array([9]));
  });
  it('rejects local note edits before creating any images', async () => {
    const storage = new ImageMemory();
    const plan = await planImport(storage, empty(), 'page.md', source(), 'Inbox');
    storage.files.set(plan.destination, 'local');
    await expect(applyImport(storage, empty(), plan, persist)).rejects.toThrow();
    expect(storage.binaries.size).toBe(0);
  });
  it('does not create binaries after backup failure and never rewrites on a replacement race', async () => {
    const storage = new ImageMemory();
    storage.files.set('Inbox/page.md', source()); storage.failBackup = true;
    await expect(cleanFile(storage, 'Inbox/page.md')).rejects.toThrow();
    expect(storage.binaries.size).toBe(0);
    storage.failBackup = false;
    storage.replace = async path => { storage.files.set(path, 'local edit'); throw new Error('race'); };
    await expect(cleanFile(storage, 'Inbox/page.md')).rejects.toThrow('race');
    expect(storage.files.get('Inbox/page.md')).toBe('local edit');
  });
  it('reuses a byte-identical create race and rejects a conflicting race', async () => {
    const image = (await prepare(source())).images![0]!;
    for (const identical of [true, false]) {
      const storage = new ImageMemory();
      storage.createBinary = async path => {
        storage.binaries.set(path, identical ? image.bytes.buffer : new Uint8Array([1]).buffer);
        throw new Error('exists');
      };
      if (identical) await writeImages(storage, [image]);
      else await expect(writeImages(storage, [image])).rejects.toThrow();
    }
  });
  it('cleans images in place with exact backup, then skips unchanged notes', async () => {
    const storage = new ImageMemory(); const input = '\uFEFF' + source().replaceAll('\n', '\r\n');
    storage.files.set('Inbox/a.md', input);
    const result = await cleanFile(storage, 'Inbox/a.md');
    expect(storage.files.get(result.backup!)).toBe(input);
    expect(storage.binaries.size).toBe(1);
    expect(storage.files.get('Inbox/a.md')).toContain('GPT%20Pages%20Assets/');
    const count = storage.files.size;
    expect((await cleanFile(storage, 'Inbox/a.md')).backup).toBeUndefined();
    expect(storage.files.size).toBe(count);
  });
  it('retains source on storage capability failure and stops if cleanup was disabled', async () => {
    const storage = new ImageMemory(); storage.files.set('Inbox/a.md', source());
    storage.createBinary = undefined as never;
    await expect(cleanFile(storage, 'Inbox/a.md')).rejects.toThrow();
    expect(storage.files.get('Inbox/a.md')).toBe(source());
    const result = await cleanFile(storage, 'Inbox/a.md', () => false);
    expect(result.backup).toBeUndefined();
  });
});
