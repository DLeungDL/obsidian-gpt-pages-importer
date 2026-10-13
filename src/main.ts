import { Modal, Notice, Plugin, Setting, TFile, TFolder, type App, type Vault } from 'obsidian';
import { applyImport, assetReport, planImport, readState, type Plan, type State, type Storage } from './importer';
import { renderPreview } from './preview';

class VaultStorage implements Storage {
  constructor(private vault: Vault) {}
  async read(path: string): Promise<string | null> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file === null) return null;
    if (!(file instanceof TFile)) throw new Error(`目的地不是檔案：${path}`);
    return this.vault.read(file);
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
      if (current !== expected) throw new Error('目的檔案在寫入前已變更，停止覆寫。');
      return content;
    });
  }
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

class PreviewModal extends Modal {
  constructor(app: App, private plan: Plan, private assets: string[], private commit: () => Promise<void>) { super(app); }
  onOpen(): void {
    renderPreview(this.contentEl, this.plan, this.assets);
    const actions = new Setting(this.contentEl);
    actions.addButton(button => button.setButtonText('取消').onClick(() => this.close()));
    if (this.plan.status !== 'conflict') actions.addButton(button => button.setButtonText(this.plan.status === 'unchanged' ? '完成（無變更）' : '確認寫入').setCta().onClick(async () => {
      button.setDisabled(true);
      try { await this.commit(); this.close(); }
      catch (error) { new Notice(errorMessage(error), 15000); this.contentEl.createEl('p', { text: errorMessage(error) }); }
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}
class ImportModal extends Modal {
  constructor(app: App, private preview: (sourceId: string, text: string, folder: string, trusted: boolean) => Promise<void>) { super(app); }
  onOpen(): void {
    this.contentEl.createEl('h2', { text: '匯入 GPT Pages Markdown' });
    this.contentEl.createEl('p', { text: '選取自行匯出的 .md 檔。來源識別名稱必須固定且唯一；不同 Pages 即使檔名相同，也請使用不同名稱。此工具不連線抓取 Pages。' });
    const fileInput = this.contentEl.createEl('input', { type: 'file' });
    fileInput.accept = '.md,.markdown,text/markdown,text/plain';
    let sourceId = '';
    let folder = 'GPT Pages';
    let trusted = false;
    let busy = false;
    const sourceSetting = new Setting(this.contentEl).setName('來源識別名稱').setDesc('重新匯入使用相同名稱；更名代表另一個來源。');
    let setSource = (_value: string) => {};
    sourceSetting.addText(text => { setSource = value => text.setValue(value); text.onChange(value => { sourceId = value; }); });
    fileInput.addEventListener('change', () => { if (!sourceId && fileInput.files?.[0]) { sourceId = fileInput.files[0].name; setSource(sourceId); } });
    new Setting(this.contentEl).setName('新來源的目的目錄').setDesc('預設 GPT Pages。已匯入來源沿用原目的地。').addText(text => text.setValue(folder).onChange(value => { folder = value; }));
    new Setting(this.contentEl).setName('我信任這份內容，允許 renderer 執行 HTML／JavaScript').setDesc('預設關閉。開啟後輸出 html fence；Polyglot Renderer 可能自動執行 scripts 及外部網路請求。sandbox 不保證網路隔離。重新匯入已啟用的內容時，請先關閉 renderer，以免讀取模式立即執行。').addToggle(toggle => toggle.setValue(false).onChange(value => { trusted = value; }));
    new Setting(this.contentEl).addButton(button => button.setButtonText('預覽').setCta().onClick(async () => {
      if (busy) return;
      busy = true; button.setDisabled(true);
      try {
        const file = fileInput.files?.[0];
        if (!file || !/\.(md|markdown)$/i.test(file.name)) throw new Error('請選取 Markdown 檔案。');
        if (file.size > 20 * 1024 * 1024) throw new Error('MVP 支援上限為 20 MiB，請先拆分檔案。');
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
        await this.preview(sourceId, text, folder, trusted);
        this.close();
      } catch (error) { new Notice(errorMessage(error), 15000); }
      finally { busy = false; button.setDisabled(false); }
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}
export default class GPTPagesImporter extends Plugin {
  private state: State = { version: 1, entries: {} };
  private writing = false;
  async onload(): Promise<void> {
    try { this.state = readState(await this.loadData()); }
    catch (error) { new Notice(errorMessage(error), 15000); return; }
    this.addCommand({ id: 'import-pages-markdown', name: '匯入 Pages Markdown', callback: () => {
      new ImportModal(this.app, async (id, source, folder, trusted) => {
        const storage = new VaultStorage(this.app.vault);
        const plan = await planImport(storage, this.state, id, source, folder, trusted);
        const assets = await assetReport(storage, plan);
        new PreviewModal(this.app, plan, assets, async () => {
          if (this.writing) throw new Error('另一個匯入正在寫入，請稍後重新預覽。');
          this.writing = true;
          try {
            const result = await applyImport(storage, this.state, plan, next => this.saveData(next));
            this.state = result.state;
            new Notice(`${plan.status === 'unchanged' ? '內容相同，未寫入' : '已匯入'}：${plan.destination}${result.backup ? `；備份：${result.backup}` : ''}`, 10000);
          } finally { this.writing = false; }
        }).open();
      }).open();
    } });
  }
}
