/** Public-API host double, not evidence of real Obsidian compatibility. */
export class TFile { constructor(public path: string) {} }
export class TFolder { constructor(public path: string) {} }
export class TestVault {
  files = new Map<string, string>();
  folders = new Set<string>();
  getAbstractFileByPath(path: string) { return this.files.has(path) ? new TFile(path) : this.folders.has(path) ? new TFolder(path) : null; }
  async read(file: TFile) { return this.files.get(file.path)!; }
  async createFolder(path: string) { this.folders.add(path); }
  async create(path: string, content: string) { if (this.getAbstractFileByPath(path)) throw new Error('exists'); this.files.set(path, content); return new TFile(path); }
  async process(file: TFile, fn: (text: string) => string) { const next = fn(this.files.get(file.path)!); this.files.set(file.path, next); return next; }
}
export class TestApp { vault = new TestVault(); }
export class Plugin {
  app = new TestApp();
  commands: { id: string; callback: () => void }[] = [];
  data: unknown = null;
  async loadData() { return this.data; }
  async saveData(data: unknown) { this.data = data; }
  addCommand(command: { id: string; callback: () => void }) { this.commands.push(command); }
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
  constructor(public element: HTMLInputElement | HTMLButtonElement) {}
  setValue(value: string | boolean) { if (this.element instanceof HTMLInputElement) { if (typeof value === 'boolean') this.element.checked = value; else this.element.value = value; } return this; }
  onChange(fn: (value: string | boolean) => void) { this.element.addEventListener('change', () => fn(this.element instanceof HTMLInputElement && this.element.type === 'checkbox' ? this.element.checked : (this.element as HTMLInputElement).value)); return this; }
  setButtonText(text: string) { this.element.textContent = text; return this; }
  setCta() { return this; }
  setDisabled(value: boolean) { this.element.disabled = value; return this; }
  onClick(fn: () => void) { this.element.addEventListener('click', fn); return this; }
}
export class Setting {
  element = document.createElement('div');
  constructor(container: HTMLElement) { container.append(this.element); }
  setName(text: string) { const label = document.createElement('label'); label.textContent = text; this.element.append(label); return this; }
  setDesc(text: string) { const p = document.createElement('p'); p.textContent = text; this.element.append(p); return this; }
  private control(type: 'text' | 'checkbox' | 'button', fn: (control: Control) => void) {
    const element = document.createElement(type === 'button' ? 'button' : 'input'); element.type = type;
    this.element.append(element); fn(new Control(element)); return this;
  }
  addText(fn: (control: Control) => void) { return this.control('text', fn); }
  addToggle(fn: (control: Control) => void) { return this.control('checkbox', fn); }
  addButton(fn: (control: Control) => void) { return this.control('button', fn); }
}
