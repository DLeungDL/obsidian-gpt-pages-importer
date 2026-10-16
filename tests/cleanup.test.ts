import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanVerified } from '../src/convert';
import { cleanFile, cleanupCandidate, cleanupFolder, CleanupQueue, readCleanupSettings } from '../src/cleanup';
import type { Storage } from '../src/importer';

const input = readFileSync('tests/fixtures/v2-escaped.input.md', 'utf8');
const expected = readFileSync('tests/fixtures/v2-escaped.expected.md', 'utf8').replaceAll('```html-source', '```html');
class MemoryStorage implements Storage {
  files = new Map([['Inbox/example.md', input]]);
  async read(path: string) { return this.files.get(path) ?? null; }
  async exists(path: string) { return this.files.has(path); }
  async create(path: string, content: string) { if (this.files.has(path)) throw new Error('exists'); this.files.set(path, content); }
  async replace(path: string, current: string, content: string) {
    if (this.files.get(path) !== current) throw new Error('concurrent edit');
    this.files.set(path, content);
  }
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.useRealTimers());

it.each(['html', 'html-source', 'HTML', 'HTML-Source'])('cleans verified metadata while preserving %s fence tokens, HTML bytes and prose', async language => {
  const source = input.replaceAll('```html', '```' + language);
  const output = await cleanVerified(source);
  expect(output.figures).toBe(2);
  expect(output.markdown).toBe(expected.replaceAll('```html', '```' + language));
  expect(output.warnings).toEqual([]);
});
it('preserves mixed fence languages including unrelated fences and unclosed fences', async () => {
  const source = input.replace('```html', '```html-source') + '\n```HTML-Source extra\n<div>unclosed\n';
  const result = await cleanVerified(source);
  expect(result.markdown).toBe(expected.replace('```html', '```html-source') + '\n```HTML-Source extra\n<div>unclosed\n');
  expect(result.warnings.map(w => w.code)).toEqual(['unclosed-fence']);
});
it('preserves opening BOM, CRLF, exact backup bytes and does not write again', async () => {
  // v1 does not bind hashes to LF: use it to exercise exact CRLF preservation.
  const source = '\uFEFF' + readFileSync('tests/fixtures/interactive.input.md', 'utf8').replaceAll('\n', '\r\n');
  const output = '\uFEFF' + readFileSync('tests/fixtures/interactive.expected.md', 'utf8').replaceAll('```html-source', '```html').replaceAll('\n', '\r\n');
  const storage = new MemoryStorage(); storage.files.set('Inbox/example.md', source);
  const first = await cleanFile(storage, 'Inbox/example.md');
  expect(first.figures).toBe(1);
  expect(first.backup).toMatch(/^GPT Pages Backups\/cleanup\/[a-f0-9]{16}\//);
  expect(storage.files.get(first.backup!)).toBe(source);
  expect(storage.files.get('Inbox/example.md')).toBe(output);
  const before = new Map(storage.files);
  expect((await cleanFile(storage, 'Inbox/example.md')).figures).toBe(0);
  expect(storage.files).toEqual(before);
});
it('keeps a hash-mismatched pair while cleaning a different valid pair', async () => {
  const changed = input.replace('週一：4', '週一：99');
  const output = await cleanVerified(changed);
  expect(output.figures).toBe(1);
  expect(output.markdown).toContain('id=static-bars');
  expect(output.markdown).toContain('![每週閱讀長條圖]');
  expect(output.markdown).not.toContain('id=interactive-slider');
  expect(output.warnings.some(w => w.code === 'source-hash-mismatch')).toBe(true);
});
it('does not back up or rewrite unmatched or ordinary Markdown', async () => {
  const storage = new MemoryStorage();
  storage.files.set('Inbox/example.md', input.replaceAll('v=2', 'v=99'));
  const create = vi.spyOn(storage, 'create'); const replace = vi.spyOn(storage, 'replace');
  const result = await cleanFile(storage, 'Inbox/example.md');
  expect(result.figures).toBe(0); expect(result.warnings.length).toBeGreaterThan(0);
  storage.files.set('Inbox/example.md', '# 普通筆記\n```html-source\n<div>原樣</div>\n```\n');
  await cleanFile(storage, 'Inbox/example.md');
  expect(create).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
});
it('stops before modification if the backup fails', async () => {
  const storage = new MemoryStorage();
  vi.spyOn(storage, 'create').mockRejectedValueOnce(new Error('backup failed'));
  const replace = vi.spyOn(storage, 'replace');
  await expect(cleanFile(storage, 'Inbox/example.md')).rejects.toThrow('backup failed');
  expect(storage.files.get('Inbox/example.md')).toBe(input); expect(replace).not.toHaveBeenCalled();
});
it.each(['before backup', 'after backup'])('preserves concurrent changes %s', async when => {
  const storage = new MemoryStorage();
  if (when === 'before backup') {
    const read = storage.read.bind(storage); let reads = 0;
    vi.spyOn(storage, 'read').mockImplementation(async path => { if (++reads === 2) storage.files.set(path, 'local edit'); return read(path); });
  } else {
    const create = storage.create.bind(storage);
    vi.spyOn(storage, 'create').mockImplementation(async (path, text) => { await create(path, text); storage.files.set('Inbox/example.md', 'local edit'); });
  }
  await expect(cleanFile(storage, 'Inbox/example.md')).rejects.toThrow();
  expect(storage.files.get('Inbox/example.md')).toBe('local edit');
  expect([...storage.files.values()].filter(value => value === input)).toHaveLength(when === 'after backup' ? 1 : 0);
});
it('cancels an in-flight cleanup after backup when no longer allowed', async () => {
  const storage = new MemoryStorage(); let allowed = true;
  const create = storage.create.bind(storage);
  vi.spyOn(storage, 'create').mockImplementation(async (path, text) => { await create(path, text); allowed = false; });
  expect((await cleanFile(storage, 'Inbox/example.md', () => allowed)).figures).toBe(0);
  expect(storage.files.get('Inbox/example.md')).toBe(input);
});
it('loads old plugin data with automation off and validates the watched folder', () => {
  expect(readCleanupSettings(null)).toEqual({ enabled: false, folder: '', renderHtml: false });
  expect(readCleanupSettings({ version: 1, entries: {} })).toEqual({ enabled: false, folder: '', renderHtml: false });
  expect(readCleanupSettings({ cleanup: { enabled: true, folder: 'Inbox\\Pages' } })).toEqual({ enabled: true, folder: 'Inbox/Pages', renderHtml: false });
  for (const folder of ['', '.', '../Inbox', 'C:/Inbox', '/Inbox', '.obsidian', 'GPT Pages Backups', 'GPT Pages Backups/cleanup']) expect(() => cleanupFolder(folder)).toThrow();
  expect(() => readCleanupSettings({ cleanup: { enabled: 'yes', folder: 'Inbox' } })).toThrow();
  expect(() => readCleanupSettings({ cleanup: { enabled: true, folder: 'Inbox', renderHtml: 'true' } })).toThrow();
});
it('enables trusted HTML fences without changing bodies, prose or verified cleanup', async () => {
  const source = input.replaceAll('```html', '```html-source');
  const storage = new MemoryStorage(); storage.files.set('Inbox/example.md', source);
  const result = await cleanFile(storage, 'Inbox/example.md', () => true, true);
  expect(result.figures).toBe(2);
  expect(storage.files.get('Inbox/example.md')).toBe(expected);
  expect(storage.files.get(result.backup!)).toBe(source);
});
it('can render already-cleaned source fences and remains idempotent', async () => {
  const source = expected.replaceAll('```html', '```html-source');
  const storage = new MemoryStorage(); storage.files.set('Inbox/example.md', source);
  const result = await cleanFile(storage, 'Inbox/example.md', () => true, true);
  expect(result.figures).toBe(0); expect(result.backup).toBeDefined();
  expect(storage.files.get('Inbox/example.md')).toBe(expected);
  expect(storage.files.get(result.backup!)).toBe(source);
  const before = new Map(storage.files);
  expect((await cleanFile(storage, 'Inbox/example.md', () => true, true)).backup).toBeUndefined();
  expect(storage.files).toEqual(before);
});
it('retains unverified metadata when folder trust explicitly enables all fences', async () => {
  const source = input.replaceAll('v=2', 'v=99').replaceAll('```html', '```html-source');
  const result = await cleanVerified(source, true);
  expect(result.figures).toBe(0);
  expect(result.markdown).toBe(input.replaceAll('v=2', 'v=99'));
  expect(result.warnings.map(w => w.code)).toContain('unknown-version');
});
it('requires successful backup even when only enabling rendering, preserving BOM and CRLF', async () => {
  const source = '\uFEFF# 範例\r\n```html-source\r\n<div>中文 🐱</div>\r\n```\r\n';
  const storage = new MemoryStorage(); storage.files.set('Inbox/example.md', source);
  const create = vi.spyOn(storage, 'create').mockRejectedValueOnce(new Error('backup failed'));
  await expect(cleanFile(storage, 'Inbox/example.md', () => true, true)).rejects.toThrow('backup failed');
  expect(storage.files.get('Inbox/example.md')).toBe(source);
  create.mockRestore();
  const result = await cleanFile(storage, 'Inbox/example.md', () => true, true);
  expect(storage.files.get(result.backup!)).toBe(source);
  expect(storage.files.get('Inbox/example.md')).toBe('\uFEFF# 範例\r\n```html\r\n<div>中文 🐱</div>\r\n```\r\n');
});
it('scopes paths by folder boundary, excludes backups and tracked import destinations', () => {
  const settings = { enabled: true, folder: 'Inbox' };
  for (const path of ['Inbox/a.md', 'Inbox/sub/中文.markdown']) expect(cleanupCandidate(path, settings, [])).toBe(true);
  for (const path of ['Inbox Other/a.md', 'Outside/Inbox/a.md', 'Inbox/a.png']) expect(cleanupCandidate(path, settings, [])).toBe(false);
  expect(cleanupCandidate('Inbox/a.md', settings, ['Inbox/a.md'])).toBe(false);
  expect(cleanupCandidate('Inbox/a.md', { ...settings, enabled: false }, [])).toBe(false);
  expect(cleanupCandidate('GPT Pages Backups/a.md', { enabled: true, folder: 'GPT Pages Backups' }, [])).toBe(false);
});
it('never allows direct cleanup of backup paths', async () => {
  await expect(cleanFile(new MemoryStorage(), 'GPT Pages Backups/a.md')).rejects.toThrow('備份');
});
it('debounces duplicate events, serializes changes arriving mid-run and stops pending work', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const calls: string[][] = [];
  const queue = new CleanupQueue(async paths => { calls.push(paths); if (calls.length === 1) await hold; });
  queue.enqueue('a.md'); queue.enqueue('a.md');
  await vi.advanceTimersByTimeAsync(1000);
  expect(calls).toEqual([['a.md']]);
  queue.enqueue('b.md'); await vi.advanceTimersByTimeAsync(1000);
  expect(calls).toHaveLength(1);
  release(); await vi.advanceTimersByTimeAsync(0);
  expect(calls).toEqual([['a.md'], ['b.md']]);
  queue.enqueue('c.md'); queue.stop(); await vi.runAllTimersAsync();
  expect(calls).toHaveLength(2);
});
it('keys backup directories by the full file path rather than duplicate leaf names', async () => {
  const storage = new MemoryStorage(); storage.files.set('Inbox/sub/example.md', input);
  const first = await cleanFile(storage, 'Inbox/example.md');
  const second = await cleanFile(storage, 'Inbox/sub/example.md');
  expect(first.backup).toContain(createHash('sha256').update('Inbox/example.md').digest('hex').slice(0, 16));
  expect(second.backup?.split('/')[2]).not.toBe(first.backup?.split('/')[2]);
});
