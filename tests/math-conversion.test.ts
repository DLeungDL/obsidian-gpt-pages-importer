import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanVerified, convert, convertVerified } from '../src/convert';
import { cleanFile } from '../src/cleanup';
import { applyImport, planImport, readState, type Storage } from '../src/importer';

const fence = '```';
const formula = '\\frac{2}{3}+\\frac{1}{6}=\\frac{5}{6}';
const block = (body: string, language = 'latex') => fence + language + '\n' + body + '\n' + fence + '\n';
const output = '$$\n' + formula + '\n$$\n';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));

describe('Pages bare latex formula conversion', () => {
  it('supports synchronous import, verified import and cleanup independently of HTML trust', async () => {
    const source = block(formula);
    for (const trusted of [false, true]) {
      expect(convert(source, trusted)).toMatchObject({ markdown: output, mathBlocks: 1, figures: 0 });
      expect(await convertVerified(source, trusted)).toMatchObject({ markdown: output, mathBlocks: 1 });
      expect(await cleanVerified(source, trusted)).toMatchObject({ markdown: output, mathBlocks: 1 });
    }
  });

  it.each(['\n', '\r\n', '\r'])('preserves TeX bytes, BOM and %j line endings', async newline => {
    const tex = '\\begin{cases}\n\\frac{u_1}{2}, & u_1>0,\\\\\n0, & u_1\\le0.\n\\end{cases}';
    const source = '\uFEFF' + block(tex).replaceAll('\n', newline);
    const expected = '\uFEFF$$' + newline + tex.replaceAll('\n', newline) + newline + '$$' + newline;
    expect((await convertVerified(source)).markdown).toBe(expected);
    expect((await cleanVerified(expected)).markdown).toBe(expected);
    expect((await convertVerified(expected)).mathBlocks).toBeUndefined();
  });

  it('separates math from adjacent prose without changing inline math', async () => {
    const source = 'Before $a_1$.\n' + block(formula) + 'After $b^2$.\n';
    expect((await convertVerified(source)).markdown).toBe('Before $a_1$.\n\n' + output + '\nAfter $b^2$.\n');
  });

  it.each([
    ['~~~latex\n' + formula + '\n~~~~\n', output],
    [fence + 'LATEX \t\n' + formula + '\n' + fence + '\n', output],
    [fence + 'latex\n' + formula + '\n' + fence, output.slice(0, -1)],
    ['  ' + fence + 'latex\n  x_1^2\n  ' + fence + '\n', '$$\n  x_1^2\n$$\n']
  ])('handles complete CommonMark delimiters without normalizing formula bytes', async (source, expected) => {
    expect((await convertVerified(source)).markdown).toBe(expected);
  });

  it.each([
    block(formula, 'tex'),
    block(formula, 'math'),
    block(formula, 'latex source'),
    block(formula, 'la&#116;ex'),
    block(''),
    block('   '),
    fence + 'latex\n' + formula + '\n',
    block('$$\n' + formula + '\n$$'),
    block('$x$'),
    block('\\[\nx^2\n\\]'),
    block('\\(x^2\\)'),
    block('\\documentclass{article}\n\\begin{document}\nx^2\n\\end{document}'),
    block('\\usepackage{amsmath}\nx^2'),
    block('\\newcommand{\\foo}{x}\n\\foo'),
    block('\\input{chapter}'),
    block(formula).split('\n').map(line => '> ' + line).join('\n'),
    '- Example\n\n' + block(formula).split('\n').map(line => '  ' + line).join('\n'),
    '    ' + block(formula).replaceAll('\n', '\n    '),
    fence + 'markdown\n' + block(formula) + fence + '\n'
  ])('preserves ambiguous, source-code and nested forms', async source => {
    expect((await convertVerified(source)).markdown).toBe(source);
    expect((await cleanVerified(source)).markdown).toBe(source);
  });

  it('does not edit a latex-looking string inside HTML source bytes', async () => {
    const source = fence + 'html-source\n<!doctype html>\n<html><body><pre>\n' + block(formula) + '</pre></body></html>\n' + fence + '\n';
    expect((await cleanVerified(source)).markdown).toBe(source);
  });
});

