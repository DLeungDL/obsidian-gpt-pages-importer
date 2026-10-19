import { t } from './i18n';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';
import { digest } from './hash';
import type { PortableImage } from './images';

/** Pure conversion: never executes source or parses HTML into a live DOM. */
export interface Warning { code: string; message: string; line?: number }
export interface Conversion { markdown: string; warnings: Warning[]; figures: number; assets: string[]; images?: PortableImage[]; mathBlocks?: number }
interface Line { text: string; start: number; end: number }
interface Fence { first: number; last: number; language: string; closed: boolean }
interface Edit { start: number; end: number; text: string }
interface Marker { line: number; id: string; version: string; ref?: string; sha256?: string }
type SourceMarker = Marker;
interface Token { text?: string; imageUrl?: string }
interface Candidate { marker: Marker; referenceLine?: number; source: string; detached?: { marker: SourceMarker; fence: Fence } }
interface Prepared {
  markdown: string; lines: Line[]; warnings: Warning[]; edits: Edit[];
  protectedLines: Set<number>; referenceLines: Set<number>; pairedReferences: Set<number>;
  sources: SourceMarker[]; pairedSources: Set<number>;
  figures: number; candidates: Candidate[]; mathBlocks: number;
}

/** Synchronous v1 API. Unverified v2/v3 references are retained. */
export function convert(markdown: string, trusted = false): Conversion {
  const prepared = prepare(markdown, trusted);
  for (const candidate of prepared.candidates) prepared.warnings.push({
    code: 'verification-required', message: t('warning.verification'), line: candidate.marker.line + 1
  });
  return finish(prepared);
}

/** Verify source bytes without executing or fetching them. */
export async function convertVerified(markdown: string, trusted = false): Promise<Conversion> {
  return verify(prepare(markdown, trusted));
}

/** HTML fence conversion requires trust; standalone Pages math uses Obsidian math. */
export async function cleanVerified(markdown: string, renderHtml = false): Promise<Conversion> {
  return verify(prepare(markdown, renderHtml ? true : null));
}

async function verify(prepared: Prepared): Promise<Conversion> {
  for (const candidate of prepared.candidates) {
    let hash: string;
    try { hash = await digest(candidate.source); }
    catch {
      prepared.warnings.push({ code: 'hash-unavailable', message: t('warning.hashUnavailable'), line: candidate.marker.line + 1 });
      continue;
    }
    if (hash !== candidate.marker.sha256) {
      prepared.warnings.push({ code: 'source-hash-mismatch', message: t('warning.hashMismatch', { id: candidate.marker.id }), line: candidate.marker.line + 1 });
      continue;
    }
    paired(prepared, candidate.marker, candidate.referenceLine, candidate.detached);
  }
  return finish(prepared);
}

function paired(prepared: Prepared, marker: Marker, referenceLine?: number, detached?: Candidate['detached']): void {
  prepared.figures++;
  const line = prepared.lines[marker.line]!;
  // Opening BOMs belong to the file, not the verified metadata being removed.
  const bom = marker.line === 0 ? line.text.match(/^\uFEFF+/)?.[0] ?? '' : '';
  let replacement = bom;
  if (detached) {
    const start = prepared.lines[detached.fence.first]!.start;
    const end = prepared.lines[detached.fence.last]!.end;
    let fence = prepared.markdown.slice(start, end);
    // Move the original fence with any explicit trust-language change, never its HTML bytes.
    const fenceEdits = prepared.edits.filter(edit => edit.start >= start && edit.end <= end);
    for (const edit of fenceEdits.sort((a, b) => b.start - a.start)) fence = fence.slice(0, edit.start - start) + edit.text + fence.slice(edit.end - start);
    prepared.edits = prepared.edits.filter(edit => !fenceEdits.includes(edit));
    if (!/[\r\n]$/.test(fence)) fence += prepared.markdown.slice(line.start + line.text.length, line.end) || '\n';
    replacement += fence;
    prepared.edits.push({ start, end, text: '' });
    const sourceLine = prepared.lines[detached.marker.line]!;
    const sourceBom = detached.marker.line === 0 ? sourceLine.text.match(/^\uFEFF+/)?.[0] ?? '' : '';
    prepared.edits.push({ start: sourceLine.start, end: sourceLine.end, text: sourceBom });
    prepared.pairedSources.add(detached.marker.line);
  }
  prepared.edits.push({ start: line.start, end: line.end, text: replacement });
  if (referenceLine === undefined) return;
  prepared.edits.push({ start: prepared.lines[referenceLine]!.start, end: prepared.lines[referenceLine]!.end, text: '' });
  prepared.pairedReferences.add(referenceLine);
}

