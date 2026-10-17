import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [directory, tag] = process.argv.slice(2);
if (!directory || !tag) throw new Error('Usage: node scripts/check-release-assets.mjs DIRECTORY VERSION');
const expected = ['main.js', 'manifest.json', 'styles.css'];
const files = (await readdir(directory)).sort();
if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error('Community releases must contain only main.js, manifest.json and styles.css.');
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(tag) || manifest.version !== tag) throw new Error('Release tag must match the manifest version.');
for (const name of expected) {
  const bytes = await readFile(join(directory, name));
  if (!bytes.length || bytes.includes(Buffer.from('\r\n'))) throw new Error(`Empty or non-canonical release asset: ${name}`);
}
console.log(`Community release ${tag}: exact supported asset set verified.`);
