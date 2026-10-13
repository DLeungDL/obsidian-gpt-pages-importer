import { describe, it, expect } from 'vitest';
import { applyImport, assetReport, digest, planImport, readState, vaultPath, type State, type Storage } from '../src/importer';
class MemoryStorage implements Storage {
  files = new Map<string, string>();
  failBackup = false;
  race = false;
  async read(path: string) { return this.files.get(path) ?? null; }
  async exists(path: string) { return this.files.has(path); }
  async create(path: string, content: string) {
    if (this.files.has(path)) throw new Error('exists');
    if (this.failBackup && path.startsWith('GPT Pages Backups/')) throw new Error('backup failed');
    this.files.set(path, content);
  }
  async replace(path: string, expected: string, content: string) {
    if (this.race) this.files.set(path, 'edited during write');
    if (this.files.get(path) !== expected) throw new Error('changed');
    this.files.set(path, content);
  }
}
const empty = (): State => ({ version: 1, entries: {} });
const persist = async (_state: State) => {};
async function initial(source = '中文') {
  const storage = new MemoryStorage();
  const plan = await planImport(storage, empty(), 'sample.md', source, 'GPT Pages');
  const { state } = await applyImport(storage, empty(), plan, persist);
  return { storage, state, path: plan.destination };
}
describe('safe import lifecycle', () => {
  it('imports, repeats without duplicates, then updates with a complete backup', async () => {
    const { storage, state, path } = await initial();
    const repeated = await planImport(storage, state, 'sample.md', '中文', 'other-folder');
    expect(repeated.destination).toBe(path);
    expect(repeated.status).toBe('unchanged');
    await applyImport(storage, state, repeated, persist);
    expect(storage.files.size).toBe(1);
    const changed = await planImport(storage, state, 'sample.md', '中文 updated', 'other-folder');
    expect(changed.status).toBe('update');
    const result = await applyImport(storage, state, changed, persist);
    expect(storage.files.get(result.backup!)).toBe('中文');
    expect(storage.files.get(path)).toBe('中文 updated');
    expect(result.state.entries[changed.key]!.outputHash).toBe(await digest('中文 updated'));
  });
  it('blocks local modifications even when incoming content matches them', async () => {
    const { storage, state, path } = await initial();
    storage.files.set(path, 'local changes');
    const plan = await planImport(storage, state, 'sample.md', 'local changes', 'GPT Pages');
    expect(plan.status).toBe('conflict');
    await expect(applyImport(storage, state, plan, persist)).rejects.toThrow('本機修改');
    expect(storage.files.get(path)).toBe('local changes');
  });
  it('refuses an untracked destination even if content is identical', async () => {
    const { storage, path } = await initial();
    const plan = await planImport(storage, empty(), 'sample.md', '中文', 'GPT Pages');
    expect(plan.destination).toBe(path);
    expect(plan.status).toBe('conflict');
  });
  it('blocks changes after preview, including a no-op plan', async () => {
    const { storage, state, path } = await initial();
    const plan = await planImport(storage, state, 'sample.md', '中文', 'GPT Pages');
    storage.files.set(path, 'new edit');
    await expect(applyImport(storage, state, plan, persist)).rejects.toThrow('已變更');
  });
  it('atomically refuses a race during replacement while keeping backup', async () => {
    const { storage, state, path } = await initial();
    const plan = await planImport(storage, state, 'sample.md', 'updated', 'GPT Pages');
    storage.race = true;
    await expect(applyImport(storage, state, plan, persist)).rejects.toThrow('changed');
    expect(storage.files.get(path)).toBe('edited during write');
    expect([...storage.files.values()]).toContain('中文');
  });
  it('stops update if backup fails', async () => {
    const { storage, state, path } = await initial();
    storage.failBackup = true;
    const plan = await planImport(storage, state, 'sample.md', 'updated', 'GPT Pages');
    await expect(applyImport(storage, state, plan, persist)).rejects.toThrow('backup failed');
    expect(storage.files.get(path)).toBe('中文');
  });
  it('reports persistence failures and subsequent import becomes a conflict', async () => {
    const { storage, state } = await initial();
    const plan = await planImport(storage, state, 'sample.md', 'updated', 'GPT Pages');
    await expect(applyImport(storage, state, plan, async () => { throw new Error('disk full'); })).rejects.toThrow('匯入紀錄儲存失敗');
    expect((await planImport(storage, state, 'sample.md', 'updated', 'GPT Pages')).status).toBe('conflict');
  });
  it('never overwrites a destination created after preview', async () => {
    const storage = new MemoryStorage();
    const plan = await planImport(storage, empty(), 'page', 'incoming', 'GPT Pages');
    storage.files.set(plan.destination, 'other content');
    await expect(applyImport(storage, empty(), plan, persist)).rejects.toThrow('已變更');
  });
  it('uses distinct stable source IDs with the same filename title', async () => {
    const storage = new MemoryStorage();
    const a = await planImport(storage, empty(), 'Page A / export.md', 'a', 'GPT Pages');
    const b = await planImport(storage, empty(), 'Page B / export.md', 'b', 'GPT Pages');
    expect(a.destination).not.toBe(b.destination);
    expect(a.destination).not.toContain(' / ');
  });
  it.each(['../outside', '/outside', 'C:\\private', '.obsidian/plugins', 'a//b', 'a/./b', 'a/../b', 'a/.hidden', 'a?b', ''])('rejects unsafe destination %s', path => {
    expect(() => vaultPath(path)).toThrow();
  });
  it('rejects empty source identifiers', async () => {
    await expect(planImport(new MemoryStorage(), empty(), ' ', '', 'GPT Pages')).rejects.toThrow('不可空白');
  });
  it('checks asset presence without downloading or escaping local paths', async () => {
    const storage = new MemoryStorage();
    storage.files.set('GPT Pages/local.png', 'binary');
    const plan = await planImport(storage, empty(), 'sample', '<img src="local.png"><img src="missing.png"><img src="../secret.png"><img src="https://example.invalid/x.png">', 'GPT Pages');
    const report = await assetReport(storage, plan);
    expect(report).toContain('存在於目的目錄：local.png');
    expect(report).toContain('缺失或尚未匯入：missing.png');
    expect(report).toContain('無法安全解析：../secret.png');
    expect(report).toContain('外部／未下載：https://example.invalid/x.png');
  });
  it('normalizes source identity whitespace consistently', async () => {
    const storage = new MemoryStorage();
    const a = await planImport(storage, empty(), '  sample.md  ', 'a', 'GPT Pages');
    const b = await planImport(storage, empty(), 'sample.md', 'a', 'GPT Pages');
    expect(a.destination).toBe(b.destination); expect(a.key).toBe(b.key);
  });
  it('recognizes ./ assets without resolving root-relative URLs inside the vault', async () => {
    const storage = new MemoryStorage(); storage.files.set('GPT Pages/local.png', 'binary');
    const plan = await planImport(storage, empty(), 'sample', '<img src="./local.png"><img src="/root.png">', 'GPT Pages');
    expect(await assetReport(storage, plan)).toContain('存在於目的目錄：./local.png');
    expect(await assetReport(storage, plan)).toContain('無法安全解析：/root.png');
  });
  it('validates persisted state instead of silently losing ownership', () => {
    expect(readState(null)).toEqual(empty());
    expect(() => readState({ version: 99, entries: {} })).toThrow();
    expect(() => readState({ version: 1, entries: [] })).toThrow();
    expect(() => readState({ version: 1, entries: { bad: { destination: 'a', outputHash: 'bad' } } })).toThrow();
  });
});
