import { convert, type Conversion } from './convert';
export interface Entry { destination: string; outputHash: string }
export interface State { version: 1; entries: Record<string, Entry> }
export interface Storage {
  read(path: string): Promise<string | null>;
  create(path: string, content: string): Promise<void>;
  /** Atomically replace only when current content equals expected; throw otherwise. */
  replace(path: string, expected: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
export interface Plan {
  key: string; sourceId: string; destination: string; before: string | null;
  conversion: Conversion; outputHash: string; status: 'create' | 'update' | 'unchanged' | 'conflict';
}
export async function digest(text: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function vaultPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.')) || /[\u0000-\u001f:*?"<>|]/.test(normalized)) throw new Error('目的路徑必須位於 vault 內，不能使用隱藏目錄、.. 或特殊字元。');
  return normalized;
}
export function readState(value: unknown): State {
  if (value === null || value === undefined) return { version: 1, entries: {} };
  if (typeof value !== 'object' || (value as State).version !== 1 || !(value as State).entries || typeof (value as State).entries !== 'object' || Array.isArray((value as State).entries)) throw new Error('匯入紀錄格式未知；請保留 data.json 並先排查，不能重設後覆寫。');
  const entries: Record<string, Entry> = {};
  for (const [key, entry] of Object.entries((value as State).entries)) {
    if (!/^[a-f0-9]{64}$/.test(key) || !entry || typeof entry.destination !== 'string' || !/^[a-f0-9]{64}$/.test(entry.outputHash)) throw new Error('匯入紀錄損毀；停止寫入。');
    entries[key] = { destination: vaultPath(entry.destination), outputHash: entry.outputHash };
  }
  return { version: 1, entries };
}
export async function planImport(storage: Storage, state: State, sourceId: string, source: string, folder: string, trusted = false): Promise<Plan> {
  const normalizedId = sourceId.trim();
  if (!normalizedId) throw new Error('來源識別名稱不可空白。');
  const key = await digest(normalizedId);
  const base = normalizedId.replace(/\.md$/i, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'page';
  const destination = state.entries[key]?.destination ?? `${vaultPath(folder)}/${base}-${key.slice(0, 16)}.md`;
  const before = await storage.read(destination);
  const conversion = convert(source, trusted);
  const outputHash = await digest(conversion.markdown);
  const previous = state.entries[key];
  // Equality does not establish ownership of an unrelated existing file.
  let status: Plan['status'] = before === null ? 'create' : 'conflict';
  if (before !== null && previous) {
    if (await digest(before) !== previous.outputHash) status = 'conflict';
    else status = before === conversion.markdown ? 'unchanged' : 'update';
  }
  return { key, sourceId: normalizedId, destination, before, conversion, outputHash, status };
}
export async function assetReport(storage: Storage, plan: Plan): Promise<string[]> {
  const folder = plan.destination.slice(0, plan.destination.lastIndexOf('/'));
  return Promise.all(plan.conversion.assets.map(async ref => {
    if (/^(?:https?:)?\/\//i.test(ref)) return `外部／未下載：${ref}`;
    if (/^[a-z][a-z\d+.-]*:/i.test(ref)) return `特殊協定／未驗證：${ref}`;
    let path: string;
    try {
      const relative = decodeURIComponent(ref.split(/[?#]/)[0]!).replace(/\\/g, '/');
      if (relative.startsWith('/') || /^[A-Za-z]:/.test(relative) || relative.split('/').includes('..')) throw new Error('unsafe asset path');
      path = vaultPath(`${folder}/${relative.split('/').filter(part => part !== '.').join('/')}`);
    } catch { return `無法安全解析：${ref}`; }
    return `${await storage.exists(path) ? '存在於目的目錄' : '缺失或尚未匯入'}：${ref}`;
  }));
}
export async function applyImport(storage: Storage, state: State, plan: Plan, persist: (state: State) => Promise<void>): Promise<{ state: State; backup?: string }> {
  if (plan.status === 'conflict') throw new Error('目的檔案有本機修改或未知來源；已停止寫入，請另存或手動合併。');
  const current = await storage.read(plan.destination);
  if (current !== plan.before) throw new Error('預覽後目的檔案已變更，請重新預覽。');
  if (plan.status === 'unchanged') return { state };
  let backup: string | undefined;
  if (current !== null) {
    backup = `GPT Pages Backups/${plan.key.slice(0, 16)}/${Date.now()}-${globalThis.crypto.randomUUID()}.md`;
    await storage.create(backup, current);
    await storage.replace(plan.destination, current, plan.conversion.markdown);
  } else await storage.create(plan.destination, plan.conversion.markdown);
  const next: State = { version: 1, entries: { ...state.entries, [plan.key]: { destination: plan.destination, outputHash: plan.outputHash } } };
  try { await persist(next); }
  catch { throw new Error(`內容已寫入，但匯入紀錄儲存失敗。${backup ? `備份：${backup}。` : ''} 請勿直接重試覆寫；重新啟動並檢查目的檔案與 data.json。`); }
  return { state: next, backup };
}
