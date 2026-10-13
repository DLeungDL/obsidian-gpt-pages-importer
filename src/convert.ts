import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';

/** Pure conversion: never executes source or parses HTML into a live DOM. */
export interface Warning { code: string; message: string; line?: number }
export interface Conversion { markdown: string; warnings: Warning[]; figures: number; assets: string[] }
interface Line { text: string; start: number; end: number }
interface Fence { first: number; last: number; language: string; closed: boolean }
interface Edit { start: number; end: number; text: string }

export function convert(markdown: string, trusted = false): Conversion {
  const lines: Line[] = [];
  for (const match of markdown.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    if (!match[0]) continue;
    lines.push({ text: match[0].replace(/[\r\n]+$/, ''), start: match.index, end: match.index + match[0].length });
  }
  const fences: Fence[] = [];
  const protectedLines = new Set<number>();
  const warnings: Warning[] = [];
  const edits: Edit[] = [];
  const walk = (nodes: RootContent[], topLevel: boolean): void => {
    for (const node of nodes) {
      if ((node.type === 'code' || node.type === 'html') && node.position) {
        const first = node.position.start.line - 1;
        const last = Math.min(node.position.end.line - 1, lines.length - 1);
        for (let index = first; index <= last; index++) {
          if (node.type === 'html' && /^\s*<!-- gpt-pages:figure [^\r\n]*-->\s*$/.test(lines[index]!.text) && first === last) continue;
          protectedLines.add(index);
        }
        if (node.type !== 'code' || !node.lang) continue;
        // CommonMark strips a leading BOM from its position offsets.
        const offset = node.position.start.offset! + (markdown.startsWith('\uFEFF') ? 1 : 0);
        const openerText = markdown.slice(offset, lines[first]!.start + lines[first]!.text.length);
        const opener = openerText.match(/^( {0,3})(`{3,}|~{3,})([ \t]*)(\S+)(.*)$/);
        if (!opener) continue;
        const delimiter = opener[2]!;
        const language = node.lang.toLowerCase();
        const closing = new RegExp(`^ {0,3}${delimiter[0]}{${delimiter.length},}[ \\t]*$`);
        const closed = last > first && closing.test(lines[last]!.text);
        if (topLevel) fences.push({ first, last, language, closed });
        if (['html', 'html-source'].includes(language)) {
          const desired = trusted ? 'html' : 'html-source';
          const tokenStart = offset + opener[1]!.length + delimiter.length + opener[3]!.length;
          if (opener[4] !== desired) edits.push({ start: tokenStart, end: tokenStart + opener[4]!.length, text: desired });
          if (topLevel && !closed) warnings.push({ code: 'unclosed-fence', message: 'HTML fence 未關閉，保留內容並停用預設執行。', line: first + 1 });
        }
      }
      if ('children' in node) walk(node.children as RootContent[], false);
    }
  };
  walk(fromMarkdown(markdown).children, true);
  const markers: { line: number; id: string; version: string }[] = [];
  const counts = new Map<string, number>();
  lines.forEach((line, index) => {
    if (protectedLines.has(index)) return;
    const marker = line.text.match(/^\s*<!-- gpt-pages:figure v=(\d+) id=([A-Za-z0-9_-]+) -->\s*$/);
    if (marker) {
      const id = marker[2]!;
      markers.push({ line: index, version: marker[1]!, id });
      counts.set(id, (counts.get(id) ?? 0) + 1);
    } else if (line.text.includes('gpt-pages:figure')) {
      warnings.push({ code: 'malformed-marker', message: '無法辨識 figure 標記，保留原文。', line: index + 1 });
    }
  });
  let figures = 0;
  const pairedReferences = new Set<number>();
  const nextNonBlank = (index: number): number => {
    while (index < lines.length && !lines[index]!.text.trim()) index++;
    return index;
  };
  for (const marker of markers) {
    const warn = (code: string, message: string) => warnings.push({ code, message, line: marker.line + 1 });
    if (marker.version !== '1') { warn('unknown-version', `未知格式版本 ${marker.version}，保留原文。`); continue; }
    if (counts.get(marker.id) !== 1) { warn('duplicate-id', `重複 figure identifier：${marker.id}，不替換參照。`); continue; }
    const referenceLine = nextNonBlank(marker.line + 1);
    const hasReference = lines[referenceLine]?.text.trim() === `visualize:${marker.id}`;
    const fenceLine = hasReference ? nextNonBlank(referenceLine + 1) : referenceLine;
    const fence = fences.find(f => f.first === fenceLine);
    if (!fence || !['html', 'html-source'].includes(fence.language) || !fence.closed) {
      warn('missing-source', `找不到 ${marker.id} 相鄰且完整的 HTML source，保留原文。`); continue;
    }
    const source = markdown.slice(lines[fence.first]!.end, lines[fence.last]!.start);
    if (!/^\s*<!doctype html\s*>/i.test(source) || !/<html(?:\s[^>]*)?>/i.test(source) || !/<\/html>\s*$/i.test(source)) {
      warn('incomplete-document', `${marker.id} 缺少完整 HTML 文件邊界，保留參照。`); continue;
    }
    figures++;
    if (hasReference) {
      edits.push({ start: lines[referenceLine]!.start, end: lines[referenceLine]!.end, text: '' });
      pairedReferences.add(referenceLine);
    }
  }
  lines.forEach((line, index) => {
    if (!protectedLines.has(index) && /visualize:/.test(line.text) && !pairedReferences.has(index)) {
      warnings.push({ code: 'unpaired-reference', message: '未確認精確配對的 visualize: 參照已保留。', line: index + 1 });
    }
  });
  let output = markdown;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  const assets = assetReferences(markdown);
  if (assets.length) warnings.push({ code: 'asset-references', message: '內容包含資產參照；本外掛不下載資產。動態生成的 URL 無法靜態完整辨識。' });
  if (!trusted) warnings.push({ code: 'renderer-disabled', message: 'HTML 已保留為 html-source。呈現需 Polyglot Renderer 並明確信任 scripts；本次預覽不執行內容。' });
  else warnings.push({ code: 'trusted-rendering', message: '輸出 html fence 可由 renderer 執行 scripts，也可能發出網路請求。' });
  return { markdown: output, warnings, figures, assets };
}

export function assetReferences(text: string): string[] {
  const urls = new Set<string>();
  const patterns = [
    /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*["']?([^\s"')]+)["']?\s*\)/gi,
    /@import\s+["']([^"']+)["']/gi,
    /!\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g,
    /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g,
    /\b(?:https?:)?\/\/[^\s"'<>`\\)]+/g
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
    const value = match[1] ?? match[0];
    if (!value.startsWith('#') && !/^(?:data:|mailto:|visualize:)/i.test(value)) urls.add(value);
  }
  return [...urls].sort();
}
