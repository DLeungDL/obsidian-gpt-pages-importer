/** Public-API host double, not evidence of real Obsidian compatibility. */
export function getLanguage(): string { return 'zh-TW'; }
export class TAbstractFile { constructor(public path: string) {} }
export class TFile extends TAbstractFile {
  stat: { size: number };
  constructor(path: string, size = 0) { super(path); this.stat = { size }; }
  get name() { return this.path.split('/').at(-1)!; }
}
export class TFolder extends TAbstractFile {
  constructor(path: string, public children: TAbstractFile[] = []) { super(path); }
}
export class TestVault {
  configDir = '.obsidian';
  configFiles = new Map<string, string>();
  adapter = {
    exists: async (path: string) => this.configFiles.has(path),
    read: async (path: string) => {
      const content = this.configFiles.get(path);
      if (content === undefined) throw new Error('Missing configuration file');
      return content;
    }
  };
  files = new Map<string, string>();
  folders = new Set<string>();
  handlers = new Map<string, ((file: TAbstractFile, oldPath?: string) => void)[]>();
  on(name: string, callback: (file: TAbstractFile, oldPath?: string) => void) { const handlers = this.handlers.get(name) ?? []; handlers.push(callback); this.handlers.set(name, handlers); return {}; }
  emit(name: string, file: TAbstractFile, oldPath?: string) { for (const handler of this.handlers.get(name) ?? []) handler(file, oldPath); }
  getFiles() { return [...this.files].map(([path, text]) => new TFile(path, new TextEncoder().encode(text).length)); }
  getAbstractFileByPath(path: string): TAbstractFile | null {
    if (this.files.has(path)) return new TFile(path, new TextEncoder().encode(this.files.get(path)!).length);
    if (!this.folders.has(path)) return null;
    return this.folder(path);
  }
  private folder(path: string): TFolder {
    const children = new Map<string, TAbstractFile>();
    for (const candidate of [...this.folders, ...this.files.keys()]) {
      if (!candidate.startsWith(path + '/')) continue;
      const name = candidate.slice(path.length + 1).split('/')[0]!;
      const childPath = path + '/' + name;
      if (candidate !== childPath || this.folders.has(childPath)) children.set(childPath, this.folder(childPath));
      else children.set(childPath, new TFile(childPath, new TextEncoder().encode(this.files.get(childPath)!).length));
    }
    return new TFolder(path, [...children.values()]);
  }
  // Real Vault.read strips the opening BOM; readBinary and process preserve it.
  async read(file: TFile) { return new TextDecoder().decode(await this.readBinary(file)); }
  async readBinary(file: TFile) { return new TextEncoder().encode(this.files.get(file.path)!).buffer; }
  async createFolder(path: string) { this.folders.add(path); }
  async create(path: string, content: string) { if (this.getAbstractFileByPath(path)) throw new Error('exists'); this.files.set(path, content); const file = new TFile(path, new TextEncoder().encode(content).length); this.emit('create', file); return file; }
  async modify(file: TFile, content: string) { this.files.set(file.path, content); this.emit('modify', file); }
  async rename(file: TFile, path: string) { const oldPath = file.path; const content = this.files.get(oldPath)!; this.files.delete(oldPath); this.files.set(path, content); file.path = path; this.emit('rename', file, oldPath); }
  async process(file: TFile, fn: (text: string) => string) { const next = fn(this.files.get(file.path)!); this.files.set(file.path, next); this.emit('modify', file); return next; }
}
class MenuItem {
  title = '';
  callback = () => {};
  setTitle(title: string) { this.title = title; return this; }
  setIcon(_icon: string) { return this; }
  onClick(callback: () => void) { this.callback = callback; return this; }
}
export class Menu {
  items: MenuItem[] = [];
  addItem(callback: (item: MenuItem) => void) { const item = new MenuItem(); callback(item); this.items.push(item); return this; }
}
export class TestWorkspace {
  private activeFile: TFile | null = null;
  leaf = { openFile: async (file: TFile) => { this.activeFile = file; } };
  getLeaf(_newLeaf?: boolean) { return this.leaf; }
  getActiveFile() { return this.activeFile; }
  onLayoutReady(callback: () => void) { callback(); }
  fileMenuHandlers: ((menu: Menu, file: TFile | TFolder) => void)[] = [];
  on(_name: 'file-menu', callback: (menu: Menu, file: TFile | TFolder) => void) { this.fileMenuHandlers.push(callback); return {}; }
}
export class TestApp { vault = new TestVault(); workspace = new TestWorkspace(); }
export function normalizePath(path: string) { return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, ''); }
export class Plugin {
  app = new TestApp();
  commands: { id: string; name?: string; callback: () => void; checkCallback?: (checking: boolean) => boolean | void }[] = [];
  ribbonIcons: HTMLElement[] = [];
  settingTabs: PluginSettingTab[] = [];
  data: unknown = null;
  async loadData() { return this.data; }
  async saveData(data: unknown) { this.data = data; }
  addCommand(command: { id: string; name?: string; callback?: () => void; checkCallback?: (checking: boolean) => boolean | void }) { this.commands.push({ ...command, callback: command.callback ?? (() => command.checkCallback?.(false)) }); }
  addRibbonIcon(_icon: string, title: string, callback: () => void) { const element = document.createElement('button'); element.title = title; element.addEventListener('click', callback); this.ribbonIcons.push(element); return element; }
  registerEvent(_event: unknown) {}
  addSettingTab(tab: PluginSettingTab) { this.settingTabs.push(tab); }
}
function hostElement(): HTMLElement {
  const element = document.createElement('div');
  element.createEl = (tag, opts) => {
    const child = document.createElement(tag);
    if (typeof opts === 'string') child.className = opts;
    else if (typeof opts?.text === 'string') child.textContent = opts.text;
    else if (opts?.text) child.append(opts.text);
    element.append(child); return child as never;
  };
  element.empty = () => element.replaceChildren();
  return element;
}
export class PluginSettingTab {
  containerEl = hostElement();
  constructor(public app: TestApp, public plugin: Plugin) {}
  display() {}
}
export class Notice {
  static messages: string[] = [];
  constructor(message: string) { Notice.messages.push(message); }
}
export class Modal {
  static opened: Modal[] = [];
  contentEl = document.createElement('div');
  constructor(public app: TestApp) {
    const element = this.contentEl as unknown as { createEl: (tag: string, opts?: { text?: string; type?: string }) => HTMLElement; empty: () => void };
    element.createEl = (tag, opts) => {
      const child = document.createElement(tag);
      if (opts?.text) child.textContent = opts.text;
      if (opts?.type) child.setAttribute('type', opts.type);
      this.contentEl.append(child); return child;
    };
    element.empty = () => this.contentEl.replaceChildren();
  }
  onOpen() {}
  onClose() {}
  open() { Modal.opened.push(this); document.body.append(this.contentEl); this.onOpen(); }
  close() { this.onClose(); this.contentEl.remove(); Modal.opened = Modal.opened.filter(modal => modal !== this); }
}
class Control {
  private changeCallback?: (value: string | boolean) => void;
  private toggleValue = false;
  constructor(public element: HTMLInputElement | HTMLButtonElement) {
    this.element.addEventListener('change', () => {
      if (this.element instanceof HTMLInputElement && this.element.type === 'checkbox') this.setValue(this.element.checked);
      else this.changeCallback?.((this.element as HTMLInputElement).value);
    });
  }
  setValue(value: string | boolean) {
    if (this.element instanceof HTMLInputElement) {
      if (typeof value === 'boolean') {
        const changed = this.toggleValue !== value;
        this.toggleValue = value; this.element.checked = value;
        // Obsidian ToggleComponent.setValue also invokes onChange for programmatic changes.
        if (changed) this.changeCallback?.(value);
      } else this.element.value = value;
    }
    return this;
  }
  onChange(fn: (value: string | boolean) => void) { this.changeCallback = fn; return this; }
  setButtonText(text: string) { this.element.textContent = text; return this; }
  setCta() { return this; }
  setDisabled(value: boolean) { this.element.disabled = value; return this; }
  onClick(fn: () => void) { this.element.addEventListener('click', fn); return this; }
}
export class Setting {
  element = document.createElement('div');
  descEl = hostElement();
  get controlEl() { return this.element; }
  constructor(container: HTMLElement) { this.element.append(this.descEl); container.append(this.element); }
  setName(text: string) { const label = document.createElement('label'); label.textContent = text; this.element.append(label); return this; }
  setHeading() { this.element.classList.add('setting-item-heading'); return this; }
  setClass(cls: string) { this.element.classList.add(cls); return this; }
  setDesc(text: string) { this.descEl.textContent = text; return this; }
  private control(type: 'text' | 'checkbox' | 'button', fn: (control: Control) => void) {
    const element = document.createElement(type === 'button' ? 'button' : 'input'); element.type = type;
    this.element.append(element); fn(new Control(element)); return this;
  }
  addText(fn: (control: Control) => void) { return this.control('text', fn); }
  addToggle(fn: (control: Control) => void) { return this.control('checkbox', fn); }
  addButton(fn: (control: Control) => void) { return this.control('button', fn); }
}
