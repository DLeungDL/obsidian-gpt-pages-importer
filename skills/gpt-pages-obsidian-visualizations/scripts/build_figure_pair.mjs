import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function buildFigurePair(id, ref, bytes, version = 3) {
  if (version !== 3) {
    throw new Error('This skill generates v3 pairs only; legacy format requests are not supported.');
  }
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('Figure ID must contain only ASCII letters, digits, _ or -.');
  }
  if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(ref)) {
    throw new Error('Reference must be the native file ID without a URI prefix.');
  }
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 256 * 1024) {
    throw new Error('HTML must contain 1 to 262144 UTF-8 bytes.');
  }
  const html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (!/[\r\n]$/.test(html)) {
    throw new Error('Canonical HTML must end with a newline before creating the native visualization.');
  }
  const document = html.replace(/^\uFEFF/, '').trim();
  if (!/^<!doctype\s+html\s*>/i.test(document)
    || !/<html\b/i.test(document)
    || !/<head\b/i.test(document)
    || !/<body\b/i.test(document)
    || !/<\/html>$/i.test(document)) {
    throw new Error('Provide a complete HTML document with doctype, html, head and body.');
  }
  let longestRun = 0;
  for (const match of html.matchAll(/`+/g)) {
    longestRun = Math.max(longestRun, match[0].length);
  }
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const figureMarker = `<!-- gpt-pages:figure id=${id} -->`;
  const sourceMarker = `<!-- gpt-pages:source v=3 id=${id} ref=${ref} sha256=${sha256} -->`;
  return {
    format_version: version,
    id,
    ref,
    html_bytes: bytes.length,
    sha256,
    figure_marker: figureMarker,
    source_markdown: `${sourceMarker}\n\n${fence}html\n${html}${fence}\n`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--v3') {
      args.shift();
    }
    if (args[0]?.startsWith('--')) {
      throw new Error('This skill generates v3 pairs only. The only supported flag is --v3 (optional).');
    }
    if (args.length !== 3) {
      throw new Error('Usage: node build_figure_pair.mjs [--v3] <id> <native-file-id> <canonical.html>');
    }
    const [id, ref, htmlPath] = args;
    process.stdout.write(`${JSON.stringify(buildFigurePair(id, ref, readFileSync(htmlPath)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
