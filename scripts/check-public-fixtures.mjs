import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// Publishing boundary for this repository's authored fixtures, not a general secret scanner.
const permittedEvidence = new Set(['docs/evidence/README.md', 'docs/evidence/validation-summary.json']);
const forbidden = [
  /\bpage_[a-f0-9]{32}\b/i,
  /\bfde[0-9]_[A-Za-z0-9_-]+\b/,
  /\bfile_[a-f0-9]{32}\b/i,
  /https:\/\/chatgpt\.com\/(?:space|page)\//i,
  /\b(?:creator|owner|author)_account_user_id\b/,
  /\b(?:block_id|expected_block_hash|relative_position_base64|library_container_id|file_upload_page_id)\s*["']?\s*:/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
];
const paths = execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const failures = [];
for (const path of paths) {
  if (path.startsWith('docs/evidence/') && !permittedEvidence.has(path)) {
    failures.push(`${path}: 原始證據不得加入公開目錄。`);
    continue;
  }
  let content;
  try { content = await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (forbidden.some(pattern => pattern.test(content))) failures.push(`${path}: 偵測到來源識別資料形式，請改用虛構 fixtures。`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`公開資料檢查通過：${paths.length} 個 Git 追蹤檔。`);
