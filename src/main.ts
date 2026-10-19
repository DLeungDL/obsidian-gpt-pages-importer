import { t } from './i18n';
import { initializeLanguage } from './language';
import { Modal, Notice, Plugin, Setting, TFile, TFolder, type App, type TAbstractFile, type Vault } from 'obsidian';
import { applyImport, assetReport, planImport, readState, type Plan, type State, type Storage } from './importer';
import { renderPreview } from './preview';
import { cleanupCandidate, cleanupFolder, CleanupQueue, cleanFile, readCleanupSettings, type CleanupSettings } from './cleanup';
import { CleanupSettingTab } from './cleanup-settings';
import { addRendererStatus } from './renderer-status';

class VaultStorage implements Storage {
  constructor(private vault: Vault, private maxBytes?: number, private allowed?: () => boolean) {}
  async read(path: string): Promise<string | null> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file === null) return null;
    if (!(file instanceof TFile)) throw new Error(t('storage.notFile', { path }));
    if (this.maxBytes !== undefined && file.stat.size > this.maxBytes) throw new Error(t('storage.tooLarge'));
    // Vault.read strips the opening BOM, but hashes and backups need exact UTF-8.
    const bytes = await this.vault.readBinary(file);
    if (this.maxBytes !== undefined && bytes.byteLength > this.maxBytes) throw new Error(t('storage.tooLarge'));
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  }
  async exists(path: string): Promise<boolean> { return this.vault.getAbstractFileByPath(path) !== null; }
  async readBinary(path: string): Promise<ArrayBuffer | null> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file === null) return null;
    if (!(file instanceof TFile)) throw new Error(t('storage.notFile', { path }));
    if (file.stat.size > 1024 * 1024) throw new Error(t('image.conflict', { path }));
    const bytes = await this.vault.readBinary(file);
    if (bytes.byteLength > 1024 * 1024) throw new Error(t('image.conflict', { path }));
    return bytes;
  }
  async createBinary(path: string, bytes: ArrayBuffer): Promise<void> {
    if (this.allowed && !this.allowed()) throw new Error(t('storage.settingsChanged'));
    await this.folders(path);
    if (this.allowed && !this.allowed()) throw new Error(t('storage.settingsChanged'));
    await this.vault.createBinary(path, bytes);
  }
  private async folders(path: string): Promise<void> {
    let folder = '';
    for (const segment of path.split('/').slice(0, -1)) {
      folder = folder ? `${folder}/${segment}` : segment;
      const existing = this.vault.getAbstractFileByPath(folder);
      if (existing && !(existing instanceof TFolder)) throw new Error(t('storage.folderOccupied', { folder }));
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
    if (!(file instanceof TFile)) throw new Error(t('storage.destinationGone'));
    await this.vault.process(file, current => {
      if (this.allowed && !this.allowed()) throw new Error(t('storage.settingsChanged'));
      if (current !== expected) throw new Error(t('storage.destinationChanged'));
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
    actions.addButton(button => button.setButtonText(t('import.back')).onClick(() => { this.close(); this.back(); }));
    actions.addButton(button => button.setButtonText(t('common.cancel')).onClick(() => this.close()));
    if (this.plan.status !== 'conflict') actions.addButton(button => button.setButtonText(this.plan.status === 'unchanged' ? t('import.done') : t('import.confirm')).setCta().onClick(async () => {
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
    this.contentEl.createEl('h2', { text: t('import.title') });
    this.contentEl.createEl('p', { text: t('import.instructions') });
    const selectedLabel = this.contentEl.createEl('p');
    selectedLabel.classList.add('gpt-pages-selected-file');
    selectedLabel.setAttribute('role', 'status');
    selectedLabel.textContent = this.selected ? t('import.selected', { name: this.selected.name }) : t('import.noFile');
    const errorLabel = this.contentEl.createEl('p');
    errorLabel.setAttribute('role', 'alert');
    errorLabel.hidden = true;
    const fileInput = this.contentEl.createEl('input', { type: 'file' });
    fileInput.accept = '.md,.markdown,text/markdown,text/plain';
    fileInput.setAttribute('aria-label', t('import.fileLabel'));
    fileInput.hidden = true;
    const chooseButton = this.contentEl.createEl('button', { text: this.selected ? t('import.changeFile') : t('import.chooseFile') });
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
      const error = !file ? t('import.oneFile') : !/\.(md|markdown)$/i.test(file.name) ? t('import.invalidFile') : file.size > 20 * 1024 * 1024 ? t('import.tooLarge') : '';
      this.selected = error ? undefined : file;
      if (!this.customSource) { this.sourceId = this.selected?.name ?? ''; setSource(this.sourceId); }
      selectedLabel.textContent = this.selected ? t('import.selected', { name: this.selected.name }) : t('import.noFile');
      chooseButton.textContent = this.selected ? t('import.changeFile') : t('import.chooseFile');
      showError(error);
      setPreviewEnabled(!!this.selected);
    };
    fileInput.addEventListener('change', () => { if (fileInput.files?.length) selectFile(fileInput.files.length === 1 ? fileInput.files[0] : undefined); });
    dropZone.addEventListener('dragover', event => { event.preventDefault(); });
    dropZone.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation();
      selectFile(event.dataTransfer?.files.length === 1 ? event.dataTransfer.files[0] : undefined);
    });
    if (this.current) new Setting(this.contentEl).addButton(button => button.setButtonText(t('import.current')).onClick(() => selectFile(this.current)));
    const advanced = this.contentEl.createEl('details');
    advanced.createEl('summary', { text: t('import.advanced') });
    new Setting(advanced).setName(t('import.sourceName')).setDesc(t('import.sourceDescription')).addText(text => {
      setSource = value => { text.setValue(value); };
      text.setValue(this.sourceId).onChange(value => { this.sourceId = value; this.customSource = !!value.trim() && value !== this.selected?.name; });
    });
    new Setting(advanced).setName(t('import.folder')).setDesc(t('import.folderDescription')).addText(text => text.setValue(this.folder).onChange(value => { this.folder = value; }));
    const rendering = new Setting(this.contentEl).setName(t('import.trust')).setDesc(t('import.trustDescription')).addToggle(toggle => {
      setTrusted = value => { toggle.setValue(value); };
      toggle.setValue(this.trusted).onChange(value => { this.trusted = value; });
    });
    addRendererStatus(rendering, this.app);
    new Setting(this.contentEl).addButton(button => {
      setPreviewEnabled = enabled => { button.setDisabled(busy || !enabled); };
      button.setButtonText(t('import.preview')).setCta().onClick(async () => {
        if (busy) return;
        busy = true;
        for (const control of this.contentEl.querySelectorAll('input,button')) (control as HTMLInputElement | HTMLButtonElement).disabled = true;
        try {
          const file = this.selected;
          if (!file || !/\.(md|markdown)$/i.test(file.name)) throw new Error(t('import.invalidFile'));
          if (file.size > 20 * 1024 * 1024) throw new Error(t('import.tooLarge'));
          const bytes = await file.arrayBuffer();
          if (!this.active) return;
          if (bytes.byteLength > 20 * 1024 * 1024) throw new Error(t('import.tooLarge'));
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
  cleanupStatus = t('cleanup.initial');
  async onload(): Promise<void> {
    initializeLanguage();
    this.cleanupStatus = t('cleanup.initial');
    try {
      const saved: unknown = await this.loadData();
      this.state = readState(saved);
      this.cleanupSettings = readCleanupSettings(saved);
    }
    catch (error) { new Notice(errorMessage(error), 15000); return; }
    this.addCommand({ id: 'import-pages-markdown', name: t('command.import'), callback: () => this.openImport() });
    this.addCommand({ id: 'import-current-note', name: t('command.current'), checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!this.isSource(file)) return false;
      if (!checking) this.openImport(file);
      return true;
    } });
    this.addRibbonIcon('file-input', t('command.import'), () => this.openImport());
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && this.isSource(file)) menu.addItem(item => item.setTitle(t('command.context')).setIcon('file-input').onClick(() => this.openImport(file)));
    }));
    this.addSettingTab(new CleanupSettingTab(this.app, this, this));
    this.addCommand({ id: 'clean-watched-folder', name: t('command.cleanup'), callback: () => this.scanCleanup() });
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
    if (next.renderHtml && (!folder || (!(this.cleanupSettings.renderHtml && this.cleanupSettings.folder === folder) && trustedFolder !== folder))) throw new Error(t('cleanup.requireTrust'));
    if (next.enabled && !(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) throw new Error(t('cleanup.createFolder'));
    // Invalidate pending/in-flight conversions immediately; never overwrite after disabling.
    this.cleanupRevision++; this.cleanupQueue.clear();
    await this.exclusive(async () => {
      await this.saveData({ ...this.state, cleanup: next });
      this.cleanupSettings = next;
      this.cleanupStatus = next.enabled ? t('cleanup.watching', { folder }) : t('cleanup.disabled');
    });
    if (this.cleanupReady) this.scanCleanup(false);
  }
  private canClean(path: string): boolean {
    return !this.closed && cleanupCandidate(path, this.cleanupSettings, Object.values(this.state.entries).map(entry => entry.destination));
  }
  scanCleanup(notify = true): void {
    if (!this.cleanupSettings.enabled || !this.cleanupReady || this.closed) {
      if (notify) new Notice(t('cleanup.enableFirst'));
      return;
    }
    const folder = this.app.vault.getAbstractFileByPath(this.cleanupSettings.folder);
    if (!(folder instanceof TFolder)) {
      this.cleanupStatus = t('cleanup.folderMissing');
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
    this.cleanupStatus = t('cleanup.queued', { folder: this.cleanupSettings.folder, count });
    if (notify) new Notice(this.cleanupStatus);
  }
  private async cleanPaths(paths: string[]): Promise<void> {
    const revision = this.cleanupRevision;
    let cleaned = 0; let figures = 0; let images = 0;
    const problems: string[] = [];
    for (const path of paths) {
      try {
        await this.exclusive(async () => {
          const allowed = () => revision === this.cleanupRevision && this.canClean(path) && this.app.vault.getAbstractFileByPath(path) instanceof TFile;
          if (!allowed()) return;
          const result = await cleanFile(new VaultStorage(this.app.vault, 20 * 1024 * 1024, allowed), path, allowed, this.cleanupSettings.renderHtml);
          if (result.backup) { cleaned++; figures += result.figures; images += result.images ?? 0; }
          const warnings = result.warnings.filter(warning => !['asset-references', 'trusted-rendering'].includes(warning.code));
          if (warnings.length) problems.push(t('cleanup.problem', { path, message: warnings[0]!.message }));
        });
      } catch (error) { problems.push(t('cleanup.problem', { path, message: errorMessage(error) })); }
    }
    if (!cleaned && !problems.length) return;
    this.cleanupStatus = t('cleanup.summary', { cleaned, figures, details: (images ? t('image.cleaned', { count: images }) : '') + (problems.length ? t('cleanup.problems', { count: problems.length, problems: problems.slice(0, 3).join('; ') }) : t('cleanup.backedUp')) });
    new Notice(this.cleanupStatus, problems.length ? 15000 : 10000);
  }
  private isSource(file: TFile | null): file is TFile {
    return file !== null && /\.(md|markdown)$/i.test(file.name) && !Object.values(this.state.entries).some(entry => entry.destination === file.path);
  }
  private importFile(file: TFile): ImportFile {
    return { name: file.name, size: file.stat.size, arrayBuffer: () => this.app.vault.readBinary(file) };
  }
  private openImport(initial?: TFile): void {
    if (initial && !this.isSource(initial)) { new Notice(t('import.originalOnly')); return; }
    const active = this.app.workspace.getActiveFile();
    const form = new ImportModal(this.app, async (id, source, folder, trusted) => {
      const storage = new VaultStorage(this.app.vault);
      const plan = await planImport(storage, this.state, id, source, folder, trusted);
      const assets = await assetReport(storage, plan);
      if (!form.active) return;
      new PreviewModal(this.app, plan, assets, async () => {
        if (this.writing) throw new Error(t('import.busy'));
        this.writing = true;
        try { await this.exclusive(async () => {
          const result = await applyImport(storage, this.state, plan, next => this.saveState(next));
          this.state = result.state;
          new Notice(t('import.result', { status: plan.status === 'unchanged' ? t('import.unchanged') : t('import.imported'), destination: plan.destination, backup: result.backup ? t('import.backup', { path: result.backup }) : '' }), 10000);
          try {
            const file = this.app.vault.getAbstractFileByPath(plan.destination);
            if (!(file instanceof TFile)) throw new Error(t('import.destinationMissing'));
            await this.app.workspace.getLeaf(false).openFile(file);
          } catch (error) {
            new Notice(t('import.openFailed', { destination: plan.destination, error: errorMessage(error) }), 15000);
          }
        }); } finally { this.writing = false; }
      }, () => form.open()).open();
    }, initial ? this.importFile(initial) : undefined, this.isSource(active) ? this.importFile(active) : undefined);
    form.open();
  }
}
