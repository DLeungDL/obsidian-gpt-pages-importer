import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { convertVerified } from '../src/convert.ts';
import { applyPageLinkPlan, planPageLinks } from '../skills/gpt-pages-obsidian-visualizations/scripts/page_links.mjs';

const alpha = 'https://example.invalid/pages/alpha';
const beta = 'https://example.invalid/pages/beta';
const receipt = (pageId, url) => ({ metadata: { page_id: pageId, url } });
const receipts = { page_ALPHA: receipt('page_ALPHA', alpha), page_BETA: receipt('page_BETA', beta) };
const rewrite = (source, resolutions = receipts) => applyPageLinkPlan(source, planPageLinks(source, resolutions));

describe('cross-Page link preflight', () => {
  it('supports both Page URI forms, Markdown escapes, entities and repeated targets without changing labels or titles', () => {
    const source = String.raw`[Page](page:page_ALPHA "keep title")
[自訂 **標籤**](page\:page_ALPHA)
[Other](page://page_BETA)
[Escaped slashes](page\:\/\/page_ALPHA)
[Entity](page&#58;page_ALPHA)
`;
    const expected = `[Page](${alpha} "keep title")\n[自訂 **標籤**](${alpha})\n[Other](${beta})\n[Escaped slashes](${alpha})\n[Entity](${alpha})\n`;
    const plan = planPageLinks(source, receipts);
    expect(plan.targets).toEqual([{ pageId: 'page_ALPHA', occurrences: 4 }, { pageId: 'page_BETA', occurrences: 1 }]);
    expect(plan.unresolved).toEqual([]);
    expect(plan.edits).toHaveLength(5);
    expect(applyPageLinkPlan(source, plan)).toBe(expected);
    expect(plan.edits.every(edit => !edit.oldText.includes('['))).toBe(true);
  });

  it('changes a shared destination once for full, collapsed and shortcut reference links', () => {
    const source = '[Custom][Chapter] and [Page][] and [Page].\n\n[chapter]: <page\\:page_ALPHA> \'Keep reference title\'\n[Page]: page://page_ALPHA\n';
    const expected = `[Custom][Chapter] and [Page][] and [Page].\n\n[chapter]: <${alpha}> 'Keep reference title'\n[Page]: ${alpha}\n`;
    const plan = planPageLinks(source, receipts);
    expect(plan.targets).toEqual([{ pageId: 'page_ALPHA', occurrences: 3 }]);
    expect(plan.edits).toHaveLength(2);
    expect(applyPageLinkPlan(source, plan)).toBe(expected);
  });

  it('changes only the outer destination of a link containing an image and handles autolinks', () => {
    const source = '[![Cover](page:page_IMAGE)](page:page_ALPHA) <page://page_BETA>';
    expect(rewrite(source)).toBe(`[![Cover](page:page_IMAGE)](${alpha}) <${beta}>`);
  });

  it('keeps list and blockquote layout while updating nested link destinations', () => {
    const source = '> 1. [Quoted](page\\:page_ALPHA "Keep")\r\n>    - [Nested](<page://page_BETA>)\r\n';
    expect(rewrite(source)).toBe(`> 1. [Quoted](${alpha} "Keep")\r\n>    - [Nested](<${beta}>)\r\n`);
  });

  it('preserves inline/fenced/indented code, raw HTML, images, literal text, unused definitions and existing HTTPS', () => {
    const source = [
      '`[Inline](page:page_ALPHA)`',
      '```html\n<!doctype html>\n<html>\n\n[In HTML source](page:page_ALPHA)\n<script>throw new Error("must not execute");</script>\n</html>\n```',
      '    [Indented code](page:page_ALPHA)',
      '<div>\n<a href="page:page_ALPHA">Link</a>\n[In raw HTML](page:page_ALPHA)\n</div>',
      '<!-- [Comment](page:page_ALPHA) -->',
      '![Image](page:page_ALPHA)',
      'Text page:page_ALPHA, \\alpha, C:\\path\\file',
      '[unused]: page:page_ALPHA',
      `[Already HTTPS](${alpha} "Title")`
    ].join('\n\n');
    const plan = planPageLinks(source, receipts);
    expect(plan.targets).toEqual([]);
    expect(plan.edits).toEqual([]);
    expect(plan.unresolved).toEqual([]);
    expect(applyPageLinkPlan(source, plan)).toBe(source);
  });

  it('preserves BOMs, emoji, CRLF, tabs, multi-line destinations and Markdown title syntax', () => {
    const source = '\uFEFF\uFEFF中文 📚\r\n\r\n[My \\[label\\]](\r\n\t<page\\:page_ALPHA>\r\n\t"Keep title"\r\n)\r\n';
    const expected = `\uFEFF\uFEFF中文 📚\r\n\r\n[My \\[label\\]](\r\n\t<${alpha}>\r\n\t"Keep title"\r\n)\r\n`;
    expect(Buffer.from(rewrite(source))).toEqual(Buffer.from(expected));
  });

  it('preserves Markdown-looking content after an unfenced HTML document starts and reports the ambiguity', () => {
    const source = '[Before](page:page_ALPHA)\n\n<!doctype html>\n<html>\n<body>\n\n[HTML data](page:page_BETA)\n\n</body>\n</html>\n\n[Ambiguous later text](page://page_BETA)\n';
    const plan = planPageLinks(source, receipts);
    expect(plan.targets).toEqual([{ pageId: 'page_ALPHA', occurrences: 1 }]);
    expect(plan.unresolved.map(item => item.reason)).toEqual(['raw-html-document', 'raw-html-document']);
    expect(applyPageLinkPlan(source, plan)).toBe(`[Before](${alpha})` + source.slice('[Before](page:page_ALPHA)'.length));
  });

  it('still updates body links after a properly fenced HTML source', () => {
    const source = '```html\n<html>\n\n[Source](page:page_BETA)\n\n</html>\n```\n\n[Body](page:page_ALPHA)';
    const expected = '```html\n<html>\n\n[Source](page:page_BETA)\n\n</html>\n```\n\n' + `[Body](${alpha})`;
    expect(rewrite(source)).toBe(expected);
  });

  it('uses each receipt only once for repeated targets and leaves a second run unchanged', () => {
    let reads = 0;
    const resolutions = { get page_ALPHA() { reads++; return receipt('page_ALPHA', alpha); } };
    const source = '[One](page:page_ALPHA) [Two](page://page_ALPHA)';
    const result = rewrite(source, resolutions);
    expect(reads).toBe(1);
    const next = planPageLinks(result, resolutions);
    expect(next.targets).toEqual([]);
    expect(next.edits).toEqual([]);
    expect(applyPageLinkPlan(result, next)).toBe(result);
    expect(reads).toBe(1);
  });

  it.each([
    [undefined, 'not-resolved'],
    [{ error: { code: 'permission_denied' } }, 'read-failed'],
    [receipt('page_OTHER', alpha), 'page-id-mismatch'],
    [{ ...receipt('page_ALPHA', alpha), content: { page_id: 'page_OTHER' } }, 'page-id-mismatch'],
    [{ metadata: { page_id: 'page_ALPHA' } }, 'missing-url'],
    [receipt('page_ALPHA', 'http://example.invalid/page'), 'invalid-https-url'],
    [receipt('page_ALPHA', 'javascript:alert(1)'), 'invalid-https-url'],
    [receipt('page_ALPHA', 'https://user:password@example.invalid/page'), 'invalid-https-url'],
    [receipt('page_ALPHA', 'https://example.invalid/line\nbreak'), 'invalid-https-url'],
    [receipt('page_ALPHA', 'https://example.invalid/has space'), 'invalid-https-url'],
    [receipt('page_ALPHA', 'https://example.invalid/<tag>'), 'invalid-https-url']
  ])('preserves unresolved links when a receipt is unusable (case %#)', (resolution, reason) => {
    const source = '[Keep my label](page\\:page_ALPHA)';
    const plan = planPageLinks(source, { page_ALPHA: resolution });
    expect(plan.edits).toEqual([]);
    expect(plan.unresolved).toEqual([{ pageId: 'page_ALPHA', url: 'page:page_ALPHA', line: 1, reason }]);
    expect(applyPageLinkPlan(source, plan)).toBe(source);
  });

  it('keeps unresolved links while fixing independent confirmed links', () => {
    const source = '[Ready](page:page_ALPHA)\n[Unknown](page://page_BETA)';
    const plan = planPageLinks(source, { page_ALPHA: receipts.page_ALPHA });
    expect(applyPageLinkPlan(source, plan)).toBe(`[Ready](${alpha})\n[Unknown](page://page_BETA)`);
    expect(plan.unresolved).toEqual([{ pageId: 'page_BETA', url: 'page://page_BETA', line: 2, reason: 'not-resolved' }]);
  });

  it('reports a failed lookup without losing the original destination', () => {
    const source = '[Read](page:page_ALPHA)';
    const plan = planPageLinks(source, { get page_ALPHA() { throw new Error('Tool unavailable'); } });
    expect(plan.unresolved[0].reason).toBe('read-failed');
    expect(applyPageLinkPlan(source, plan)).toBe(source);
  });

  it.each(['page:///page_ALPHA', 'page:page_ALPHA#section', 'page://page_ALPHA?mode=read', 'page:missing-prefix'])('reports unsupported URI %s without guessing a target', url => {
    const source = `[Keep](${url})`;
    const plan = planPageLinks(source, receipts);
    expect(plan.unresolved[0].reason).toBe('unsupported-page-uri');
    expect(plan.targets).toEqual([]);
    expect(applyPageLinkPlan(source, plan)).toBe(source);
  });

  it.each([
    ['[Read][shared]\n\n![Image][shared]\n\n[shared]: page:page_ALPHA', 'definition-used-by-image'],
    ['[Read][shared]\n\n[shared]: page:page_ALPHA\n[SHARED]: page:page_BETA', 'ambiguous-definition']
  ])('preserves an ambiguous/shared reference definition (case %#)', (source, reason) => {
    const plan = planPageLinks(source, receipts);
    expect(plan.unresolved[0].reason).toBe(reason);
    expect(plan.edits).toEqual([]);
    expect(applyPageLinkPlan(source, plan)).toBe(source);
  });

  it('escapes Markdown destination punctuation without changing the confirmed parsed HTTPS target', () => {
    const url = 'https://example.invalid/a(b)?label=&copy;&mode=[read]';
    const result = rewrite('[Read](page:page_ALPHA)\n\n[Ref][r]\n\n[r]: <page:page_ALPHA>\n\n<page:page_ALPHA>', { page_ALPHA: receipt('page_ALPHA', url) });
    const tree = fromMarkdown(result);
    const inline = tree.children[0].children[0];
    const definition = tree.children.find(node => node.type === 'definition');
    const autolink = tree.children.at(-1).children[0];
    expect(inline.url).toBe(url);
    expect(definition.url).toBe(url);
    expect(autolink.url).toBe(url);
  });

  it('rejects stale source, stale spans and overlapping edits', () => {
    const source = '[One](page:page_ALPHA) [Two](page:page_BETA)';
    const plan = planPageLinks(source, receipts);
    expect(() => applyPageLinkPlan(source + '\n', plan)).toThrow('Source changed');
    expect(() => applyPageLinkPlan(source, { ...plan, edits: [{ ...plan.edits[0], oldText: 'wrong' }] })).toThrow('stale link edit');
    expect(() => applyPageLinkPlan(source, { ...plan, edits: [plan.edits[0], plan.edits[0]] })).toThrow('Overlapping');
  });

  it.each([null, [], 'https://example.invalid/page'])('rejects an invalid receipt collection (case %#)', value => {
    expect(() => planPageLinks('[Read](page:page_ALPHA)', value)).toThrow('object keyed by requested Page ID');
  });

  it('preserves v3 markers, original HTML bytes and SHA-256 through conversion', async () => {
    const html = '\uFEFF<!doctype html>\r\n<html><body>📚 [In source](page:page_ALPHA)\\alpha<script>throw new Error("do not execute")</script></body></html>\r\n';
    const hash = createHash('sha256').update(html).digest('hex');
    const figure = '<!-- gpt-pages:figure id=example -->\r\n\r\n![Chart](visualize:fictional-chart)\r\n\r\n';
    const footer = `<!-- gpt-pages:source v=3 id=example ref=fictional-chart sha256=${hash} -->\r\n\r\n\`\`\`html\r\n${html}\`\`\`\r\n`;
    const source = figure + '[Read](page\\:page_ALPHA)\r\n\r\n' + footer;
    const updated = rewrite(source);
    expect(updated).toBe(figure + `[Read](${alpha})\r\n\r\n` + footer);
    expect(Buffer.from(updated.slice(updated.indexOf(footer)))).toEqual(Buffer.from(footer));
    const converted = await convertVerified(updated);
    expect(converted.figures).toBe(1);
    expect(converted.markdown).toContain('```html-source\r\n' + html + '```\r\n');
    expect(converted.warnings.some(warning => warning.code === 'source-hash-mismatch')).toBe(false);
  });
});

