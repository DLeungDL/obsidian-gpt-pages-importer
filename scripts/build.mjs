import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
import { Script } from 'node:vm';

// Neutral resolution selects pure entity tables rather than the parser's DOM decoder.
const result = await build({
  entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian'],
  platform: 'neutral', format: 'cjs', target: 'es2022', outfile: 'main.js', minify: true,
  metafile: true, logLevel: 'info'
});
await mkdir('dist/gpt-pages-importer', { recursive: true });
const packages = new Set();
for (const path of Object.keys(result.metafile.inputs)) {
  const match = path.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (match) packages.add(match[1]);
}
const notices = [];
for (const name of [...packages].sort()) {
  const root = `node_modules/${name}`;
  const metadata = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  const license = (await readdir(root)).find(file => /^licen[cs]e(?:\.md|\.txt)?$/i.test(file));
  if (!license) throw new Error(`Missing bundled dependency license: ${name}`);
  notices.push(`${name} ${metadata.version}\n${await readFile(`${root}/${license}`, 'utf8')}`);
}
const noticeText = notices.join('\n\n---\n\n');
await writeFile('dist/gpt-pages-importer/THIRD-PARTY-NOTICES.txt', noticeText);
// Obsidian only installs main.js, manifest.json and styles.css from a release.
// Keep dependency license notices in the installed bundle as well as the archive.
const bundle = await readFile('main.js', 'utf8');
const projectLicense = await readFile('LICENSE', 'utf8');
await writeFile('main.js', '/*!\n' + projectLicense.replaceAll('*/', '* /') + '\nThird-party notices\n\n' + noticeText.replaceAll('*/', '* /') + '\n*/\n' + bundle);
for (const name of ['main.js', 'manifest.json', 'styles.css', 'LICENSE']) {
  await copyFile(name, `dist/gpt-pages-importer/${name}`);
}
const module = { exports: {} };
new Script(await readFile('dist/gpt-pages-importer/main.js', 'utf8')).runInNewContext({
  module,
  require(name) {
    if (name !== 'obsidian') throw new Error(`Unexpected runtime dependency: ${name}`);
    return { Plugin: class {}, Modal: class {}, PluginSettingTab: class {} };
  }
});
if (typeof module.exports.default !== 'function') throw new Error('Plugin export missing');
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const metadata = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.id !== 'gpt-pages-importer' || manifest.version !== metadata.version) throw new Error('Manifest mismatch');
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
if (versions[manifest.version] !== manifest.minAppVersion) throw new Error('Version compatibility mismatch');
console.log('Packaged plugin smoke check passed (no DOM access at module load).');
