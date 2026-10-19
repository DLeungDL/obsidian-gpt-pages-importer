import { t } from './i18n';
import { convertVerified, type Conversion } from './convert';
import { digest } from './hash';
import { prepareImages, writeImages, type ImageStorage } from './images';
export { digest } from './hash';
export interface Entry { destination: string; outputHash: string }
export interface State { version: 1; entries: Record<string, Entry> }
export interface Storage extends ImageStorage {
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
export function vaultPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.')) || [...normalized].some(character => character.charCodeAt(0) < 32) || /[:*?"<>|]/.test(normalized)) throw new Error(t('error.path'));
  return normalized;
}
export function readState(value: unknown): State {
  if (value === null || value === undefined) return { version: 1, entries: {} };
  if (typeof value !== 'object' || (value as State).version !== 1 || !(value as State).entries || typeof (value as State).entries !== 'object' || Array.isArray((value as State).entries)) throw new Error(t('error.stateFormat'));
  const entries: Record<string, Entry> = {};
  for (const [key, entry] of Object.entries((value as State).entries)) {
    if (!/^[a-f0-9]{64}$/.test(key) || !entry || typeof entry.destination !== 'string' || !/^[a-f0-9]{64}$/.test(entry.outputHash)) throw new Error(t('error.stateCorrupt'));
    entries[key] = { destination: vaultPath(entry.destination), outputHash: entry.outputHash };
  }
  return { version: 1, entries };
}
export async function planImport(storage: Storage, state: State, sourceId: string, source: string, folder: string, trusted = false): Promise<Plan> {
  const normalizedId = sourceId.trim();
  if (!normalizedId) throw new Error(t('error.sourceName'));
  const key = await digest(normalizedId);
  const base = normalizedId.replace(/\.md$/i, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'page';
  const destination = state.entries[key]?.destination ?? `${vaultPath(folder)}/${base}-${key.slice(0, 16)}.md`;
  const before = await storage.read(destination);
  const conversion = await prepareImages(await convertVerified(source, trusted), destination);
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
    if (plan.conversion.images?.some(image => ref === `GPT%20Pages%20Assets/${image.path.split('/').at(-1)!}`)) return t('image.planned', { ref });
    if (/^(?:https?:)?\/\//i.test(ref)) return t('asset.external', { ref });
    if (/^[a-z][a-z\d+.-]*:/i.test(ref)) return t('asset.protocol', { ref });
    let path: string;
    try {
      const relative = decodeURIComponent(ref.split(/[?#]/)[0]!).replace(/\\/g, '/');
      if (relative.startsWith('/') || /^[A-Za-z]:/.test(relative) || relative.split('/').includes('..')) throw new Error('unsafe asset path');
      path = vaultPath(`${folder}/${relative.split('/').filter(part => part !== '.').join('/')}`);
    } catch { return t('asset.unsafe', { ref }); }
    return t('asset.status', { status: await storage.exists(path) ? t('asset.found') : t('asset.missing'), ref });
  }));
}
export async function applyImport(storage: Storage, state: State, plan: Plan, persist: (state: State) => Promise<void>): Promise<{ state: State; backup?: string }> {
  if (plan.status === 'conflict') throw new Error(t('error.conflict'));
  const current = await storage.read(plan.destination);
  if (current !== plan.before) throw new Error(t('error.previewChanged'));
  if (plan.status === 'unchanged') {
    await writeImages(storage, plan.conversion.images ?? []);
    return { state };
  }
  let backup: string | undefined;
  if (current !== null) {
    backup = `GPT Pages Backups/${plan.key.slice(0, 16)}/${Date.now()}-${window.crypto.randomUUID()}.md`;
    await storage.create(backup, current);
    await writeImages(storage, plan.conversion.images ?? []);
    await storage.replace(plan.destination, current, plan.conversion.markdown);
  } else {
    await writeImages(storage, plan.conversion.images ?? []);
    await storage.create(plan.destination, plan.conversion.markdown);
  }
  const next: State = { version: 1, entries: { ...state.entries, [plan.key]: { destination: plan.destination, outputHash: plan.outputHash } } };
  try { await persist(next); }
  catch { throw new Error(t('error.persist', { backup: backup ? t('error.backup', { path: backup }) : '' })); }
  return { state: next, backup };
}
