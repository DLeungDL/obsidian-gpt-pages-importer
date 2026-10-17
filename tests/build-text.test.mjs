import { describe, it, expect } from 'vitest';
import { canonicalText } from '../scripts/build-text.mjs';

describe('reproducible license and text assets', () => {
  it('produces identical bytes from LF and Windows CRLF license sources', () => {
    const license = 'MIT License\n\nCopyright (c) Example\n';
    const bundle = source => Buffer.from('/*!\n' + canonicalText(source) + '*/\nmodule.exports = {};\n');
    expect(bundle(license.replaceAll('\n', '\r\n'))).toEqual(bundle(license));
  });
  it('normalizes bare CR while preserving Unicode, BOM and literal backslashes', () => {
    expect(canonicalText('\uFEFF中文 🐱\\alpha\r\nnext\rlast\n')).toBe('\uFEFF中文 🐱\\alpha\nnext\nlast\n');
  });
});