class MemoryStorage implements Storage {
  files = new Map<string, string>();
  async read(path: string) { return this.files.get(path) ?? null; }
  async exists(path: string) { return this.files.has(path); }
  async create(path: string, content: string) {
    if (this.files.has(path)) throw new Error('exists');
    this.files.set(path, content);
  }
  async replace(path: string, expected: string, content: string) {
    if (this.files.get(path) !== expected) throw new Error('concurrent edit');
    this.files.set(path, content);
  }
}

describe('formula-only import and cleanup writes', () => {
  it.each([
    [fence + ' latex', fence],
    [fence + '\tlatex', fence],
    ['~~~ latex', '~~~'],
    ['~~~ \t LATEX', '~~~'],
    ['  ' + fence + ' latex', '  ' + fence]
  ])('cleans spaced latex openers with HTML rendering off: %s', async (opener, closer) => {
    const storage = new MemoryStorage();
    const path = 'Inbox/spaced-formula.md';
    const source = opener + '\n' + formula + '\n' + closer + '\n';
    storage.files.set(path, source);
    expect((await convertVerified(source)).markdown).toBe(output);
    const result = await cleanFile(storage, path);
    expect(result.mathBlocks).toBe(1);
    expect(storage.files.get(path)).toBe(output);
    expect(storage.files.get(result.backup!)).toBe(source);
    const before = new Map(storage.files);
    expect((await cleanFile(storage, path)).backup).toBeUndefined();
    expect(storage.files).toEqual(before);
  });

  it('previews the conversion, writes once and protects local edits on reimport', async () => {
    const storage = new MemoryStorage();
    const initial = readState(null);
    const plan = await planImport(storage, initial, 'formula-example', block(formula), 'Pages');
    expect(plan.conversion).toMatchObject({ markdown: output, mathBlocks: 1, figures: 0 });
    const result = await applyImport(storage, initial, plan, async () => {});
    expect(storage.files.get(plan.destination)).toBe(output);
    expect((await planImport(storage, result.state, 'formula-example', block(formula), 'Pages')).status).toBe('unchanged');
    storage.files.set(plan.destination, output + 'Local annotation.\n');
    expect((await planImport(storage, result.state, 'formula-example', block(formula), 'Pages')).status).toBe('conflict');
  });

  it('backs up a formula-only note, converts it with HTML rendering off, and skips repeat writes', async () => {
    const storage = new MemoryStorage();
    const path = 'Inbox/formulas.md';
    const source = '\uFEFF' + block(formula).replaceAll('\n', '\r\n');
    storage.files.set(path, source);
    const result = await cleanFile(storage, path);
    expect(result.mathBlocks).toBe(1);
    expect(result.backup).toBeDefined();
    expect(storage.files.get(result.backup!)).toBe(source);
    expect(storage.files.get(path)).toBe('\uFEFF' + output.replaceAll('\n', '\r\n'));
    const before = new Map(storage.files);
    expect((await cleanFile(storage, path)).backup).toBeUndefined();
    expect(storage.files).toEqual(before);
  });

  it('does not replace a formula-only note when its backup fails', async () => {
    const storage = new MemoryStorage();
    const source = block(formula);
    storage.files.set('Inbox/formulas.md', source);
    vi.spyOn(storage, 'create').mockRejectedValueOnce(new Error('backup failed'));
    await expect(cleanFile(storage, 'Inbox/formulas.md')).rejects.toThrow('backup failed');
    expect(storage.files.get('Inbox/formulas.md')).toBe(source);
  });

  it('preserves an edit arriving after the math backup', async () => {
    const storage = new MemoryStorage();
    const source = block(formula);
    storage.files.set('Inbox/formulas.md', source);
    const create = storage.create.bind(storage);
    vi.spyOn(storage, 'create').mockImplementation(async (path, content) => {
      await create(path, content);
      storage.files.set('Inbox/formulas.md', 'Concurrent annotation');
    });
    await expect(cleanFile(storage, 'Inbox/formulas.md')).rejects.toThrow('concurrent edit');
    expect(storage.files.get('Inbox/formulas.md')).toBe('Concurrent annotation');
  });
});
