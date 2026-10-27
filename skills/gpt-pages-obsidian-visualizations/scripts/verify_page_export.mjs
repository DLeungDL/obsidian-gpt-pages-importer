import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fromMarkdown } from 'mdast-util-from-markdown';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const key = url => url.replace(/^((?:library-file|project-file):[A-Za-z0-9_-]{1,512})#display=full$/, '$1');
const mimeExtension = (b, mime) => {
  if (mime === 'image/png' && b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii', 12, 16) === 'IHDR') return 'png';
  if (mime === 'image/jpeg' && b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b.at(-2) === 255 && b.at(-1) === 217) return 'jpg';
  if (mime === 'image/gif' && b.length >= 13 && /GIF8[79]a/.test(b.toString('ascii', 0, 6))) return 'gif';
  if (mime === 'image/webp' && b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
};
function decode(base64, mime) {
  if (typeof base64 !== 'string' || base64.length > 4 * Math.ceil(1048576 / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw Error('Invalid/oversized Base64');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 1048576 || bytes.toString('base64') !== base64 || !mimeExtension(bytes, mime)) throw Error('Invalid image bytes/MIME');
  return bytes;
}

/** Checks the complete native inventory, not merely markers already known to the caller. */
export function verifyPageExport(input) {
  const text = input.replace(/^\uFEFF/, '');
  const tree = fromMarkdown(text);
  const nodes = tree.children;
  const issues = [], figures = [], sources = [], images = [], assets = [], html = [];
  const fail = message => issues.push(message);
  const raw = node => text.slice(node.position.start.offset, node.position.end.offset);
  const definitions = new Map();
  for (const node of nodes.filter(n => n.type === 'definition')) {
    if (definitions.has(node.identifier)) fail(`Duplicate definition: ${node.identifier}`);
    else definitions.set(node.identifier, node);
  }
  const markerText = node => node.type === 'html' ? node.value : node.type === 'paragraph'
    && node.children.every(n => n.type === 'text') ? node.children.map(n => n.value).join('') : '';
  const fenceBytes = node => {
    if (node.meta) throw Error('Source fence metadata is unsupported');
    const value = raw(node);
    const opener = /^(?<fence>`{3,}|~{3,})[^\r\n]*\r?\n/.exec(value);
    if (!opener) throw Error('Unsupported/indented source fence');
    const close = new RegExp(`(?:^|\n)${opener.groups.fence[0]}{${opener.groups.fence.length},}[ \\t]*$`).exec(value);
    if (!close) throw Error('Unclosed source fence');
    return Buffer.from(value.slice(opener[0].length, close.index + (value[close.index] === '\n' ? 1 : 0)), 'utf8');
  };
  const walk = (node, top) => {
    if (node.type === 'image' || node.type === 'imageReference') {
      const url = node.type === 'image' ? node.url : definitions.get(node.identifier)?.url;
      if (url) images.push({ url: key(url), top, standalone: top.type === 'paragraph' && top.children.length === 1 && top.children[0] === node });
    }
    if (node.children) for (const child of node.children) walk(child, top);
  };
  for (const [index, node] of nodes.entries()) {
    walk(node, node);
    const marker = markerText(node).trim();
    if (marker.includes('gpt-pages:figure')) {
      const m = /^<!-- gpt-pages:figure id=([A-Za-z0-9_-]+) -->$/.exec(marker);
      if (!m) fail('Invalid/non-v3 figure marker');
      else figures.push({ id: m[1], next: nodes[index + 1] });
    }
    if (marker.includes('gpt-pages:source')) {
      const m = /^<!-- gpt-pages:source v=3 id=([A-Za-z0-9_-]+) ref=([A-Za-z0-9_-]{1,256}) sha256=([a-f0-9]{64}) -->$/.exec(marker);
      if (!m) fail('Invalid/non-v3 source marker');
      else sources.push({ id: m[1], ref: m[2], sha256: m[3], next: nodes[index + 1] });
    }
    if (node.type === 'code' && ['html', 'html-source'].includes(node.lang)) html.push(node);
    if (node.type === 'code' && node.lang === 'gpt-pages-asset') {
      try {
        fenceBytes(node);
        const p = JSON.parse(node.value);
        const bytes = decode(p.base64, p.mime);
        if (p.version !== 1 || !/^[A-Za-z0-9_-]{1,64}$/.test(p.id ?? '') || !/^(?:library-file|project-file):[A-Za-z0-9_-]{1,512}$/.test(p.source_ref ?? '')
          || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/.test(p.filename ?? '') || p.byte_size !== bytes.length || p.sha256 !== hash(bytes)) throw Error('Invalid asset metadata/hash');
        assets.push(p);
      } catch (error) { fail(`Asset: ${error.message}`); }
    }
  }
  const pairedImages = new Set(), pairedHtml = new Set();
  const inventory = [];
  for (const figure of figures) {
    const matching = sources.filter(s => s.id === figure.id);
    if (figures.filter(f => f.id === figure.id).length !== 1 || matching.length !== 1) { fail(`Missing/duplicate pair: ${figure.id}`); continue; }
    const source = matching[0];
    const native = images.filter(i => i.top === figure.next && i.standalone && i.url === `visualize:${source.ref}`);
    if (native.length !== 1 || images.filter(i => i.url === `visualize:${source.ref}`).length !== 1 || sources.filter(s => s.ref === source.ref).length !== 1) fail(`Native reference mismatch: ${figure.id}`);
    else pairedImages.add(native[0]);
    if (!html.includes(source.next) || pairedHtml.has(source.next)) { fail(`Missing/duplicate HTML: ${figure.id}`); continue; }
    pairedHtml.add(source.next);
    try {
      const bytes = fenceBytes(source.next);
      const document = bytes.toString('utf8').replace(/^\uFEFF/, '').trim();
      if (!bytes.length || bytes.length > 262144 || !/^<!doctype\s+html\s*>/i.test(document) || !/<html\b/i.test(document) || !/<head\b/i.test(document) || !/<body\b/i.test(document) || !/<\/html>$/i.test(document) || hash(bytes) !== source.sha256) throw Error('HTML document/size/SHA-256 mismatch');
      inventory.push({ id: figure.id, ref: source.ref, sha256: source.sha256 });
    } catch (error) { fail(`${figure.id}: ${error.message}`); }
  }
  for (const source of sources) if (!figures.some(f => f.id === source.id)) fail(`Orphan source: ${source.id}`);
  for (const image of images) if (image.url.startsWith('visualize:') && !pairedImages.has(image)) fail(`Unpaired native visualization: ${image.url}`);
  for (const node of html) if (!pairedHtml.has(node)) fail('Unpaired HTML source');
  const imageInventory = [];
  let imageBytes = 0;
  const usedAssets = new Set();
  for (const image of images.filter(i => /^(?:data:|library-file:|project-file:)/i.test(i.url))) {
    try {
      if (!image.standalone || images.filter(i => i.url === image.url).length !== 1) throw Error('Nested/duplicate image binding');
      let candidates, digest, byteSize;
      if (/^data:/i.test(image.url)) {
        const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/.exec(image.url);
        if (!m) throw Error('Unsupported data URI');
        const bytes = decode(m[2], m[1]); digest = hash(bytes); byteSize = bytes.length;
        candidates = assets.filter(p => p.sha256 === digest && p.mime === m[1] && p.byte_size === bytes.length);
      } else candidates = assets.filter(p => p.source_ref === image.url);
      if (assets.length === 0 && digest) { imageInventory.push({ sha256: digest }); imageBytes += byteSize; }
      else {
        if (candidates.length !== 1 || usedAssets.has(candidates[0])) throw Error('Missing/ambiguous image payload');
        const p = candidates[0]; usedAssets.add(p);
        imageBytes += p.byte_size;
        imageInventory.push({ id: p.id, ref: p.source_ref, sha256: p.sha256 });
      }
    } catch (error) { fail(`Image: ${error.message}`); }
  }
  for (const p of assets) {
    if (!usedAssets.has(p)) fail(`Orphan image payload: ${p.id}`);
    if (assets.filter(a => a.id === p.id || a.source_ref === p.source_ref).length !== 1) fail(`Duplicate image payload: ${p.id}`);
  }
  if (imageInventory.length > 32 || assets.length > 32) fail('Image count budget exceeded');
  if (imageBytes > 4194304) fail('Image byte budget exceeded');
  return { valid: issues.length === 0, figures: inventory.sort((a,b) => a.id.localeCompare(b.id)), images: imageInventory.sort((a,b) => (a.id ?? a.sha256).localeCompare(b.id ?? b.sha256)), issues, runtime_tested: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [file, flag, expected, ...rest] = process.argv.slice(2);
    if (!file || rest.length || (flag && (flag !== '--expected' || !expected))) throw Error('Usage: node verify_page_export.mjs downloaded.md [--expected page-readback.md]');
    const read = path => new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
    const result = verifyPageExport(read(file));
    if (expected) {
      const prior = verifyPageExport(read(expected));
      if (!prior.valid || JSON.stringify([prior.figures, prior.images]) !== JSON.stringify([result.figures, result.images])) {
        result.valid = false; result.issues.push('Page/export inventory mismatch or invalid expected Page');
      }
    }
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
