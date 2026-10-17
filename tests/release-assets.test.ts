import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('accepts only canonical supported release assets with an exact matching tag', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gpt-pages-release-'));
  const check = resolve('scripts/check-release-assets.mjs');
  try {
    writeFileSync(join(directory, 'main.js'), '/*! License */\nmodule.exports = {};\n');
    writeFileSync(join(directory, 'manifest.json'), '{"version":"0.1.3"}\n');
    writeFileSync(join(directory, 'styles.css'), '.example {}\n');
    expect(execFileSync(process.execPath, [check, directory, '0.1.3'], { encoding: 'utf8' })).toContain('verified');
    expect(spawnSync(process.execPath, [check, directory, '0.1.2']).status).not.toBe(0);
    writeFileSync(join(directory, 'main.js'), '/*! License */\r\nmodule.exports = {};\r\n');
    expect(spawnSync(process.execPath, [check, directory, '0.1.3']).status).not.toBe(0);
    writeFileSync(join(directory, 'main.js'), '/*! License */\nmodule.exports = {};\n');
    writeFileSync(join(directory, 'unsupported.zip'), 'extra');
    expect(spawnSync(process.execPath, [check, directory, '0.1.3']).status).not.toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
