import type { Plan } from './importer';
/** Never use innerHTML or MarkdownRenderer for untrusted import previews. */
export function renderPreview(container: HTMLElement, plan: Plan, assets: string[]): HTMLElement {
  const document = container.ownerDocument;
  const append = (tag: string, text: string) => {
    const element = document.createElement(tag);
    element.textContent = text;
    container.appendChild(element);
    return element;
  };
  append('h2', '匯入變更預覽');
  append('p', `目的地：${plan.destination}`);
  append('p', `狀態：${({ create: '建立新檔案', update: '更新並先備份', unchanged: '內容相同，不寫入', conflict: '有本機修改或既有檔案，停止寫入' })[plan.status]}；成功配對：${plan.conversion.figures}`);
  const actions = append('div', '');
  actions.classList.add('gpt-pages-preview-actions');
  append('p', '預覽以純文字顯示，不執行 HTML 或 scripts。未安裝 Polyglot Renderer 時只顯示原始碼。');
  append('h3', '警告');
  const list = append('ul', '');
  for (const warning of plan.conversion.warnings) {
    const item = document.createElement('li');
    item.textContent = `${warning.line ? `第 ${warning.line} 行：` : ''}${warning.message}`;
    list.appendChild(item);
  }
  const details = (title: string, text: string) => {
    const section = append('details', '');
    section.classList.add('gpt-pages-preview-details');
    const summary = document.createElement('summary');
    summary.textContent = title;
    const source = document.createElement('pre');
    source.textContent = text;
    source.classList.add('gpt-pages-source');
    section.append(summary, source);
  };
  details('資產報告', assets.length ? assets.join('\n') : '未辨識到靜態資產參照；JavaScript 動態載入仍需自行檢查。');
  details('匯入前原始碼', plan.before ?? '（目的檔案尚不存在）');
  details('匯入後原始碼', plan.conversion.markdown);
  if (plan.status === 'conflict') append('p', '請取消並手動合併，或重新開啟匯入命令，使用新的來源識別名稱另存。原目的檔案不會被覆寫。');
  return actions;
}
