import { beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  if (typeof window === 'undefined') vi.stubGlobal('window', globalThis);
  else Object.defineProperty(window, 'crypto', { configurable: true, value: webcrypto });
});

// Obsidian installs these helpers on each window's own HTMLElement prototype.
export function installDomHelpers(view: Window & typeof globalThis): void {
  view.HTMLElement.prototype.createEl = function(tag, options) {
    const element = this.ownerDocument.createElement(tag);
    if (typeof options === 'string') element.className = options;
    else {
      if (typeof options?.text === 'string') element.textContent = options.text;
      else if (options?.text) element.append(options.text);
      if (options?.type) element.setAttribute('type', options.type);
    }
    this.append(element);
    return element;
  };
  view.HTMLElement.prototype.createDiv = function(options) { return this.createEl('div', options); };
  view.HTMLElement.prototype.empty = function() { this.replaceChildren(); };
}
if (typeof window !== 'undefined' && typeof HTMLElement !== 'undefined') installDomHelpers(window);
