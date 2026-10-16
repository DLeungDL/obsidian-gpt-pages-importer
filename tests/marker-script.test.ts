import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanVerified } from '../src/convert';

const path = join(tmpdir(), `gpt-pages-marker-${process.pid}.html`);
const source = '\uFEFF<!doctype html>\r\n<html><body>中文 📚</body></html>\r\n';
const hash = createHash('sha256').update(source).digest('hex');
beforeAll(() => {
  writeFileSync(path, source, 'utf8');
  vi.stubGlobal('crypto', webcrypto);
});
afterAll(() => unlinkSync(path));

describe('marker generation CLI', () => {
  it('generates compact body and footer markers that pair with the original UTF-8 bytes', async () => {
    const generated = execFileSync(process.execPath, ['scripts/figure-marker.mjs', '--v3', 'example', 'native-example', path], { encoding: 'utf8' });
    const [figure, footer] = generated.trimEnd().split('\n\n');
    expect(figure).toBe('<!-- gpt-pages:figure id=example -->');
    expect(footer).toBe(`<!-- gpt-pages:source v=3 id=example ref=native-example sha256=${hash} -->`);
    const output = await cleanVerified(figure + '\n\n![圖](visualize:native-example)\n\n' + footer + '\n\n```html\r\n' + source + '```\r\n');
    expect(output.figures).toBe(1);
    expect(output.markdown).toContain(source);
    expect(output.markdown).not.toMatch(/gpt-pages|visualize:/);
  });

  it('preserves the existing v2 invocation', () => {
    expect(execFileSync(process.execPath, ['scripts/figure-marker.mjs', 'example', 'native-example', path], { encoding: 'utf8' }).trim())
      .toBe(`<!-- gpt-pages:figure v=2 id=example ref=native-example sha256=${hash} -->`);
  });
});
