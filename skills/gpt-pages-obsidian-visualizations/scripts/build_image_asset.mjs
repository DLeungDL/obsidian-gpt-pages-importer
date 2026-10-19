import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildImageAsset(id, reference, bytes, filename = 'image.png') {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id ?? '') || !/^(?:library-file|project-file):[A-Za-z0-9_-]{1,512}$/.test(reference ?? '')) {
    throw new Error('Provide a short unique ID and the exact tool-returned native image reference.');
  }
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 1024 * 1024) throw new Error('Image limit is 1 MiB.');
  const b = Buffer.from(bytes);
  let mime, ext;
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.toString('ascii', 12, 16) === 'IHDR') [mime, ext] = ['image/png', 'png'];
  else if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b.at(-2) === 255 && b.at(-1) === 217) [mime, ext] = ['image/jpeg', 'jpg'];
  else if (b.length >= 13 && ['GIF87a', 'GIF89a'].includes(b.toString('ascii', 0, 6))) [mime, ext] = ['image/gif', 'gif'];
  else if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') [mime, ext] = ['image/webp', 'webp'];
  else throw new Error('Only PNG, JPEG, GIF and WebP signatures are supported.');
  const name = basename(filename).replace(/[^A-Za-z0-9_.-]/g, '-').replace(/^[^A-Za-z0-9_-]+/, '').slice(0, 100) || `image.${ext}`;
  const payload = { version: 1, id, source_ref: reference, filename: name, mime, byte_size: b.length,
    sha256: createHash('sha256').update(b).digest('hex'), base64: b.toString('base64') };
  return { ...payload, source_markdown: `\`\`\`gpt-pages-asset\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [id, reference, file, ...extra] = process.argv.slice(2);
    if (!file || extra.length) throw new Error('Usage: node build_image_asset.mjs <id> <native-reference> <image-file>');
    process.stdout.write(JSON.stringify(buildImageAsset(id, reference, readFileSync(file), basename(file)), null, 2) + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
