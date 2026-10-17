import { Modal, Notice, Plugin, Setting, TFile, TFolder, type App, type TAbstractFile, type Vault } from 'obsidian';
import { applyImport, assetReport, planImport, readState, type Plan, type State, type Storage } from './importer';
import { renderPreview } from './preview';
import { cleanupCandidate, cleanupFolder, CleanupQueue, cleanFile, readCleanupSettings, type CleanupSettings } from './cleanup';
import { CleanupSettingTab } from './cleanup-settings';

class VaultStorage implements Storage {
  constructor(private vault: Vault, private maxBytes?: number, private allowed?: () => boolean) {}
  async read(path: string): Promise<string | null> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file === null) return null;
    if (!(file instanceof TFile)) throw new Error(`目的地不是檔案：${path}`);
    if (this.maxBytes !== undefined && file.stat.size > this.maxBytes) throw new Error('自動清理上限為 20 MiB，請先拆分檔案。');
    // Vault.read strips the opening BOM, but hashes and backups need exact UTF-8.
    const bytes = await this.vault.readBinary(file);
    if (this.maxBytes !== undefined && bytes.byteLength > this.maxBytes) throw new Error('自動清理上限為 20 MiB，請先拆分檔案。');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  }
  async exists(path: string): Promise<boolean> { return this.vault.getAbstractFileByPath(path) !== null; }
  private async folders(path: string): Promise<void> {
    let folder = '';
    for (const segment of path.split('/').slice(0, -1)) {
      folder = folder ? `${folder}/${segment}` : segment;
      const existing = this.vault.getAbstractFileByPath(folder);
      if (existing && !(existing instanceof TFolder)) throw new Error(`目錄被檔案占用：${folder}`);
      if (!existing) await this.vault.createFolder(folder);
    }
  }
  async create(path: string, content: string): Promise<void> {
    await this.folders(path);
    // Vault.create rejects existing paths, unlike adapter.write.
    await this.vault.create(path, content);
  }
  async replace(path: string, expected: string, content: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error('目的檔案已消失，請重新預覽。');
    await this.vault.process(file, current => {
      if (this.allowed && !this.allowed()) throw new Error('自動清理設定已變更，已停止寫入。');
      if (current !== expected) throw new Error('目的檔案在寫入前已變更，停止覆寫。');
      return content;
    });
  }
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

