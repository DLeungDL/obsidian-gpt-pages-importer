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
