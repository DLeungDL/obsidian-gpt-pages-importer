import { createHash } from 'node:crypto';

// Authored PNG bytes with fictional source references, never a private export.
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=', 'base64');
export function asset(id = 'image-a', ref = 'library-file:fixture-image', bytes = png) {
  return { version: 1, id, source_ref: ref, filename: 'image.png', mime: 'image/png', byte_size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') };
}
export function source(p = asset(), escaped = false) {
  return `![圖片](<${p.source_ref.replace(':', escaped ? '\\:' : ':')}> "caption")\n\n\`\`\`gpt-pages-asset\n${JSON.stringify(p)}\n\`\`\`\n`;
}
