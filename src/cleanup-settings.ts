import { Modal, PluginSettingTab, Setting, type App, type Plugin } from 'obsidian';
import { cleanupFolder, type CleanupSettings } from './cleanup';

export interface CleanupController {
  getCleanupSettings(): CleanupSettings;
  configureCleanup(settings: CleanupSettings, trustedFolder?: string): Promise<void>;
  scanCleanup(): void;
  cleanupStatus: string;
}
class TrustCleanupModal extends Modal {
  private confirmed = false;
  constructor(app: App, private folder: string, private confirm: () => void, private cancel: () => void) { super(app); }
  onOpen(): void {
    this.contentEl.createEl('h2', { text: '確認信任資料夾內容' });
    this.contentEl.createEl('p', { text: `資料夾：${this.folder}（含子資料夾）。` });
    this.contentEl.createEl('p', { text: '信任適用於這個資料夾內現有及日後新增／修改的所有 HTML 區塊，包含已清理的筆記與未配對區塊。儲存並啟用自動清理後，html-source 將轉為 html。' });
    this.contentEl.createEl('p', { text: 'Polyglot Renderer 啟用時可能立即執行 JavaScript 及外部網路請求；配對校驗不代表內容安全。請先檢查並信任內容。外掛不會自動安裝或啟用 renderer。' });
    this.contentEl.createEl('p', { text: '每次修改前會備份。關閉此選項只停止後續轉換，已產生的 html 不會自動還原。按下確認後仍需「儲存設定」才生效。' });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText('取消').onClick(() => this.close()))
      .addButton(button => button.setButtonText('我信任此資料夾內容，啟用').setCta().onClick(() => { this.confirmed = true; this.confirm(); this.close(); }));
  }
  onClose(): void { this.contentEl.empty(); if (!this.confirmed) this.cancel(); }
}
export class CleanupSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private controller: CleanupController) { super(app, plugin); }
  display(): void {
    const container = this.containerEl;
    container.empty();
    container.createEl('h2', { text: '指定資料夾自動清理' });
    container.createEl('p', { text: '直接修改資料夾內的 Markdown（含子資料夾）。儲存並啟用後會先清理現有檔案，之後自動處理新增、修改與移入的檔案。每次寫入前備份至 GPT Pages Backups/cleanup。' });
    container.createEl('p', { text: '只移除成功配對的標記及原生圖片參照；預設保留 HTML 原始碼與 html／html-source 語言。備份及已追蹤的匯入目的筆記不處理。' });
    const draft = this.controller.getCleanupSettings();
    let trustedFolder = draft.renderHtml ? draft.folder : undefined;
    let setRendering = (_value: boolean) => {};
    let trustDialog: TrustCleanupModal | undefined;
    new Setting(container).setName('自動清理資料夾').setDesc('填入 vault 內的資料夾路徑，例如 Pages Inbox。請先建立資料夾。').addText(text => text.setValue(draft.folder).onChange(folder => {
      if (draft.folder !== folder) { draft.renderHtml = false; trustedFolder = undefined; setRendering(false); trustDialog?.close(); }
      draft.folder = folder;
    }));
    new Setting(container).setName('啟用自動清理').setDesc('預設關閉。只有按下「儲存設定」後才會套用。').addToggle(toggle => toggle.setValue(draft.enabled).onChange(enabled => { draft.enabled = enabled; }));
    const status = container.createEl('p', { text: this.controller.cleanupStatus });
    status.setAttribute('role', 'status');
    new Setting(container).setName('清理後啟用 HTML 渲染').setDesc('預設關閉。確認信任此資料夾內容後，才將所有 html-source 區塊轉為 html；需自行啟用 Polyglot Renderer。更換資料夾須重新確認信任。').addToggle(toggle => {
      let updatingRendering = false;
      setRendering = value => {
        updatingRendering = true;
        try { toggle.setValue(value); }
        finally { updatingRendering = false; }
      };
      toggle.setValue(!!draft.renderHtml).onChange(enabled => {
        if (updatingRendering) return;
        draft.renderHtml = false; trustedFolder = undefined; setRendering(false);
        if (!enabled) { trustDialog?.close(); return; }
        let folder: string;
        try { folder = cleanupFolder(draft.folder); }
        catch { status.textContent = '請先填入有效的自動清理資料夾，再確認信任內容。'; return; }
        trustDialog = new TrustCleanupModal(this.app, folder, () => {
          draft.renderHtml = true; trustedFolder = folder; setRendering(true);
        }, () => { draft.renderHtml = false; trustedFolder = undefined; setRendering(false); });
        trustDialog.open();
      });
    });
    new Setting(container).addButton(button => button.setButtonText('儲存設定').setCta().onClick(async () => {
      button.setDisabled(true);
      try { await this.controller.configureCleanup(draft, trustedFolder); status.textContent = '設定已儲存。' + this.controller.cleanupStatus; }
      catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      finally { button.setDisabled(false); }
    })).addButton(button => button.setButtonText('立即清理資料夾').onClick(() => { this.controller.scanCleanup(); status.textContent = this.controller.cleanupStatus; }));
  }
}
