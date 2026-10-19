import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import { cleanVerified, convertVerified } from '../src/convert';
import { prepareImages } from '../src/images';
import { asset, source } from './image-fixture';

const example = readFileSync('skills/gpt-pages-obsidian-visualizations/assets/math-example.md', 'utf8');
const expectedMath = readFileSync('tests/fixtures/math.expected.md', 'utf8');

describe('portable mathematical notation', () => {
  it('ships bare latex formulas for Pages and an independent Obsidian expectation', async () => {
    const blocks = fromMarkdown(example).children.filter(node => node.type === 'code');
    expect(blocks).toHaveLength(5);
    expect(blocks.every(node => node.lang === 'latex' && !node.value.includes('$'))).toBe(true);
    expect(blocks[0]!.value).toBe('E = mc^2,\\quad h_i = h_0 + \\Delta h_i');
    expect((await convertVerified(example)).markdown).toBe(expectedMath);
    expect((await convertVerified(example)).mathBlocks).toBe(5);
    expect(expectedMath.split('\n').filter(line => line === '$$')).toHaveLength(10);
  });

  describe.each(['\n', '\r\n'])('with %j line endings', newline => {
    it.each([false, true])('preserves math while pairing HTML and restoring an image (trusted=%s)', async trusted => {
      const math = '\uFEFF' + example.replaceAll('\n', newline) + newline;
      const expected = '\uFEFF' + expectedMath.replaceAll('\n', newline) + newline;
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
      expect(result.markdown.startsWith(expected)).toBe(true);
      expect(result.markdown).toContain('GPT%20Pages%20Assets/' + asset().sha256 + '.png');
      expect(result.markdown).toContain('```' + (trusted ? 'html' : 'html-source') + newline + html);
      expect(result.markdown).not.toMatch(/gpt-pages:|gpt-pages-asset|library-file:|visualize:/);

      for (const renderHtml of [false, true]) {
        const cleaned = await cleanVerified(input, renderHtml);
        const restored = await prepareImages(cleaned, 'Inbox/math.md');
        expect(restored.markdown.startsWith(expected)).toBe(true);
        expect(restored.images).toHaveLength(1);
        expect((await cleanVerified(restored.markdown, renderHtml)).markdown).toBe(restored.markdown);
      }
      expect((await convertVerified(result.markdown, trusted)).markdown).toBe(result.markdown);
    });
  });

  it.each(['tex', 'math', 'latex source'])('keeps intentional %s source examples as code', async language => {
    const input = '```' + language + '\n\\frac{1}{2}\n\\begin{bmatrix}1 \\\\ 2\\end{bmatrix}\n```\n';
    expect((await convertVerified(input)).markdown).toBe(input);
    expect((await cleanVerified(input, true)).markdown).toBe(input);
  });
});
