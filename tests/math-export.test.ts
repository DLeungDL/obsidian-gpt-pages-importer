import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import { cleanVerified, convertVerified } from '../src/convert';
import { prepareImages } from '../src/images';
import { asset, source } from './image-fixture';

const example = readFileSync('skills/gpt-pages-obsidian-visualizations/assets/math-example.md', 'utf8');

describe('portable mathematical notation', () => {
  it('ships real inline/display math rather than fenced source examples', () => {
    expect(fromMarkdown(example).children.some(node => node.type === 'code')).toBe(false);
    expect(example).toContain('$E = mc^2,\\quad h_i = h_0 + \\Delta h_i$');
    const displays = [...example.matchAll(/^\$\$\n([\s\S]*?)\n\$\$$/gm)].map(match => match[1]);
    expect(displays).toEqual([
      '\\bar{h} = \\frac{1}{4}\\sum_{i=1}^{4} h_i\n= \\frac{1.2 + 1.5 + 1.8 + 1.5}{4} = 1.5\\,\\mathrm{m}',
      '\\int_{0}^{2\\pi}\\sin(t)\\,\\mathrm{d}t = 0',
      '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}\n\\begin{bmatrix}1 \\\\ 2\\end{bmatrix}\n= \\begin{bmatrix}5 \\\\ 11\\end{bmatrix}',
      '\\begin{aligned}\n(a+b)^2 &= a^2 + 2ab + b^2 \\\\\n(2+3)^2 &= 4 + 12 + 9 = 25\n\\end{aligned}'
    ]);
    expect(example.split('\n').filter(line => line === '$$')).toHaveLength(8);
    expect(example.split('\n')).not.toContain('$');
  });

  describe.each(['\n', '\r\n'])('with %j line endings', newline => {
    it.each([false, true])('preserves math while pairing HTML and restoring an image (trusted=%s)', async trusted => {
      const math = '\uFEFF' + example.replaceAll('\n', newline) + newline;
      const html = '<!doctype html>\n<html><body>Authored figure</body></html>\n'.replaceAll('\n', newline);
      const hash = createHash('sha256').update(html).digest('hex');
      const figure = [
        '<!-- gpt-pages:figure id=math-neighbor -->',
        '![Figure](visualize:fixture-math-neighbor)',
        `<!-- gpt-pages:source v=3 id=math-neighbor ref=fixture-math-neighbor sha256=${hash} -->`,
        '```html', html + '```', ''
      ].join(newline);
      const input = math + source(asset()).replaceAll('\n', newline) + newline + figure;
      const result = await prepareImages(await convertVerified(input, trusted), 'Inbox/math.md');
      expect(result.figures).toBe(1);
      expect(result.images).toHaveLength(1);
      expect(result.markdown.startsWith(math)).toBe(true);
      expect(result.markdown).toContain('GPT%20Pages%20Assets/' + asset().sha256 + '.png');
      expect(result.markdown).toContain('```' + (trusted ? 'html' : 'html-source') + newline + html);
      expect(result.markdown).not.toMatch(/gpt-pages:|gpt-pages-asset|library-file:|visualize:/);

      for (const renderHtml of [false, true]) {
        const cleaned = await cleanVerified(input, renderHtml);
        const restored = await prepareImages(cleaned, 'Inbox/math.md');
        expect(restored.markdown.startsWith(math)).toBe(true);
        expect(restored.images).toHaveLength(1);
        expect((await cleanVerified(restored.markdown, renderHtml)).markdown).toBe(restored.markdown);
      }
      expect((await convertVerified(result.markdown, trusted)).markdown).toBe(result.markdown);
    });
  });

  it.each(['latex', 'math'])('keeps intentional %s source examples as code', async language => {
    const input = '```' + language + '\n\\frac{1}{2}\n\\begin{bmatrix}1 \\\\ 2\\end{bmatrix}\n```\n';
    expect((await convertVerified(input)).markdown).toBe(input);
    expect((await cleanVerified(input, true)).markdown).toBe(input);
  });
});
