import { t } from './i18n';
import { Modal, PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem, type SettingDefinitionRender } from 'obsidian';
import { cleanupFolder, type CleanupSettings } from './cleanup';
import { addRendererStatus } from './renderer-status';

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
    this.contentEl.createEl('h2', { text: t('trust.title') });
    this.contentEl.createEl('p', { text: t('trust.folder', { folder: this.folder }) });
    this.contentEl.createEl('p', { text: t('trust.scope') });
    this.contentEl.createEl('p', { text: t('trust.risk') });
    this.contentEl.createEl('p', { text: t('trust.save') });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t('common.cancel')).onClick(() => this.close()))
      .addButton(button => button.setButtonText(t('trust.confirm')).setCta().onClick(() => { this.confirmed = true; this.confirm(); this.close(); }));
  }
  onClose(): void { this.contentEl.empty(); if (!this.confirmed) this.cancel(); }
}
export class CleanupSettingTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin, private controller: CleanupController) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [{ type: 'group', heading: t('settings.heading'), items: this.formDefinitions() }];
  }
  // Obsidian before 1.13 has no declarative renderer or settings search.
  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName(t('settings.heading')).setHeading();
    for (const definition of this.formDefinitions()) {
      const setting = new Setting(this.containerEl).setName(definition.name);
      if (definition.desc) setting.setDesc(definition.desc);
      definition.render(setting);
    }
  }
  private formDefinitions(): (Omit<SettingDefinitionRender, 'render'> & { render: (setting: Setting) => void })[] {
    const draft = this.controller.getCleanupSettings();
    let trustedFolder = draft.renderHtml ? draft.folder : undefined;
    let setRendering = (_value: boolean) => {};
    let trustDialog: TrustCleanupModal | undefined;
    let status: HTMLElement | undefined;
    const showStatus = (message: string) => { if (status) status.textContent = message; };
    return [
      {
        name: t('settings.folder'),
        desc: t('settings.folderDescription'),
        aliases: ['folder', 'watch', '資料夾'],
        render: setting => {
          setting.addText(text => text.setValue(draft.folder).onChange(folder => {
            if (draft.folder !== folder) { draft.renderHtml = false; trustedFolder = undefined; setRendering(false); trustDialog?.close(); }
            draft.folder = folder;
          }));
        }
      },
      {
        name: t('settings.enabled'),
        desc: t('settings.enabledDescription'),
        aliases: ['automatic cleanup', '自動清理'],
        render: setting => { setting.addToggle(toggle => toggle.setValue(draft.enabled).onChange(enabled => { draft.enabled = enabled; })); }
      },
      {
        name: t('settings.render'),
        desc: t('settings.renderDescription'),
        aliases: ['HTML', 'renderer', 'trust', '信任'],
        render: setting => {
          addRendererStatus(setting, this.app);
          setting.addToggle(toggle => {
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
              catch { showStatus(t('settings.validFolder')); return; }
              trustDialog = new TrustCleanupModal(this.app, folder, () => {
                draft.renderHtml = true; trustedFolder = folder; setRendering(true);
              }, () => { draft.renderHtml = false; trustedFolder = undefined; setRendering(false); });
              trustDialog.open();
            });
          });
        }
      },
      {
        name: t('settings.actions'),
        desc: t('settings.actionsDescription'),
        aliases: ['save', 'scan', 'backup', '儲存', '備份'],
        render: setting => {
          setting.setClass('gpt-pages-cleanup-actions');
          status = setting.controlEl.createEl('p', { cls: 'gpt-pages-cleanup-status', text: this.controller.cleanupStatus });
          status.setAttribute('role', 'status');
          setting.addButton(button => button.setButtonText(t('settings.save')).setCta().onClick(async () => {
            button.setDisabled(true);
            try { await this.controller.configureCleanup(draft, trustedFolder); showStatus(t('settings.saved', { status: this.controller.cleanupStatus })); }
            catch (error) { showStatus(error instanceof Error ? error.message : String(error)); }
            finally { button.setDisabled(false); }
          })).addButton(button => button.setButtonText(t('settings.scan')).onClick(() => { this.controller.scanCleanup(); showStatus(this.controller.cleanupStatus); }));
        }
      }
    ];
  }
}
