# Repository Guidelines

## 回覆規則（Response Rules）

一律使用繁體中文（Traditional Chinese）回覆，無論輸入語言。重要詞彙需附上英文對照（bilingual annotation）。

## Project Structure & Module Organization

TypeScript Obsidian plugin for manually importing Pages Markdown.

- `src/convert.ts`: pure Markdown conversion and asset-reference scanning.
- `src/importer.ts`: storage-independent planning, hashes, backups, and conflict protection.
- `src/main.ts`: Obsidian commands, modals, and vault adapter; `src/preview.ts`: text-only previews.
- `tests/`: Vitest suites, `obsidian-stub.ts`, and independent input/expected fixtures.
- `examples/`: authored static and interactive Markdown; `docs/`: format contract and compatibility evidence.
- `styles.css` and `manifest.json`: plugin styling and metadata. `scripts/build.mjs` packages installation files and dependency notices.

## Build, Test, and Development Commands

Use Node.js 24 and npm from the repository root:

- `npm ci`: install locked dependencies.
- `npm run typecheck`: check strict TypeScript without emitting files.
- `npm run build`: typecheck, bundle with esbuild, package files, and smoke-test module loading without a DOM.
- `npm test`: run all Vitest suites.
- `npm run check`: run the build and tests; this is the CI check.

For local testing, copy `dist/gpt-pages-importer/` into a test vault's `.obsidian/plugins/` directory and enable GPT Pages Importer. Rebuild and reload after changes. Keep generated `main.js`, `dist/`, and `node_modules/` untracked.

## Coding Style & Naming Conventions

Follow existing TypeScript: two-space indentation, single quotes, semicolons, explicit interfaces, and type-only imports where appropriate. Use camelCase for functions/variables and PascalCase for classes/interfaces. Keep conversion pure and Obsidian integration in `main.ts`. Preserve Traditional Chinese user-facing text. No formatter or linter is configured; avoid unrelated reformatting.

## Testing Guidelines

Name suites `tests/<module>.test.ts`. Use Vitest, jsdom for DOM tests, and the Obsidian stub. Run a focused suite with `npm test -- tests/importer.test.ts`. No numeric coverage threshold is configured. Add behavioral regression tests for conversion or write-path changes, including byte preservation, repeat imports, conflicts, backup failures, and races. Author expected fixtures independently. Record real-device results in `docs/compatibility.md`; simulations do not establish runtime compatibility.

## Commit & Pull Request Guidelines

History includes `feat: implement Obsidian Pages importer MVP`; use concise imperative summaries with appropriate prefixes such as `feat:` or `fix:`. PRs should describe behavior, link issues, report validation, and include sanitized UI screenshots. Keep package and manifest versions aligned.

## Import Safety

Preserve source bytes and ambiguous references. Default HTML fences to `html-source`; executable `html` requires explicit trust. Render previews through `textContent`. Retain vault-path validation, backup-before-replacement, and atomic conflict checks. Publish authored fixtures with fictional IDs; keep original exports, screenshots, Page URLs and source IDs outside Git. Run `npm run check:public` before publishing.
