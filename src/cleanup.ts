import { cleanVerified, type Warning } from './convert';
import { digest, vaultPath, type Storage } from './importer';

export interface CleanupSettings { enabled: boolean; folder: string; renderHtml?: boolean }
export function cleanupFolder(value: string): string {
  const folder = vaultPath(value);
  if (inFolder(folder, 'GPT Pages Backups')) throw new Error('不能監看備份資料夾。');
  return folder;
}
export function readCleanupSettings(data: unknown): CleanupSettings {
  const value = (data as { cleanup?: unknown } | null)?.cleanup;
  if (value === undefined) return { enabled: false, folder: '', renderHtml: false };
  if (!value || typeof value !== 'object') throw new Error('自動清理設定損毀；已停止載入。');
  const settings = value as CleanupSettings;
  if (typeof settings.enabled !== 'boolean' || typeof settings.folder !== 'string' || (settings.renderHtml !== undefined && typeof settings.renderHtml !== 'boolean')) throw new Error('自動清理設定損毀；已停止載入。');
  return { enabled: settings.enabled, folder: settings.folder ? cleanupFolder(settings.folder) : settings.enabled || settings.renderHtml ? cleanupFolder('') : '', renderHtml: settings.renderHtml ?? false };
}
export function inFolder(path: string, folder: string): boolean { return path === folder || path.startsWith(`${folder}/`); }
export function cleanupCandidate(path: string, settings: CleanupSettings, destinations: string[]): boolean {
  return settings.enabled && !!settings.folder && inFolder(path, settings.folder) && /\.(md|markdown)$/i.test(path)
    && !inFolder(path, 'GPT Pages Backups') && !destinations.includes(path);
}
export interface CleanupResult { figures: number; warnings: Warning[]; backup?: string }
export async function cleanFile(storage: Storage, path: string, allowed: () => boolean = () => true, renderHtml = false): Promise<CleanupResult> {
  const safePath = vaultPath(path);
  if (inFolder(safePath, 'GPT Pages Backups')) throw new Error('不能清理備份檔案。');
  const source = await storage.read(safePath);
  if (source === null || !allowed() || (!renderHtml && !/gpt-pages\\?:figure/.test(source))) return { figures: 0, warnings: [] };
  const output = await cleanVerified(source, renderHtml);
  if (source === output.markdown || !allowed()) return { figures: 0, warnings: output.warnings };
  // Back up exact UTF-8 text; the adapter's atomic replace rejects concurrent edits.
  if (await storage.read(safePath) !== source) throw new Error('清理前原始檔已變更，已停止寫入；請重新清理。');
  if (!allowed()) return { figures: 0, warnings: [] };
  const key = await digest(safePath);
  const backup = `GPT Pages Backups/cleanup/${key.slice(0, 16)}/${Date.now()}-${globalThis.crypto.randomUUID()}.md`;
  await storage.create(backup, source);
  if (!allowed()) return { figures: 0, warnings: [] };
  await storage.replace(safePath, source, output.markdown);
  return { figures: output.figures, warnings: output.warnings, backup };
}

/** Debounce copy/save bursts, process serially, and retain changes arriving mid-run. */
export class CleanupQueue {
  private pending = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private stopped = false;
  constructor(private process: (paths: string[]) => Promise<void>, private delay = 1000) {}
  enqueue(path: string): void {
    if (this.stopped) return;
    this.pending.add(path);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.drain(); }, this.delay);
  }
  clear(): void { clearTimeout(this.timer); this.pending.clear(); }
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
