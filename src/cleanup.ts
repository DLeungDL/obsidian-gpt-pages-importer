import { t } from './i18n';
import { cleanVerified, type Warning } from './convert';
import { digest, vaultPath, type Storage } from './importer';
import { prepareImages, writeImages } from './images';

export interface CleanupSettings { enabled: boolean; folder: string; renderHtml?: boolean }
export function cleanupFolder(value: string): string {
  const folder = vaultPath(value);
  if (inFolder(folder, 'GPT Pages Backups')) throw new Error(t('error.watchBackup'));
  return folder;
}
export function readCleanupSettings(data: unknown): CleanupSettings {
  const value = (data as { cleanup?: unknown } | null)?.cleanup;
  if (value === undefined) return { enabled: false, folder: '', renderHtml: false };
  if (!value || typeof value !== 'object') throw new Error(t('error.cleanupSettings'));
  const settings = value as CleanupSettings;
  if (typeof settings.enabled !== 'boolean' || typeof settings.folder !== 'string' || (settings.renderHtml !== undefined && typeof settings.renderHtml !== 'boolean')) throw new Error(t('error.cleanupSettings'));
  return { enabled: settings.enabled, folder: settings.folder ? cleanupFolder(settings.folder) : settings.enabled || settings.renderHtml ? cleanupFolder('') : '', renderHtml: settings.renderHtml ?? false };
}
export function inFolder(path: string, folder: string): boolean { return path === folder || path.startsWith(`${folder}/`); }
export function cleanupCandidate(path: string, settings: CleanupSettings, destinations: string[]): boolean {
  return settings.enabled && !!settings.folder && inFolder(path, settings.folder) && /\.(md|markdown)$/i.test(path)
    && !inFolder(path, 'GPT Pages Backups') && !destinations.includes(path);
}
export interface CleanupResult { figures: number; images?: number; mathBlocks?: number; warnings: Warning[]; backup?: string }
export async function cleanFile(storage: Storage, path: string, allowed: () => boolean = () => true, renderHtml = false): Promise<CleanupResult> {
  const safePath = vaultPath(path);
  if (inFolder(safePath, 'GPT Pages Backups')) throw new Error(t('error.cleanBackup'));
  const source = await storage.read(safePath);
  if (source === null || !allowed() || (!renderHtml && !/gpt-pages(?:\\?:figure|-asset)|^[\uFEFF ]{0,4}(?:`{3,}|~{3,})latex[ \t]*(?:\r?\n|\r|$)/im.test(source))) return { figures: 0, warnings: [] };
  const output = await prepareImages(await cleanVerified(source, renderHtml), safePath);
  if (source === output.markdown || !allowed()) return { figures: 0, warnings: output.warnings };
  // Back up exact UTF-8 text; the adapter's atomic replace rejects concurrent edits.
  if (await storage.read(safePath) !== source) throw new Error(t('error.sourceChanged'));
  if (!allowed()) return { figures: 0, warnings: [] };
  const key = await digest(safePath);
  const backup = `GPT Pages Backups/cleanup/${key.slice(0, 16)}/${Date.now()}-${window.crypto.randomUUID()}.md`;
  await storage.create(backup, source);
  if (!allowed()) return { figures: 0, warnings: [] };
  await writeImages(storage, output.images ?? [], allowed);
  if (!allowed()) return { figures: 0, warnings: [] };
  await storage.replace(safePath, source, output.markdown);
  return { figures: output.figures, images: output.images?.length ?? 0, ...(output.mathBlocks ? { mathBlocks: output.mathBlocks } : {}), warnings: output.warnings, backup };
}

/** Debounce copy/save bursts, process serially, and retain changes arriving mid-run. */
export class CleanupQueue {
  private pending = new Set<string>();
  private timer?: number;
  private running = false;
  private stopped = false;
  constructor(private process: (paths: string[]) => Promise<void>, private delay = 1000) {}
  enqueue(path: string): void {
    if (this.stopped) return;
    this.pending.add(path);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.drain(); }, this.delay);
  }
  clear(): void { window.clearTimeout(this.timer); this.pending.clear(); }
  stop(): void { this.stopped = true; this.clear(); }
  private async drain(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped && this.pending.size) {
        const paths = [...this.pending]; this.pending.clear();
        await this.process(paths);
      }
    } finally { this.running = false; }
  }
}