describe('portable preflight CLI', () => {
  const prefix = join(tmpdir(), `gpt-pages-links-${process.pid}`);
  const input = prefix + '.md';
  const resolutions = prefix + '.json';
  const output = prefix + '-output.md';
  const cli = 'skills/gpt-pages-obsidian-visualizations/scripts/page_links.mjs';
  const run = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  beforeEach(() => {
    writeFileSync(input, '\uFEFF[Read](page\\:page_ALPHA)\r\n');
    writeFileSync(resolutions, JSON.stringify(receipts));
    if (existsSync(output)) unlinkSync(output);
  });
  afterAll(() => {
    unlinkSync(input);
    unlinkSync(resolutions);
    if (existsSync(output)) unlinkSync(output);
  });

  it('scans without mutating its input and gives one distinct lookup target', () => {
    const source = readFileSync(input);
    const result = run(['scan', input]);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.targets).toEqual([{ pageId: 'page_ALPHA', occurrences: 1 }]);
    expect(report.unresolved[0].reason).toBe('not-resolved');
    expect(report.sourceSha256).toBe(createHash('sha256').update(source).digest('hex'));
    expect(readFileSync(input)).toEqual(source);
    expect(existsSync(output)).toBe(false);
  });

  it('writes a new verified copy with the BOM and CRLF preserved', () => {
    const result = run(['rewrite', input, resolutions, '--out', output]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).edits).toHaveLength(1);
    expect(readFileSync(output)).toEqual(Buffer.from(`\uFEFF[Read](${alpha})\r\n`));
    expect(readFileSync(input, 'utf8')).toBe('\uFEFF[Read](page\\:page_ALPHA)\r\n');
  });

  it('returns an unresolved report and a non-success exit code for failed tools', () => {
    writeFileSync(resolutions, JSON.stringify({ page_ALPHA: { error: { code: 'not_found' } } }));
    const result = run(['rewrite', input, resolutions, '--out', output]);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).unresolved[0].reason).toBe('read-failed');
    expect(readFileSync(output)).toEqual(readFileSync(input));
  });

  it('refuses to overwrite existing output or its original input', () => {
    writeFileSync(output, 'User content');
    expect(run(['rewrite', input, resolutions, '--out', output]).status).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe('User content');
    const original = readFileSync(input);
    expect(run(['rewrite', input, resolutions, '--out', input]).status).toBe(1);
    expect(readFileSync(input)).toEqual(original);
  });

  it('rejects invalid UTF-8 rather than replacing source bytes', () => {
    writeFileSync(input, Buffer.from([0xff, 0x0a]));
    const result = run(['scan', input]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(readFileSync(input)).toEqual(Buffer.from([0xff, 0x0a]));
  });
});
