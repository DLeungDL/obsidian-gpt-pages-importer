import { t } from './i18n';
import type { Plan } from './importer';
/** Never use innerHTML or MarkdownRenderer for untrusted import previews. */
export function renderPreview(container: HTMLElement, plan: Plan, assets: string[]): HTMLElement {
  const append = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string) => container.createEl(tag, { text });
  append('h2', t('preview.title'));
  append('p', t('preview.destination', { destination: plan.destination }));
  append('p', t('preview.status', { status: t(`preview.${plan.status}`), count: plan.conversion.figures }));
  if (plan.conversion.images?.length) append('p', t('image.count', { count: plan.conversion.images.length }));
  const actions = append('div', '');
  actions.classList.add('gpt-pages-preview-actions');
  append('p', t('preview.safety'));
  append('h3', t('preview.warnings'));
  const list = append('ul', '');
  for (const warning of plan.conversion.warnings) {
    list.createEl('li', { text: warning.line ? t('preview.warningLine', { line: warning.line, message: warning.message }) : warning.message });
  }
  const details = (title: string, text: string) => {
    const section = append('details', '');
    section.classList.add('gpt-pages-preview-details');
    section.createEl('summary', { text: title });
    const source = section.createEl('pre', { text });
    source.classList.add('gpt-pages-source');
  };
  details(t('preview.assets'), assets.length ? assets.join('\n') : t('preview.noAssets'));
  details(t('preview.before'), plan.before ?? t('preview.noDestination'));
  details(t('preview.after'), plan.conversion.markdown);
  if (plan.status === 'conflict') append('p', t('preview.resolveConflict'));
  return actions;
}
