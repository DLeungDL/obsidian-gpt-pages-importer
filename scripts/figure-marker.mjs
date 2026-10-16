import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const compact = args[0] === '--v3';
if (compact) args.shift();
const [id, ref, path, ...extra] = args;
try {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !ref || !/^[A-Za-z0-9_-]{1,256}$/.test(ref) || !path || extra.length) {
    throw new Error('用法：node scripts/figure-marker.mjs [--v3] FIGURE_ID NATIVE_FILE_ID SOURCE.html');
  }
  const bytes = await readFile(path);
  const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (!bytes.length || bytes.length > 256 * 1024 || !/[\r\n]$/.test(source)) throw new Error('HTML 必須為最多 256 KiB 的 UTF-8 原文，且以換行結尾；完整貼入 fence，不另改換行。');
  if (!/^\s*<!doctype html\s*>/i.test(source) || !/<html(?:\s[^>]*)?>/i.test(source) || !/<\/html>\s*$/i.test(source)) throw new Error('必須提供有 doctype、html 與結尾 </html> 的完整文件。');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (compact) {
    console.log(`<!-- gpt-pages:figure id=${id} -->\n\n<!-- gpt-pages:source v=3 id=${id} ref=${ref} sha256=${sha256} -->`);
  } else console.log(`<!-- gpt-pages:figure v=2 id=${id} ref=${ref} sha256=${sha256} -->`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