function prepare(markdown: string, trusted: boolean | null): Prepared {
  const lines: Line[] = [];
  for (const match of markdown.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    if (!match[0]) continue;
    lines.push({ text: match[0].replace(/[\r\n]+$/, ''), start: match.index, end: match.index + match[0].length });
  }
  const fences: Fence[] = [];
  const protectedLines = new Set<number>();
  const warnings: Warning[] = [];
  const edits: Edit[] = [];
  let mathBlocks = 0;
  const standalone = new Map<number, Token>();
  const referenceLines = new Set<number>();
  const imageCounts = new Map<string, number>();
  const tree = fromMarkdown(markdown);
  for (const node of tree.children) {
    if (!node.position || node.position.start.line !== node.position.end.line) continue;
    const first = node.position.start.line - 1;
    if (node.type === 'html') standalone.set(first, { text: node.value });
    if (node.type === 'paragraph' && node.children.length === 1) {
      const child = node.children[0]!;
      if (child.type === 'text') standalone.set(first, { text: child.value });
      if (child.type === 'image') standalone.set(first, { imageUrl: child.url });
    }
  }
  const walk = (nodes: RootContent[], topLevel: boolean): void => {
    for (const node of nodes) {
      if (node.type === 'image' && node.url.startsWith('visualize:')) {
        imageCounts.set(node.url, (imageCounts.get(node.url) ?? 0) + 1);
        if (node.position) referenceLines.add(node.position.start.line - 1);
      }
      if ((node.type === 'code' || node.type === 'html') && node.position) {
        const first = node.position.start.line - 1;
        const last = Math.min(node.position.end.line - 1, lines.length - 1);
        for (let index = first; index <= last; index++) {
          if (node.type === 'html' && /^\s*<!-- gpt-pages:(?:figure|source) [^\r\n]*-->\s*$/.test(lines[index]!.text) && first === last) continue;
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
        if (topLevel && closed && language === 'latex' && opener[4]!.toLowerCase() === 'latex' && !opener[5]!.trim()) {
          const source = markdown.slice(lines[first]!.end, lines[last]!.start);
          // Convert the bare formula form used by Pages. Preserve wrapped math,
          // document/preamble code, empty blocks and ambiguous forms.
          if (source.trim() && !/\$|\\(?:\(|\)|\[|\])|\\(?:documentclass|usepackage|newcommand|renewcommand|def|input|include)\b|\\(?:begin|end)\s*\{document\}/.test(source)) {
            const newline = markdown.slice(lines[first]!.start + lines[first]!.text.length, lines[first]!.end);
            const prefix = first > 0 && lines[first - 1]!.text.trim() ? newline : '';
            const suffix = last + 1 < lines.length && lines[last + 1]!.text.trim() ? newline : '';
            const bom = first === 0 ? lines[first]!.text.match(/^\uFEFF+/)?.[0] ?? '' : '';
            edits.push({ start: lines[first]!.start, end: lines[first]!.end - newline.length, text: bom + prefix + '$$' });
            edits.push({ start: lines[last]!.start, end: lines[last]!.start + lines[last]!.text.length, text: '$$' + suffix });
            mathBlocks++;
          }
        }
        if (['html', 'html-source'].includes(language)) {
          const desired = trusted === null ? opener[4]! : trusted ? 'html' : 'html-source';
          const tokenStart = offset + opener[1]!.length + delimiter.length + opener[3]!.length;
          if (opener[4] !== desired) edits.push({ start: tokenStart, end: tokenStart + opener[4]!.length, text: desired });
          if (topLevel && !closed) warnings.push({ code: 'unclosed-fence', message: trusted === null ? t('warning.unclosedCleanup') : t('warning.unclosedImport'), line: first + 1 });
        }
      }
      if ('children' in node) walk(node.children, false);
    }
  };
  walk(tree.children, true);
  const markers: Marker[] = [];
  const counts = new Map<string, number>();
  const bindingCounts = new Map<string, number>();
  const sources: SourceMarker[] = [];
  const sourceCounts = new Map<string, number>();
  lines.forEach((line, index) => {
    if (protectedLines.has(index)) return;
    // Interpret standalone tokens only; raw escaping and HTML bodies stay intact.
    const text = standalone.get(index)?.text;
    const identity = text?.match(/^\s*<!-- gpt-pages:figure (?:v=\d+ )?id=([A-Za-z0-9_-]+)(?: [^\r\n]*)? -->\s*$/);
    if (identity) counts.set(identity[1]!, (counts.get(identity[1]!) ?? 0) + 1);
    const marker = text?.match(/^\s*<!-- gpt-pages:figure v=(\d+) id=([A-Za-z0-9_-]+)(?: ref=([A-Za-z0-9_-]{1,256}) sha256=([a-f0-9]{64}))? -->\s*$/);
    const compact = text?.match(/^\s*<!-- gpt-pages:figure id=([A-Za-z0-9_-]+) -->\s*$/);
    if (compact) markers.push({ line: index, version: '3', id: compact[1]! });
    else if (marker) {
      const id = marker[2]!;
      const ref = marker[3];
      markers.push({ line: index, version: marker[1]!, id, ref, sha256: marker[4] });
      if (marker[1] === '2' && ref) bindingCounts.set(ref, (bindingCounts.get(ref) ?? 0) + 1);
    } else if (/gpt-pages\\?:figure/.test(line.text)) {
      warnings.push({ code: 'malformed-marker', message: t('warning.malformedFigure'), line: index + 1 });
    }
    const sourceIdentity = text?.match(/^\s*<!-- gpt-pages:source v=\d+ id=([A-Za-z0-9_-]+)(?: [^\r\n]*)? -->\s*$/);
    if (sourceIdentity) sourceCounts.set(sourceIdentity[1]!, (sourceCounts.get(sourceIdentity[1]!) ?? 0) + 1);
    const sourceMarker = text?.match(/^\s*<!-- gpt-pages:source v=(\d+) id=([A-Za-z0-9_-]+)(?: ref=([A-Za-z0-9_-]{1,256}) sha256=([a-f0-9]{64}))? -->\s*$/);
    if (sourceMarker) {
      sources.push({ line: index, version: sourceMarker[1]!, id: sourceMarker[2]!, ref: sourceMarker[3], sha256: sourceMarker[4] });
      if (sourceMarker[1] === '3' && sourceMarker[3]) bindingCounts.set(sourceMarker[3], (bindingCounts.get(sourceMarker[3]) ?? 0) + 1);
    }
    else if (/gpt-pages\\?:source/.test(line.text)) warnings.push({ code: 'malformed-source', message: t('warning.malformedSource'), line: index + 1 });
  });
  const prepared: Prepared = { markdown, lines, warnings, edits, protectedLines, referenceLines, pairedReferences: new Set(), sources, pairedSources: new Set(), figures: 0, candidates: [], mathBlocks };
  const nextNonBlank = (index: number): number => {
    while (index < lines.length && !lines[index]!.text.trim()) index++;
    return index;
  };
  for (const marker of markers) {
    const warn = (code: string, message: string) => warnings.push({ code, message, line: marker.line + 1 });
    if (!['1', '2', '3'].includes(marker.version)) { warn('unknown-version', t('warning.version', { version: marker.version })); continue; }
    if (counts.get(marker.id) !== 1) { warn('duplicate-id', t('warning.duplicateId', { id: marker.id })); continue; }
    if (marker.version !== '2' && marker.ref) { warn('malformed-marker', t('warning.figureFields', { version: marker.version })); continue; }
    let sourceMarker: SourceMarker | undefined;
    if (marker.version === '3' || (marker.version === '2' && sourceCounts.has(marker.id))) {
      if (!sourceCounts.has(marker.id)) { warn('missing-source', t('warning.footerMissing', { id: marker.id })); continue; }
      if (sourceCounts.get(marker.id) !== 1) { warn('duplicate-source', t('warning.sourceDuplicate', { id: marker.id })); continue; }
      sourceMarker = sources.find(source => source.id === marker.id);
      if (!sourceMarker || sourceMarker.version !== marker.version || (marker.version === '2' && sourceMarker.ref)) {
        warn('invalid-source-marker', t('warning.sourceInvalid', { id: marker.id })); continue;
      }
    }
    const binding = marker.version === '3' ? sourceMarker! : marker;
    if (marker.version !== '1') {
      if (!binding.ref || !binding.sha256) { warn('missing-binding', t('warning.binding', { version: marker.version })); continue; }
      if (bindingCounts.get(binding.ref) !== 1 || (imageCounts.get(`visualize:${binding.ref}`) ?? 0) > 1) {
        warn('duplicate-reference', t('warning.referenceDuplicate', { ref: binding.ref })); continue;
      }
    }
    const referenceLine = nextNonBlank(marker.line + 1);
    let hasReference = marker.version === '1' && lines[referenceLine]?.text.trim() === `visualize:${marker.id}`;
    if (marker.version !== '1') {
      const imageUrl = standalone.get(referenceLine)?.imageUrl;
      if (imageUrl !== undefined) {
        if (imageUrl !== `visualize:${binding.ref}`) { warn('reference-mismatch', t('warning.referenceMismatch', { id: marker.id })); continue; }
        hasReference = true;
      }
    }
    const fenceLine = hasReference ? nextNonBlank(referenceLine + 1) : referenceLine;
    let fence = fences.find(f => f.first === fenceLine);
    let detached: Candidate['detached'];
    if (sourceMarker) {
      const sourceFence = fences.find(f => f.first === nextNonBlank(sourceMarker.line + 1));
      if (fence && fence !== sourceFence) { warn('ambiguous-source', t('warning.ambiguous', { id: marker.id })); continue; }
      if (!hasReference) { warn('missing-reference', t('warning.referenceMissing', { id: marker.id })); continue; }
      fence = sourceFence;
      if (fence) detached = { marker: sourceMarker, fence };
    }
    if (!fence || !['html', 'html-source'].includes(fence.language) || !fence.closed) {
      warn('missing-source', t('warning.sourceMissing', { id: marker.id })); continue;
    }
    const source = markdown.slice(lines[fence.first]!.end, lines[fence.last]!.start);
    if (!/^\s*<!doctype html\s*>/i.test(source) || !/<html(?:\s[^>]*)?>/i.test(source) || !/<\/html>\s*$/i.test(source)) {
      warn('incomplete-document', t('warning.incomplete', { id: marker.id })); continue;
    }
    if (marker.version !== '1') prepared.candidates.push({ marker: { ...marker, ref: binding.ref, sha256: binding.sha256 }, referenceLine: hasReference ? referenceLine : undefined, source, detached });
    else paired(prepared, marker, hasReference ? referenceLine : undefined);
  }
  if (trusted !== null) warnings.push(trusted
    ? { code: 'trusted-rendering', message: t('warning.trusted') }
    : { code: 'renderer-disabled', message: t('warning.disabled') });
  return prepared;
}

function finish(prepared: Prepared): Conversion {
  const { markdown, lines, warnings, edits, protectedLines, referenceLines, pairedReferences, figures } = prepared;
  lines.forEach((line, index) => {
    if (!protectedLines.has(index) && (/visualize\\?:/.test(line.text) || referenceLines.has(index)) && !pairedReferences.has(index)) {
      warnings.push({ code: 'unpaired-reference', message: t('warning.referenceUnpaired'), line: index + 1 });
    }
  });
  for (const source of prepared.sources) if (!prepared.pairedSources.has(source.line)) {
    warnings.push({ code: 'unpaired-source', message: t('warning.sourceUnpaired', { id: source.id }), line: source.line + 1 });
  }
  let output = markdown;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  const assets = assetReferences(output);
  if (assets.length) warnings.push({ code: 'asset-references', message: t('warning.assets') });
  return { markdown: output, warnings, figures, assets, ...(prepared.mathBlocks ? { mathBlocks: prepared.mathBlocks } : {}) };
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
    if (!value.startsWith('#') && !/^(?:data:|mailto:|visualize\\?:)/i.test(value)) urls.add(value);
  }
  return [...urls].sort();
}
