// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { renderPreview } from '../src/preview';
import type { Plan } from '../src/importer';
it('shows hostile source and warning text without creating executable DOM', () => {
  const payload = '<script>window.compromised = true</script><img src="https://example.invalid/x" onerror="window.compromised=true"><iframe srcdoc="evil"></iframe>';
  const container = document.createElement('div'); document.body.append(container);
  const plan: Plan = { key: '', sourceId: '', destination: payload, before: payload, conversion: { markdown: payload, warnings: [{ code: 'test', message: payload }], figures: 0, assets: [] }, outputHash: '', status: 'conflict' };
  renderPreview(container, plan, [payload]);
  expect(container.querySelector('script,img,iframe')).toBeNull();
  expect(container.textContent).toContain(payload);
  expect((window as unknown as { compromised?: boolean }).compromised).toBeUndefined();
});
it('keeps summary actions outside collapsed source and asset details', () => {
  const container = document.createElement('div');
  const plan: Plan = { key: '', sourceId: '', destination: 'GPT Pages/example.md', before: 'Before', conversion: { markdown: 'After', warnings: [], figures: 4, assets: [] }, outputHash: '', status: 'update' };
  const actions = renderPreview(container, plan, []);
  const details = [...container.querySelectorAll('details')];
  expect(container.textContent).toContain('成功配對：4');
  expect(details).toHaveLength(3);
  expect(details.every(section => !section.open)).toBe(true);
  expect(actions.closest('details')).toBeNull();
  expect(actions.compareDocumentPosition(details[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(details[1]!.querySelector('pre')!.textContent).toBe('Before');
  expect(details[2]!.querySelector('pre')!.textContent).toBe('After');
});
