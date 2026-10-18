import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { appLanguage } from '../src/language';
import { setLanguage, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { zhTW } from '../src/i18n/zh-TW';
import { cleanVerified, convertVerified } from '../src/convert';
import { digest, vaultPath } from '../src/importer';

it.each(['en', 'en-GB', 'fr', 'ja', 'zh', 'zh-CN', '', 'invalid'])('falls back to English for %s', language => {
  setLanguage(language);
  expect(t('import.preview')).toBe('Preview');
  expect(t('renderer.recheck')).toBe('Recheck renderer');
});

it.each(['zh-TW', 'zh-tw', ' zh_TW ', 'zh-Hant', 'zh-Hant-TW'])('recognizes Traditional Chinese %s', language => {
  setLanguage(language);
  expect(t('import.preview')).toBe('預覽');
  expect(t('renderer.recheck')).toBe('重新檢查 renderer');
  setLanguage('en');
  expect(t('import.preview')).toBe('Preview');
});

it('prefers the public API, including an unsupported app language, over stale legacy storage', () => {
  const legacy = vi.fn(() => 'zh-TW');
  expect(appLanguage({ getLanguage: () => 'fr' }, legacy)).toBe('fr');
  expect(legacy).not.toHaveBeenCalled();
  setLanguage(appLanguage({ getLanguage: () => 'fr' }, legacy));
  expect(t('settings.heading')).toBe('Automatic folder cleanup');
});

it.each([
  {},
  { getLanguage: () => undefined },
  { getLanguage: () => null },
  { getLanguage: () => 42 },
  { getLanguage: () => ' ' },
  { getLanguage: () => { throw new Error('Unavailable'); } }
])('uses legacy language storage when the host API is unavailable: %j', api => {
  expect(appLanguage(api, () => 'zh-TW')).toBe('zh-TW');
  expect(appLanguage(api, () => 'en')).toBe('en');
});

it.each([undefined, null, 42, '', ' '])('defaults to English when legacy storage is unusable: %s', value => {
  expect(appLanguage({}, () => value)).toBe('en');
});

it('survives blocked legacy storage on old hosts', () => {
  expect(appLanguage({}, () => { throw new Error('SecurityError'); })).toBe('en');
});

it('keeps translation keys and placeholders complete in both languages', () => {
  expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort());
  const placeholders = (value: string) => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    expect(zhTW[key].trim(), key).not.toBe('');
    expect(placeholders(zhTW[key]), key).toEqual(placeholders(en[key]));
  }
});

it('substitutes user data once without interpreting braces, HTML, dollar signs or backslashes', () => {
  const name = '<img src=x onerror=evil()> {name} $& \\alpha 中文.md';
  setLanguage('en');
  expect(t('import.selected', { name })).toBe('Selected: ' + name);
  expect(t('preview.status', { status: 'Ready', count: 2 })).toBe('Status: Ready; paired figures: 2');
});

it.each([false, true])('keeps exact BOM output, assets and hashes across UI languages (trusted=%s)', async trusted => {
  // Keep line endings covered by the fixture's existing SHA-256 unchanged.
  const source = '\uFEFF' + readFileSync('tests/fixtures/v2-escaped.input.md', 'utf8');
  const expected = '\uFEFF' + readFileSync('tests/fixtures/v2-escaped.expected.md', 'utf8');
  const output = trusted ? expected.replaceAll('```html-source', '```html') : expected;
  setLanguage('zh-TW');
  const chinese = await convertVerified(source, trusted);
  setLanguage('en');
  const english = await convertVerified(source, trusted);
  expect(english.markdown).toBe(output);
  expect(chinese.markdown).toBe(output);
  expect(english.figures).toBe(chinese.figures);
  expect(english.assets).toEqual(chinese.assets);
  expect(english.warnings.map(warning => warning.code)).toEqual(chinese.warnings.map(warning => warning.code));
  expect(await digest(english.markdown)).toBe(await digest(chinese.markdown));
  setLanguage('zh-TW');
  const cleanup = await cleanVerified(source, trusted);
  setLanguage('en');
  expect((await cleanVerified(source, trusted)).markdown).toBe(cleanup.markdown);
});

it('translates diagnostic text while retaining stable warning codes and path validation', async () => {
  const source = '<!-- gpt-pages:figure v=1 id=missing -->\nvisualize:missing\n';
  setLanguage('en');
  const result = await convertVerified(source);
  expect(result.warnings.find(warning => warning.code === 'missing-source')?.message).toContain('No adjacent or explicitly marked complete HTML source');
  expect(() => vaultPath('../outside')).toThrow('The destination must be inside the vault');
  setLanguage('zh-TW');
  expect(() => vaultPath('../outside')).toThrow('目的路徑必須位於 vault 內');
});