class PreviewModal extends Modal {
  constructor(app: App, private plan: Plan, private assets: string[], private commit: () => Promise<void>, private back: () => void) { super(app); }
  onOpen(): void {
    const actionContainer = renderPreview(this.contentEl, this.plan, this.assets);
    const actions = new Setting(actionContainer);
    actions.addButton(button => button.setButtonText('返回設定').onClick(() => { this.close(); this.back(); }));
    actions.addButton(button => button.setButtonText('取消').onClick(() => this.close()));
    if (this.plan.status !== 'conflict') actions.addButton(button => button.setButtonText(this.plan.status === 'unchanged' ? '完成（無變更）' : '確認寫入').setCta().onClick(async () => {
      for (const action of actionContainer.querySelectorAll('button')) action.disabled = true;
      try { await this.commit(); this.close(); }
      catch (error) {
        for (const action of actionContainer.querySelectorAll('button')) action.disabled = false;
        button.setDisabled(true);
        new Notice(errorMessage(error), 15000); this.contentEl.createEl('p', { text: errorMessage(error) });
      }
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}
interface ImportFile { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }
class ImportModal extends Modal {
  active = false;
  private selected?: ImportFile;
  private sourceId = '';
  private customSource = false;
  private folder = 'GPT Pages';
  private trusted = false;
  constructor(app: App, private preview: (sourceId: string, text: string, folder: string, trusted: boolean) => Promise<void>, initial?: ImportFile, private current?: ImportFile) {
    super(app);
    this.selected = initial;
    this.sourceId = initial?.name ?? '';
  }
  onOpen(): void {
    this.active = true;
    this.contentEl.createEl('h2', { text: '匯入 GPT Pages Markdown' });
    this.contentEl.createEl('p', { text: '選取或拖入一個 Markdown 檔，預覽後匯入。來源名稱自動使用檔名；同一份 Page 重匯時請維持相同名稱。完成後會自動開啟目的筆記。' });
    const selectedLabel = this.contentEl.createEl('p');
    selectedLabel.classList.add('gpt-pages-selected-file');
    selectedLabel.setAttribute('role', 'status');
    selectedLabel.textContent = this.selected ? `已選取：${this.selected.name}` : '尚未選取檔案';
    const errorLabel = this.contentEl.createEl('p');
    errorLabel.setAttribute('role', 'alert');
    errorLabel.hidden = true;
    const fileInput = this.contentEl.createEl('input', { type: 'file' });
    fileInput.accept = '.md,.markdown,text/markdown,text/plain';
    fileInput.setAttribute('aria-label', '選取 Markdown 檔案');
    fileInput.hidden = true;
    const chooseButton = this.contentEl.createEl('button', { text: this.selected ? '更換檔案…' : '選擇 Markdown 檔案…' });
    chooseButton.addEventListener('click', () => fileInput.click());
    const dropZone = this.contentEl.createDiv();
    dropZone.classList.add('gpt-pages-drop-zone');
    dropZone.append(selectedLabel, chooseButton, fileInput);
    let busy = false;
    let setPreviewEnabled = (_enabled: boolean) => {};
    let setTrusted = (_value: boolean) => {};
    let setSource = (_value: string) => {};
    const showError = (message: string) => { errorLabel.textContent = message; errorLabel.hidden = !message; };
    const selectFile = (file?: ImportFile) => {
      if (busy) return;
      this.trusted = false; setTrusted(false);
      const error = !file ? '請一次選取一個 Markdown 檔案。' : !/\.(md|markdown)$/i.test(file.name) ? '請選取 Markdown 檔案。' : file.size > 20 * 1024 * 1024 ? 'MVP 支援上限為 20 MiB，請先拆分檔案。' : '';
      this.selected = error ? undefined : file;
      if (!this.customSource) { this.sourceId = this.selected?.name ?? ''; setSource(this.sourceId); }
      selectedLabel.textContent = this.selected ? `已選取：${this.selected.name}` : '尚未選取檔案';
      chooseButton.textContent = this.selected ? '更換檔案…' : '選擇 Markdown 檔案…';
      showError(error);
      setPreviewEnabled(!!this.selected);
    };
    fileInput.addEventListener('change', () => { if (fileInput.files?.length) selectFile(fileInput.files.length === 1 ? fileInput.files[0] : undefined); });
    dropZone.addEventListener('dragover', event => { event.preventDefault(); });
    dropZone.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation();
      selectFile(event.dataTransfer?.files.length === 1 ? event.dataTransfer.files[0] : undefined);
    });
    if (this.current) new Setting(this.contentEl).addButton(button => button.setButtonText('使用目前筆記').onClick(() => selectFile(this.current)));
    const advanced = this.contentEl.createEl('details');
    advanced.createEl('summary', { text: '來源與目的地（進階設定）' });
    new Setting(advanced).setName('來源識別名稱').setDesc('預設使用檔名。重新匯入使用相同名稱；不同 Pages 即使檔名相同也請改用不同名稱。').addText(text => {
      setSource = value => { text.setValue(value); };
      text.setValue(this.sourceId).onChange(value => { this.sourceId = value; this.customSource = !!value.trim() && value !== this.selected?.name; });
    });
    new Setting(advanced).setName('新來源的目的目錄').setDesc('預設 GPT Pages。已匯入來源沿用原目的地。').addText(text => text.setValue(this.folder).onChange(value => { this.folder = value; }));
    new Setting(this.contentEl).setName('我信任這份內容，允許 renderer 執行 HTML／JavaScript').setDesc('預設關閉。開啟後輸出 html fence；Polyglot Renderer 可能自動執行 scripts 及外部網路請求。sandbox 不保證網路隔離。重新匯入已啟用的內容時，請先關閉 renderer，以免讀取模式立即執行。').addToggle(toggle => {
      setTrusted = value => { toggle.setValue(value); };
      toggle.setValue(this.trusted).onChange(value => { this.trusted = value; });
    });
    new Setting(this.contentEl).addButton(button => {
      setPreviewEnabled = enabled => { button.setDisabled(busy || !enabled); };
      button.setButtonText('預覽').setCta().onClick(async () => {
        if (busy) return;
        busy = true;
        for (const control of this.contentEl.querySelectorAll('input,button')) (control as HTMLInputElement | HTMLButtonElement).disabled = true;
        try {
          const file = this.selected;
          if (!file || !/\.(md|markdown)$/i.test(file.name)) throw new Error('請選取 Markdown 檔案。');
          if (file.size > 20 * 1024 * 1024) throw new Error('MVP 支援上限為 20 MiB，請先拆分檔案。');
          const bytes = await file.arrayBuffer();
          if (!this.active) return;
          if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('MVP 支援上限為 20 MiB，請先拆分檔案。');
          const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
          await this.preview(this.sourceId, text, this.folder, this.trusted);
          this.close();
        } catch (error) { if (this.active) { showError(errorMessage(error)); new Notice(errorMessage(error), 15000); } }
        finally {
          busy = false;
          for (const control of this.contentEl.querySelectorAll('input,button')) (control as HTMLInputElement | HTMLButtonElement).disabled = false;
          button.setDisabled(!this.selected);
        }
      }).setDisabled(!this.selected);
    });
  }
  onClose(): void { this.active = false; this.contentEl.empty(); }
}
export default class GPTPagesImporter extends Plugin {
  private state: State = { version: 1, entries: {} };
  private writing = false;
  private writes: Promise<unknown> = Promise.resolve();
  private cleanupSettings: CleanupSettings = { enabled: false, folder: '', renderHtml: false };
  private cleanupRevision = 0;
  private cleanupReady = false;
  private closed = false;
  private cleanupQueue = new CleanupQueue(paths => this.cleanPaths(paths));
  cleanupStatus = '自動清理尚未啟用。';
  async onload(): Promise<void> {
    try {
      const saved: unknown = await this.loadData();
      this.state = readState(saved);
      this.cleanupSettings = readCleanupSettings(saved);
    }
    catch (error) { new Notice(errorMessage(error), 15000); return; }
    this.addCommand({ id: 'import-pages-markdown', name: '匯入 Pages Markdown', callback: () => this.openImport() });
    this.addCommand({ id: 'import-current-note', name: '匯入目前筆記', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!this.isSource(file)) return false;
      if (!checking) this.openImport(file);
      return true;
    } });
    this.addRibbonIcon('file-input', '匯入 Pages Markdown', () => this.openImport());
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && this.isSource(file)) menu.addItem(item => item.setTitle('使用 GPT Pages Importer 匯入').setIcon('file-input').onClick(() => this.openImport(file)));
    }));
    this.addSettingTab(new CleanupSettingTab(this.app, this, this));
    this.addCommand({ id: 'clean-watched-folder', name: '立即清理指定資料夾', callback: () => this.scanCleanup() });
    this.app.workspace.onLayoutReady(() => {
      if (this.closed) return;
      this.cleanupReady = true;
      const enqueue = (file: TAbstractFile) => { if (file instanceof TFile && this.canClean(file.path)) this.cleanupQueue.enqueue(file.path); };
      this.registerEvent(this.app.vault.on('create', enqueue));
      this.registerEvent(this.app.vault.on('modify', enqueue));
      this.registerEvent(this.app.vault.on('rename', file => { if (file instanceof TFolder) this.scanCleanup(false); else enqueue(file); }));
      this.scanCleanup(false);
    });
  }
  onunload(): void { this.closed = true; this.cleanupRevision++; this.cleanupQueue.stop(); }
  getCleanupSettings(): CleanupSettings { return { ...this.cleanupSettings }; }
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.writes.then(task);
    this.writes = next.catch(() => {});
    return next;
  }
  private saveState(state: State): Promise<void> {
    return this.saveData({ ...state, cleanup: this.cleanupSettings });
  }
  async configureCleanup(settings: CleanupSettings, trustedFolder?: string): Promise<void> {
    const folder = settings.folder ? cleanupFolder(settings.folder) : settings.enabled ? cleanupFolder('') : '';
    const next = { enabled: settings.enabled, folder, renderHtml: settings.renderHtml === true };
    if (next.renderHtml && (!folder || (!(this.cleanupSettings.renderHtml && this.cleanupSettings.folder === folder) && trustedFolder !== folder))) throw new Error('請先確認信任指定資料夾的內容，才能啟用 HTML 渲染。');
    if (next.enabled && !(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) throw new Error('請先在 vault 建立自動清理資料夾。');
    // Invalidate pending/in-flight conversions immediately; never overwrite after disabling.
    this.cleanupRevision++; this.cleanupQueue.clear();
    await this.exclusive(async () => {
      await this.saveData({ ...this.state, cleanup: next });
      this.cleanupSettings = next;
      this.cleanupStatus = next.enabled ? `監看中：${folder}（含子資料夾）。` : '自動清理已停用。';
    });
    if (this.cleanupReady) this.scanCleanup(false);
  }
  private canClean(path: string): boolean {
    return !this.closed && cleanupCandidate(path, this.cleanupSettings, Object.values(this.state.entries).map(entry => entry.destination));
  }
  scanCleanup(notify = true): void {
    if (!this.cleanupSettings.enabled || !this.cleanupReady || this.closed) {
      if (notify) new Notice('請先在 GPT Pages Importer 設定中指定資料夾並啟用自動清理。');
      return;
    }
    const folder = this.app.vault.getAbstractFileByPath(this.cleanupSettings.folder);
    if (!(folder instanceof TFolder)) {
      this.cleanupStatus = '自動清理資料夾不存在，請檢查設定。';
      if (notify) new Notice(this.cleanupStatus);
      return;
    }
    let count = 0;
    const visit = (parent: TFolder): void => {
      for (const child of parent.children) {
        if (child instanceof TFolder) visit(child);
        else if (child instanceof TFile && this.canClean(child.path)) { this.cleanupQueue.enqueue(child.path); count++; }
      }
    };
    visit(folder);
    this.cleanupStatus = `監看中：${this.cleanupSettings.folder}；已排入 ${count} 個 Markdown 檔案。`;
    if (notify) new Notice(this.cleanupStatus);
  }
  private async cleanPaths(paths: string[]): Promise<void> {
    const revision = this.cleanupRevision;
    let cleaned = 0; let figures = 0;
    const problems: string[] = [];
    for (const path of paths) {
      try {
        await this.exclusive(async () => {
          const allowed = () => revision === this.cleanupRevision && this.canClean(path) && this.app.vault.getAbstractFileByPath(path) instanceof TFile;
          if (!allowed()) return;
          const result = await cleanFile(new VaultStorage(this.app.vault, 20 * 1024 * 1024, allowed), path, allowed, this.cleanupSettings.renderHtml);
          if (result.backup) { cleaned++; figures += result.figures; }
          const warnings = result.warnings.filter(warning => !['asset-references', 'trusted-rendering'].includes(warning.code));
          if (warnings.length) problems.push(`${path}：${warnings[0]!.message}`);
        });
      } catch (error) { problems.push(`${path}：${errorMessage(error)}`); }
    }
    if (!cleaned && !problems.length) return;
    this.cleanupStatus = `自動清理：${cleaned} 個檔案、${figures} 組配對${problems.length ? `；${problems.length} 個檔案需檢查。${problems.slice(0, 3).join('；')}` : '。原文已備份。'}`;
    new Notice(this.cleanupStatus, problems.length ? 15000 : 10000);
  }
  private isSource(file: TFile | null): file is TFile {
    return file !== null && /\.(md|markdown)$/i.test(file.name) && !Object.values(this.state.entries).some(entry => entry.destination === file.path);
  }
  private importFile(file: TFile): ImportFile {
    return { name: file.name, size: file.stat.size, arrayBuffer: () => this.app.vault.readBinary(file) };
  }
  private openImport(initial?: TFile): void {
    if (initial && !this.isSource(initial)) { new Notice('請選取原始 Markdown 匯出檔；已匯入的目的筆記不需再次作為來源。'); return; }
    const active = this.app.workspace.getActiveFile();
    const form = new ImportModal(this.app, async (id, source, folder, trusted) => {
      const storage = new VaultStorage(this.app.vault);
      const plan = await planImport(storage, this.state, id, source, folder, trusted);
      const assets = await assetReport(storage, plan);
      if (!form.active) return;
      new PreviewModal(this.app, plan, assets, async () => {
        if (this.writing) throw new Error('另一個匯入正在寫入，請稍後重新預覽。');
        this.writing = true;
        try { await this.exclusive(async () => {
          const result = await applyImport(storage, this.state, plan, next => this.saveState(next));
          this.state = result.state;
          new Notice(`${plan.status === 'unchanged' ? '內容相同，未寫入' : '已匯入'}：${plan.destination}${result.backup ? `；備份：${result.backup}` : ''}`, 10000);
          try {
            const file = this.app.vault.getAbstractFileByPath(plan.destination);
            if (!(file instanceof TFile)) throw new Error('找不到目的筆記。');
            await this.app.workspace.getLeaf(false).openFile(file);
          } catch (error) {
            new Notice(`匯入已完成，但無法開啟目的筆記：${plan.destination}。${errorMessage(error)}`, 15000);
          }
        }); } finally { this.writing = false; }
      }, () => form.open()).open();
    }, initial ? this.importFile(initial) : undefined, this.isSource(active) ? this.importFile(active) : undefined);
    form.open();
  }
}
