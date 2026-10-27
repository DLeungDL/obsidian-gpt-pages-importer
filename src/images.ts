import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';
import { assetReferences, type Conversion, type Warning } from './convert';
import { digestBytes } from './hash';
import { t } from './i18n';

export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 4 * MAX_IMAGE_BYTES;
export const MAX_IMAGES = 32;
export interface PortableImage { path: string; bytes: Uint8Array<ArrayBuffer>; sha256: string }
export interface ImageStorage {
  readBinary?(path: string): Promise<ArrayBuffer | null>;
  createBinary?(path: string, bytes: ArrayBuffer): Promise<void>;
}
interface Payload {
  version: number; id: string; source_ref: string; filename: string;
  mime: string; byte_size: number; sha256: string; base64: string;
}
interface Span { start: number; end: number }

// Only Pages' known presentation fragment is ignorable, never arbitrary URL fragments.
function imageKey(url: string): string {
  return url.replace(/^((?:library-file|project-file):[A-Za-z0-9_-]{1,512})#display=full$/, '$1');
}

/** Signature/MIME check only; decoding or rendering the image is left to Obsidian. */
function extension(bytes: Uint8Array, mime: string): string | undefined {
  const starts = (...prefix: number[]) => prefix.every((byte, i) => bytes[i] === byte);
  if (mime === 'image/png' && bytes.length >= 24 && starts(137, 80, 78, 71, 13, 10, 26, 10)
    && bytes.slice(12, 16).every((b, i) => b === [73, 72, 68, 82][i])) return 'png';
  if (mime === 'image/jpeg' && bytes.length >= 4 && starts(255, 216, 255) && bytes.at(-2) === 255 && bytes.at(-1) === 217) return 'jpg';
  if (mime === 'image/gif' && bytes.length >= 13 && (starts(71, 73, 70, 56, 55, 97) || starts(71, 73, 70, 56, 57, 97))) return 'gif';
  if (mime === 'image/webp' && bytes.length >= 16 && starts(82, 73, 70, 70)
    && bytes.slice(8, 12).every((b, i) => b === [87, 69, 66, 80][i])) return 'webp';
}

/** Plan only. No source is removed from disk until commit has verified the binary writes. */
export async function prepareImages(conversion: Conversion, destination: string): Promise<Conversion> {
  const markdown = conversion.markdown;
  const tree = fromMarkdown(markdown);
  const bom = markdown.startsWith('\uFEFF') ? 1 : 0;
  const span = (node: { position?: { start: { offset?: number }; end: { offset?: number } } }): Span => ({
    start: node.position!.start.offset! + bom, end: node.position!.end.offset! + bom
  });
  const sources: { payload: Partial<Payload>; span: Span; line: number; validFence: boolean }[] = [];
  const images = new Map<string, (Span & { identifier?: string; title?: string | null })[]>();
  const imageCounts = new Map<string, number>();
  const definitionNodes = tree.children.filter(node => node.type === 'definition');
  const definitions = new Map(definitionNodes.map(node => [node.identifier, node]));
  const duplicateDefinitions = new Set(definitionNodes.filter(node => definitionNodes.filter(other => other.identifier === node.identifier).length > 1).map(node => node.identifier));
  const referenceCounts = new Map<string, number>();
  const countImages = (nodes: RootContent[]): void => {
    for (const node of nodes) {
      if (node.type === 'image') imageCounts.set(imageKey(node.url), (imageCounts.get(imageKey(node.url)) ?? 0) + 1);
      if (node.type === 'imageReference' || node.type === 'linkReference') referenceCounts.set(node.identifier, (referenceCounts.get(node.identifier) ?? 0) + 1);
      if (node.type === 'imageReference') {
        const url = definitions.get(node.identifier)?.url;
        if (url) imageCounts.set(imageKey(url), (imageCounts.get(imageKey(url)) ?? 0) + 1);
      }
      if ('children' in node) countImages(node.children);
    }
  };
  countImages(tree.children);
  const warnings: Warning[] = [];
  for (const node of tree.children) {
    if (node.type === 'paragraph' && node.children.length === 1 && (node.children[0]!.type === 'image' || node.children[0]!.type === 'imageReference')) {
      const image = node.children[0];
      if (image.type === 'imageReference' && duplicateDefinitions.has(image.identifier)) continue;
      const definition = image.type === 'imageReference' ? definitions.get(image.identifier) : undefined;
      const url = image.type === 'image' ? image.url : definition?.url;
      if (url) {
        const key = imageKey(url);
        const matches = images.get(key) ?? [];
        matches.push({ ...span(image), identifier: image.type === 'imageReference' ? image.identifier : undefined, title: definition?.title }); images.set(key, matches);
      }
    }
    if (node.type !== 'code' || node.lang !== 'gpt-pages-asset') continue;
    const location = span(node);
    const raw = markdown.slice(location.start, location.end);
    const opener = raw.match(/^ {0,3}(`{3,}|~{3,})gpt-pages-asset[ \t]*\r?\n/);
    const validFence = !!opener && new RegExp(`(?:\r?\n) {0,3}${opener[1]![0]}{${opener[1]!.length},}[ \\t]*$`).test(raw);
    let payload: Partial<Payload> = {};
    try {
      const parsed: unknown = JSON.parse(node.value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
    } catch { /* Report malformed payloads without executing or discarding them. */ }
    sources.push({ payload, span: location, line: node.position!.start.line, validFence });
  }
  const edits: (Span & { text: string })[] = [];
  const portableImages: PortableImage[] = [];
  const consumedDefinitions = new Map<string, number>();
  let total = 0;
  const restore = (url: string, bytes: Uint8Array<ArrayBuffer>, sha256: string, ext: string): boolean => {
    const image = images.get(url)?.[0];
    if (!image || images.get(url)?.length !== 1 || imageCounts.get(url) !== 1 || portableImages.length >= MAX_IMAGES
      || total + bytes.length > MAX_TOTAL_IMAGE_BYTES) return false;
    const name = `${sha256}.${ext}`;
    const original = markdown.slice(image.start, image.end);
    let rewritten: string;
    if (image.identifier) {
      const alt = original.match(/^!\[((?:\\.|[^\]\\])*)\]/)?.[1];
      if (alt === undefined) return false;
      const title = image.title == null ? '' : ` "${image.title.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', ' ')}"`;
      rewritten = `![${alt}](GPT%20Pages%20Assets/${name}${title})`;
      consumedDefinitions.set(image.identifier, (consumedDefinitions.get(image.identifier) ?? 0) + 1);
    } else {
      if (!/^!\[(?:\\.|[^\]\\])*\]\(\s*(?:<[^>]*>|[^\s)]+)(?:\s+[\s\S]*)?\)$/.test(original)) return false;
      rewritten = original.replace(/(^!\[(?:\\.|[^\]\\])*\]\(\s*)(?:<[^>]*>|[^\s)]+)/, `$1GPT%20Pages%20Assets/${name}`);
    }
    total += bytes.length;
    const folder = destination.includes('/') ? destination.slice(0, destination.lastIndexOf('/') + 1) : '';
    portableImages.push({ path: `${folder}GPT Pages Assets/${name}`, bytes, sha256 });
    edits.push({ ...image, text: rewritten });
    return true;
  };
  // Decode data images once, with the same MIME/signature and allocation limits as assets.
  const dataImages = new Map<string, { bytes: Uint8Array<ArrayBuffer>; sha256: string; ext: string; mime: string }>();
  let decodedTotal = 0;
  const dataCount = [...images.keys()].filter(url => /^data:/i.test(url)).length;
  for (const url of images.keys()) {
    if (!/^data:/i.test(url)) continue;
    const warn = () => warnings.push({ code: 'invalid-image-asset', line: markdown.slice(0, images.get(url)![0]!.start).split('\n').length, message: t('image.invalid') });
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(url);
    if (dataCount > MAX_IMAGES || !match || match[2]!.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3)) { warn(); continue; }
    try {
      const binary = atob(match[2]!);
      if (btoa(binary) !== match[2]) { warn(); continue; }
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const ext = extension(bytes, match[1]!);
      if (!ext || !bytes.length || bytes.length > MAX_IMAGE_BYTES) { warn(); continue; }
      if (decodedTotal + bytes.length > MAX_TOTAL_IMAGE_BYTES) { warn(); continue; }
      decodedTotal += bytes.length;
      dataImages.set(url, { bytes, ext, mime: match[1]!, sha256: await digestBytes(bytes) });
    } catch { warn(); }
  }
  const consumedData = new Set<string>();
  for (const source of sources) {
    const p = source.payload;
    const warn = () => warnings.push({ code: 'invalid-image-asset', line: source.line, message: t('image.invalid') });
    if (sources.length > MAX_IMAGES || !source.validFence || p.version !== 1 || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(p.id)
      || typeof p.source_ref !== 'string' || !/^(?:library-file|project-file):[A-Za-z0-9_-]{1,512}$/.test(p.source_ref)
      || typeof p.filename !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/.test(p.filename)
      || typeof p.mime !== 'string' || typeof p.byte_size !== 'number' || !Number.isInteger(p.byte_size)
      || p.byte_size < 1 || p.byte_size > MAX_IMAGE_BYTES || typeof p.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sha256)
      || typeof p.base64 !== 'string' || p.base64.length !== 4 * Math.ceil(p.byte_size / 3)
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.base64)
      || sources.filter(s => s.payload.id === p.id).length !== 1
      || sources.filter(s => s.payload.source_ref === p.source_ref).length !== 1) { warn(); continue; }
    try {
      const binary = atob(p.base64);
      // Round-trip encoding rejects noncanonical padding bits.
      if (btoa(binary) !== p.base64) { warn(); continue; }
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const ext = extension(bytes, p.mime);
      if (bytes.length !== p.byte_size || !ext || await digestBytes(bytes) !== p.sha256) { warn(); continue; }
      const candidates = [...dataImages].filter(([, data]) => data.sha256 === p.sha256 && data.mime === p.mime && data.bytes.length === p.byte_size);
      const url = images.has(p.source_ref) ? p.source_ref : candidates.length === 1
        && sources.filter(s => s.payload.sha256 === p.sha256).length === 1 ? candidates[0]![0] : undefined;
      if (!url || consumedData.has(url) || !restore(url, bytes, p.sha256, ext)) { warn(); continue; }
      consumedData.add(url);
      edits.push({ ...source.span, text: '' });
    } catch { warn(); }
  }
  for (const [url, data] of dataImages) {
    if (consumedData.has(url)) continue;
    // A payload-bearing export must establish a unique, verified binding first.
    if (sources.length || !restore(url, data.bytes, data.sha256, data.ext)) {
      warnings.push({ code: 'invalid-image-asset', line: markdown.slice(0, images.get(url)![0]!.start).split('\n').length, message: t('image.invalid') });
    }
  }
  for (const [identifier, count] of consumedDefinitions) {
    if (referenceCounts.get(identifier) === count) edits.push({ ...span(definitions.get(identifier)!), text: '' });
  }
  let output = markdown;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return { ...conversion, markdown: output, warnings: [...conversion.warnings, ...warnings], assets: assetReferences(output), images: portableImages };
}

/** Create-only, content-addressed assets. Never overwrite files, including races. */
export async function writeImages(storage: ImageStorage, images: PortableImage[], allowed: () => boolean = () => true): Promise<void> {
  if (!images.length) return;
  const read = storage.readBinary?.bind(storage);
  const create = storage.createBinary?.bind(storage);
  if (!read || !create) throw new Error(t('image.storageUnavailable'));
  for (const image of images) {
    if (!allowed()) throw new Error(t('storage.settingsChanged'));
    let bytes = await read(image.path);
    if (bytes === null) {
      try { await create(image.path, image.bytes.buffer); }
      catch (error) {
        // Another importer can win the create race; reuse only exact bytes.
        bytes = await read(image.path);
        if (bytes === null) throw error;
      }
      bytes = await read(image.path);
    }
    if (bytes === null || bytes.byteLength !== image.bytes.length || await digestBytes(new Uint8Array(bytes)) !== image.sha256) {
      throw new Error(t('image.conflict', { path: image.path }));
    }
  }
}
