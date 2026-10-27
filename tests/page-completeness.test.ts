import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { asset, png, source } from './image-fixture';

const script = './skills/gpt-pages-obsidian-visualizations/scripts/verify_page_export.mjs';
const check = (markdown: string) => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { readFileSync } from 'node:fs';
    import { verifyPageExport } from '${script}';
    console.log(JSON.stringify(verifyPageExport(readFileSync(0, 'utf8'))));
  `], { input: markdown, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
};
const html = '<!doctype html>\n<html><head></head><body>中文 \\alpha</body></html>\n';
const hash = createHash('sha256').update(html).digest('hex');
const body = '<!-- gpt-pages:figure id=chart-a -->\n\n![chart](visualize:fictional-chart-a)\n\n';
const footer = `<!-- gpt-pages:source v=3 id=chart-a ref=fictional-chart-a sha256=${hash} -->\n\n` + '```html\n' + html + '```\n';
const good = body + footer;

it('validates exact v3 source bytes and all native visualization occurrences', () => {
  expect(check(good)).toMatchObject({ valid: true, runtime_tested: false, figures: [{ id: 'chart-a', ref: 'fictional-chart-a', sha256: hash }] });
  const escaped = good.replaceAll('<!--', '\\<\\!--').replaceAll('-->', '--\\>').replace('visualize:', 'visualize\\:');
  expect(check(escaped).valid).toBe(true);
});
it.each([
  good + '\n![forgotten](visualize:fictional-unpaired)\n',
  good.replace(body, ''), good.replace(footer, ''), good + footer, body + good,
  good.replace('visualize:fictional-chart-a', 'visualize:fictional-other'),
  good.replace(hash, '0'.repeat(64)), good.replace('中文', 'changed'),
  good.replace('v=3', 'v=2'), good.replace(/```\n$/, ''),
  good + '\n```html\n' + html + '```\n',
  '````markdown\n' + good + '````\n\n![unpaired](visualize:fictional-chart-a)'
])('fails incomplete, ambiguous or altered figure exports (%#)', markdown => {
  expect(check(markdown).valid).toBe(false);
});
it('checks CRLF hashes without normalizing source bytes', () => {
  const crlf = good.replaceAll('\n', '\r\n');
  expect(check(crlf).valid).toBe(false);
  const corrected = crlf.replace(hash, createHash('sha256').update(html.replaceAll('\n', '\r\n')).digest('hex'));
  expect(check('\uFEFF' + corrected).valid).toBe(true);
});
it('pairs internal display fragments and data URI exports to identical image inventories', () => {
  const canonical = check(source());
  const displayed = check(source().replace('fixture-image>', 'fixture-image#display=full>'));
  const data = check(`[image1]: data:image/png;base64,${png.toString('base64')}\n\n![image][image1]\n\n` + source().split('\n\n')[1]);
  expect(canonical.valid).toBe(true);
  expect(displayed).toEqual(canonical);
  expect(data).toEqual(canonical);
});
it('rejects unpaired, duplicate and hash-mismatched image assets', () => {
  for (const text of [source().replace('fixture-image>', 'fixture-image#other>'), source() + source(),
    source({ ...asset(), sha256: '0'.repeat(64) }), source().split('\n\n')[1]!,
    '![missing](library-file:fictional-missing)', '![bad](data:image/svg+xml;base64,PHN2Zy8+)']) expect(check(text).valid).toBe(false);
});
it('CLI compares complete Page/download inventories and rejects stale downloads', () => {
  const expected = join(tmpdir(), `page-completeness-${process.pid}-expected.md`);
  const actual = join(tmpdir(), `page-completeness-${process.pid}-actual.md`);
  const run = () => spawnSync(process.execPath, [script, actual, '--expected', expected], { encoding: 'utf8' });
  writeFileSync(expected, good + '\n' + source());
  writeFileSync(actual, good + '\n' + source().replace('fixture-image>', 'fixture-image#display=full>'));
  try {
    expect(run().status).toBe(0);
    writeFileSync(actual, good);
    const stale = run();
    expect(stale.status).toBe(1);
    expect(JSON.parse(stale.stdout).issues).toContain('Page/export inventory mismatch or invalid expected Page');
    writeFileSync(expected, good + '\n![unpaired](visualize:fictional-missing)');
    expect(run().status).toBe(1);
  } finally {
    unlinkSync(actual);
    unlinkSync(expected);
  }
});
