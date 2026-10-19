import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { parse, postprocess, preprocess } from 'micromark';

const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

function pageTarget(url) {
  if (!/^page:/i.test(url)) return null;
  const match = /^page:(?:\/\/)?(page_[A-Za-z0-9_-]+)$/i.exec(url);
  return { pageId: match?.[1], url };
}

function inspect(source) {
  // Remove BOMs only from the parser view, retaining original source offsets.
  const base = source.match(/^\uFEFF+/)?.[0].length ?? 0;
  const markdown = source.slice(base);
  const tree = fromMarkdown(markdown);
  const destinations = new Map();
  const stack = [];
  for (const [event, token] of postprocess(parse().document().write(preprocess()(markdown, 'utf8', true)))) {
    if (['link', 'image', 'definition', 'autolink'].includes(token.type)) {
      if (event === 'enter') stack.push({});
      else {
        const frame = stack.pop();
        if (frame.destination && token.type !== 'image') destinations.set(token.start.offset, frame.destination);
      }
    } else if (event === 'enter' && ['resourceDestinationString', 'definitionDestinationString', 'autolinkProtocol'].includes(token.type)) {
      // Keep an image's destination separate from the link containing that image.
      stack.at(-1).destination = { start: token.start.offset + base, end: token.end.offset + base, type: token.type };
    }
  }
  const definitions = new Map();
  const imageReferences = new Set();
  const links = [];
  let rawHtmlDocument;
  function walk(node) {
    if (node.type === 'html' && /^\s*<(?:!doctype\s+html\b|html(?:\s|>))/i.test(node.value)) {
      rawHtmlDocument ??= node.position.start.offset;
    }
    if (node.type === 'definition') {
      const matches = definitions.get(node.identifier) ?? [];
      matches.push(node);
      definitions.set(node.identifier, matches);
    }
    if (node.type === 'imageReference') imageReferences.add(node.identifier);
    if (node.type === 'link' || node.type === 'linkReference') links.push(node);
    for (const child of node.children ?? []) walk(child);
  }
  walk(tree);
  const references = [];
  for (const link of links) {
    const matches = link.type === 'linkReference' ? definitions.get(link.identifier) : [link];
    const node = matches?.[0];
    if (!node) continue;
    const target = pageTarget(node.url);
    if (!target) continue;
    const destination = destinations.get(node.position.start.offset);
    let reason;
    // Blank lines can end CommonMark HTML blocks inside an unfenced HTML document.
    // Do not guess which later Markdown-looking text belongs to that source.
    if (rawHtmlDocument !== undefined && (link.position.start.offset >= rawHtmlDocument || node.position.start.offset >= rawHtmlDocument)) reason = 'raw-html-document';
    else if (!target.pageId) reason = 'unsupported-page-uri';
    else if (matches.length !== 1) reason = 'ambiguous-definition';
    else if (link.type === 'linkReference' && imageReferences.has(link.identifier)) reason = 'definition-used-by-image';
    else if (!destination) reason = 'destination-not-located';
    references.push({ ...target, line: link.position.start.line, destination, reason });
  }
  return references;
}

function confirmedUrl(pageId, receipts) {
  let receipt;
  try { receipt = Object.hasOwn(receipts, pageId) ? receipts[pageId] : undefined; }
  catch { return { reason: 'read-failed' }; }
  if (!receipt) return { reason: 'not-resolved' };
  if (receipt.error) return { reason: 'read-failed' };
  if (receipt.metadata?.page_id !== pageId || (receipt.content?.page_id && receipt.content.page_id !== pageId)) {
    return { reason: 'page-id-mismatch' };
  }
  const url = receipt.metadata.url;
  if (typeof url !== 'string' || !url) return { reason: 'missing-url' };
  try {
    const parsed = new URL(url);
    if (!/^https:\/\//i.test(url) || parsed.protocol !== 'https:' || !parsed.hostname ||
      parsed.username || parsed.password || /[\s\\<>\u0000-\u001f\u007f]/u.test(url)) return { reason: 'invalid-https-url' };
  } catch { return { reason: 'invalid-https-url' }; }
  return { url };
}

/** Plan destination-only edits from confirmed Pages read_page structuredContent receipts. No network access. */
export function planPageLinks(source, receipts = {}) {
  if (!receipts || typeof receipts !== 'object' || Array.isArray(receipts)) throw new Error('Receipts must be an object keyed by requested Page ID.');
  const references = inspect(source);
  const targets = new Map();
  const resolutions = new Map();
  const edits = new Map();
  const unresolved = [];
  for (const reference of references) {
    const { pageId, destination, line } = reference;
    let reason = reference.reason;
    if (!reason) {
      const target = targets.get(pageId) ?? { pageId, occurrences: 0 };
      target.occurrences++;
      targets.set(pageId, target);
      if (!resolutions.has(pageId)) resolutions.set(pageId, confirmedUrl(pageId, receipts));
      const resolution = resolutions.get(pageId);
      reason = resolution.reason;
      if (!reason) {
        // Escaping is Markdown syntax only: the parsed target remains the exact returned URL.
        const newText = destination.type === 'autolinkProtocol' ? resolution.url : resolution.url.replace(/[\\()[\]<>&]/g, '\\$&');
        edits.set(destination.start, { start: destination.start, end: destination.end, oldText: source.slice(destination.start, destination.end), newText });
      }
    }
    if (reason) unresolved.push({ pageId: pageId ?? null, url: reference.url, line, reason });
  }
  return { sourceSha256: sha256(source), targets: [...targets.values()], edits: [...edits.values()].sort((a, b) => a.start - b.start), unresolved };
}

/** Apply only a fresh plan with matching original spans, preserving every other source byte. */
export function applyPageLinkPlan(source, plan) {
  if (sha256(source) !== plan.sourceSha256) throw new Error('Source changed; rescan before applying link edits.');
  const edits = [...plan.edits].sort((a, b) => a.start - b.start);
  let previous = 0;
  for (const edit of edits) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < previous || edit.end <= edit.start ||
      edit.end > source.length || source.slice(edit.start, edit.end) !== edit.oldText || typeof edit.newText !== 'string') {
      throw new Error('Overlapping or stale link edit; rescan the source.');
    }
    previous = edit.end;
  }
  let result = source;
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.newText + result.slice(edit.end);
  return result;
}

async function readUtf8(path) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(path));
}

async function main(args) {
  const [mode, input, receiptsPath, option, output] = args;
  if (!input || !((mode === 'scan' && args.length === 2) ||
    (mode === 'rewrite' && receiptsPath && (args.length === 3 || (args.length === 5 && option === '--out' && output))))) {
    throw new Error('Usage: page_links.mjs scan INPUT.md | rewrite INPUT.md RECEIPTS.json [--out NEW.md]');
  }
  const source = await readUtf8(input);
  const plan = planPageLinks(source, mode === 'scan' ? {} : JSON.parse(await readUtf8(receiptsPath)));
  if (output) await writeFile(output, applyPageLinkPlan(source, plan), { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  if (mode === 'rewrite' && plan.unresolved.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
