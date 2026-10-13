// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { convert } from '../src/convert';
it('preserves the authored interactive fixture and slider/reset behavior', () => {
  // Execute only this repository's own fixture in a test DOM; importer never does this.
  const input = readFileSync('tests/fixtures/interactive.input.md', 'utf8');
  const html = convert(input, true).markdown.match(/```html\n([\s\S]*?)\n```/)![1]!;
  document.documentElement.innerHTML = html;
  new Function('document', document.querySelector('script')!.textContent!)(document);
  const slider = document.querySelector<HTMLInputElement>('#slider')!;
  slider.value = '83'; slider.dispatchEvent(new Event('input'));
  expect(document.querySelector('#value')!.textContent).toBe('83');
  expect(document.querySelector<HTMLElement>('#bar')!.style.width).toBe('83%');
  document.querySelector<HTMLButtonElement>('#reset')!.click();
  expect(slider.value).toBe('50'); expect(document.querySelector('#value')!.textContent).toBe('50');
  expect(document.querySelector('title')!.textContent).toBe('互動滑桿');
});
