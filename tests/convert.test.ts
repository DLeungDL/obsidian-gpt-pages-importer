import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { convert, assetReferences } from '../src/convert';
const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');
const document = '<!doctype html>\n<html lang="zh-Hant"><body>中文<script>throw new Error("must not execute")</script></body></html>\n';
const paired = (id = 'a', version = '1', body = document) => `<!-- gpt-pages:figure v=${version} id=${id} -->\nvisualize:${id}\n\`\`\`html\n${body}\`\`\`\n`;
describe('source-preserving conversion', () => {
  for (const name of ['static', 'interactive', 'missing-source']) it(`matches independent ${name} fixture`, () => {
    expect(convert(fixture(`${name}.input.md`)).markdown).toBe(fixture(`${name}.expected.md`));
  });
  it('removes only exact paired markers and references', () => {
    const output = convert(paired());
    expect(output.figures).toBe(1);
    expect(output.markdown).not.toContain('visualize:a');
    expect(output.markdown).not.toContain('gpt-pages:figure');
    expect(output.markdown).toContain(document);
  });
  it('is idempotent when imported output is converted again', () => {
    const first = convert(paired());
    expect(convert(first.markdown).markdown).toBe(first.markdown);
    expect(convert(first.markdown).figures).toBe(0);
  });
  it('retains CRLF, BOM, escaped HTML, formulas, Unicode and literal backslashes', () => {
    const body = document.replace('</body>', '&lt;p&gt; \\n \\t \\alpha \\path\\file 中文 🐱</body>');
    const input = '\uFEFF# 中文\n$\\alpha + \\frac{1}{2}$\n' + paired('a', '1', body);
    const crlf = input.replaceAll('\n', '\r\n');
    expect(convert(crlf).markdown).toBe(crlf.replace('<!-- gpt-pages:figure v=1 id=a -->\r\nvisualize:a\r\n', '').replace('```html\r\n', '```html-source\r\n'));
  });
  it('does not decode unverified escaping outside source either', () => {
    const input = '\\# 標題\\n &lt;div&gt; \\*literal\\* $\\beta$';
    expect(convert(input).markdown).toBe(input);
  });
  it.each([
    { newline: '\n', bom: '\uFEFF' },
    { newline: '\r\n', bom: '\uFEFF' }
  ])('preserves opening BOMs when removing a v1 marker ($newline, $bom)', ({ newline, bom }) => {
    const input = bom + paired().replaceAll('\n', newline);
    expect(convert(input).markdown).toBe(bom + '```html-source' + newline + document.replaceAll('\n', newline) + '```' + newline);
  });
  it('keeps markers and references inside code fences untouched', () => {
    const input = '````markdown\n' + paired() + '````\n';
    expect(convert(input).markdown).toBe(input);
    expect(convert(input).figures).toBe(0);
  });
  it('handles tilde fences and longer delimiters without changing body', () => {
    const input = paired().replaceAll('```', '~~~~');
    expect(convert(input).markdown).toContain('~~~~html-source\n' + document);
    expect(convert(input).figures).toBe(1);
  });
  it.each([
    ['unknown-version', paired('a', '99')],
    ['duplicate-id', paired() + paired()],
    ['missing-source', '<!-- gpt-pages:figure v=1 id=a -->\nvisualize:a\n'],
    ['missing-source', paired().replace('visualize:a', 'visualize:other')],
    ['incomplete-document', paired('a', '1', '<div>fragment</div>\n')],
    ['missing-source', paired().replace(/```\n$/, '')]
  ])('warns %s without deleting a reference', (code, input) => {
    const output = convert(input);
    expect(output.warnings.some(w => w.code === code)).toBe(true);
    expect(output.markdown).toContain('visualize:');
    expect(output.markdown).toContain('gpt-pages:figure');
    expect(output.figures).toBe(0);
  });
  it('refuses a distant source beyond intervening prose', () => {
    expect(convert(paired().replace('visualize:a\n', 'visualize:a\n其他段落\n')).markdown).toContain('visualize:a');
  });
  it('leaves ambiguous markdown visualization links untouched', () => {
    expect(convert(paired().replace('visualize:a', '![圖](visualize:a)')).markdown).toContain('![圖](visualize:a)');
  });
  it('warns about malformed markers', () => {
    expect(convert('<!-- gpt-pages:figure id=? -->').warnings.some(w => w.code === 'malformed-marker')).toBe(true);
  });
  it('requires explicit trust to emit executable HTML fences', () => {
    expect(convert(paired()).markdown).toContain('```html-source\n');
    expect(convert(paired(), true).markdown).toContain('```html\n' + document);
    expect(convert(paired(), true).warnings.some(w => w.code === 'trusted-rendering')).toBe(true);
  });
  it('neutralizes unpaired and unclosed HTML fences', () => {
    const input = '```html\n<script>window.evil = true</script>';
    expect(convert(input).markdown).toBe(input.replace('```html', '```html-source'));
    expect(convert(input).warnings.some(w => w.code === 'unclosed-fence')).toBe(true);
  });
  it.each([
    '> ```html\n> <script>x</script>\n> ```\n',
    '- ```html\n  <script>x</script>\n  ```\n',
    '> - ~~~html\n>   <script>x</script>\n>   ~~~\n',
    '```h&#116;ml\n<script>x</script>\n```\n',
    '\uFEFF```html\n<script>x</script>\n```\n'
  ])('neutralizes nested or entity-encoded renderer fences without changing source', input => {
    const output = convert(input).markdown;
    expect(output).toContain('html-source');
    expect(output).toContain('<script>x</script>');
    expect(convert(output).markdown).toBe(output);
  });
  it('does not treat indented source or raw HTML script contents as fenced Markdown', () => {
    const input = '    ```html\n    source\n    ```\n\n<script>\n```html\nvar x = "literal";\n```\n</script>\n';
    expect(convert(input).markdown).toBe(input);
  });
  it('reports external, local, CSS, markdown and embed references without fetching them', () => {
    expect(assetReferences('<img src="missing.png"><script src="https://example.invalid/x.js"></script><style>@import "font.css";p{background:url(./a.png)}</style> ![a](b.png) ![[c.svg]]')).toEqual(['./a.png', 'b.png', 'c.svg', 'font.css', 'https://example.invalid/x.js', 'missing.png']);
    expect(assetReferences('<img src="data:image/png;base64,aaa"><a href="#x">x</a>')).toEqual([]);
  });
});
