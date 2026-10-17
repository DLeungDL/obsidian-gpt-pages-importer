import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const assets = ['main.js', 'manifest.json', 'styles.css'];
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
const build = () => execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
build();
const first = await Promise.all(assets.map(name => readFile(`dist/gpt-pages-importer/${name}`)));
build();
for (const [index, name] of assets.entries()) {
  const bytes = await readFile(`dist/gpt-pages-importer/${name}`);
  if (!bytes.equals(first[index])) throw new Error(`Non-reproducible build: ${name}`);
  console.log(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
console.log('Two builds produced byte-identical community release assets.');
