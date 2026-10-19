# GPT Pages Importer User Guide

**English** · [繁體中文](usage.zh-TW.md)

Import ChatGPT Pages Markdown into Obsidian while preserving complete, portable HTML sources. The plugin provides text-only change previews, asset reports, repeat imports, backups and conflict protection. You can also watch a vault folder to clean verified markers and native image references in place. Polyglot Renderer is an optional companion plugin and is not bundled.

The plugin supports compact v3 markers, footer HTML sources and v1/v2 compatibility. Earlier adjacent-v2 desktop validation with Obsidian 1.14.4 and Polyglot Renderer 1.3.0 passed 15 checks, covering two-figure pairing, slider/reset behavior, re-imports, backups, conflicts and hash/ID mismatches. Footer and compact-marker regression tests and later real-device checks are recorded in the [compatibility record](compatibility.md); do not infer coverage beyond those records.

The [authoring skill](../skills/gpt-pages-obsidian-visualizations/SKILL.md) shipped with 0.1.6 generates only v3 pairs; unknown target versions do not permit a v2 fallback. Update the complete skill folder in the AI agent separately from the plugin. Ordinary Page exports contain `html` sources. For watched-folder rendering-trust validation, use a separate `html-source` copy with identical source bytes/checksums, then confirm trust and select **Save settings** before testing conversion. The skill's [validation guide](../skills/gpt-pages-obsidian-visualizations/references/validation.md#automatic-cleanup-trust-test) distinguishes those workflows.

v2 binds an actual native file ID to the complete HTML's SHA-256. Verified markers and native image references are removed, including observed Pages escaping, to avoid escaped metadata and broken-image text. The public repository contains authored fixtures with fictional IDs and [result summaries](pages-roundtrip.md); original exports, screenshots and source identifiers stay outside Git. Unbound v1 native references remain and produce warnings. The UTF-8 BOM false-conflict bug is fixed: hashes and backups preserve BOM and line endings, while local BOM additions/removals still count as edits. See the compatibility record for actual test scope.

## Installation, build and tests

Install **GPT Pages Importer** from the [Obsidian Community directory](https://community.obsidian.md/plugins/gpt-pages-importer), or download the installation files from [GitHub Releases](https://github.com/DLeungDL/obsidian-gpt-pages-importer/releases/latest).

To build from source, use Node.js 24 and npm:

```sh
npm ci
npm run check
```

`check` runs the public-data check, TypeScript, esbuild and Vitest. Installation files are packaged in `dist/gpt-pages-importer/`: `main.js`, `manifest.json`, `styles.css` and license notices. Copy that directory to the test vault's `.obsidian/plugins/` and enable **GPT Pages Importer** in Community plugins. The minimum API target is Obsidian 1.5.0; desktop runtime 1.14.4 has been tested, but the minimum version has not. CI also uploads build artifacts.

## Manual export and import

On Obsidian 1.8.7 and later, the interface follows Obsidian's language: English or Traditional Chinese (`zh-TW`), with English as the fallback for other languages. After changing Obsidian's language, follow its reload prompt; the plugin reads the selected language on load through the public `getLanguage()` API. Obsidian 1.5.0–1.8.6 uses English. A missing, invalid or failed language API also defaults to English, without accessing browser storage. The minimum supported Obsidian version remains 1.5.0. Note contents, HTML, paths and hashes are not translated. The steps below include both language labels for reference.

1. Export Markdown manually from Pages. The plugin does not perform synchronization, OAuth, scraping or undocumented API access.
2. If the original export is already in the vault, right-click it and choose **使用 GPT Pages Importer 匯入** ("Import with GPT Pages Importer"), or open it and run **GPT Pages Importer: 匯入目前筆記** ("Import current note"). For external files, use the ribbon import icon or **GPT Pages Importer: 匯入 Pages Markdown** ("Import Pages Markdown"), then select or drop one UTF-8 `.md`/`.markdown` file, up to 20 MiB. Invalid UTF-8 stops the import; other encodings are not guessed.
3. The source name defaults to the filename. Expand **來源與目的地（進階設定）** ("Source and destination (advanced)") to set a stable custom name or destination folder. Different Pages need different source names even if filenames match; reuse the same name when re-importing one Page. This is not a Page API ID. New destinations default to `GPT Pages/name-sourceHash.md` and remain fixed after the first import.
4. Select **預覽** ("Preview"). Review the destination, status, verified figure count and warnings; expand source and asset reports if needed. Select **確認寫入** ("Confirm import") below the summary to proceed. **返回設定** ("Back to settings") preserves the file and fields. A successful import opens the destination in the current pane; **完成（無變更）** ("Done (no changes)") also opens it. The original export remains unchanged. Previews display plain text rather than rendering source Markdown/HTML. Attachments are not copied or downloaded; inspect reported assets yourself.
5. Local destination edits or an unknown existing file stop replacement. Cancel and merge manually, or save under a new source name. There is no force-overwrite shortcut.

New sources may use a custom destination folder. Absolute paths, `..`, hidden directories and cross-platform special characters are rejected. Changing the folder field for an existing source does not move its note. Manually moving a destination invalidates its stored mapping; preserve your data and handle the record manually, or use a new source name.

Tracked destination notes do not offer the current-note or right-click import entry points, preventing duplicate imports of already-cleaned notes. Choosing a different source file resets trust. Every newly opened import dialog starts without HTML trust.

## Automatic folder cleanup

1. Create a vault folder, for example `Pages Inbox`.
2. Open **Settings → GPT Pages Importer**. Enter the folder under **自動清理資料夾** ("Watched folder"), turn on **啟用自動清理** ("Enable automatic cleanup") and select **儲存設定** ("Save settings"). Cleanup is off by default and no folder is chosen automatically.
3. Enabling first processes existing Markdown in that folder and its subfolders. Added, modified or moved `.md`/`.markdown` files are then checked after about one second. You can add multiple files without confirming each one. Reloading the plugin also rescans.

This is **in-place cleanup**: original paths, filenames and the currently open note are preserved. No separate destination is created, and source names are not used. Before each actual modification, the complete original is backed up under `GPT Pages Backups/cleanup/pathHash/time-random.md`. Duplicate events/scans do not rewrite cleaned content or create redundant backups. Backup failure, invalid UTF-8, files larger than 20 MiB or concurrent edits stop that file's write and produce a notice; other files continue.

Only successfully paired markers and native image references are removed. Ambiguous content, including hash/ID mismatches or missing source, remains and is reported. BOM, line endings and HTML body bytes are preserved. Each fence keeps its existing `html`/`html-source` language by default; existing `html` may still execute through an installed renderer. Backup folders and tracked manual-import destinations are excluded to protect backups and import hashes.

For rendering after cleanup, turn on **清理後啟用 HTML 渲染** ("Enable HTML rendering after cleanup"), which defaults to off. The trust dialog identifies the folder. Read it, select **我信任此資料夾內容，啟用** ("I trust this folder; enable rendering"), then save settings. Canceling or closing leaves rendering disabled. Changing the folder requires confirming trust again.

Folder trust covers **all HTML fences in all existing and future added/modified documents in that folder and its subfolders, including cleaned notes and unpaired blocks**. `html-source` becomes `html`; ambiguous markers/references remain. Each conversion is backed up, and repeated scans do not rewrite unchanged files. Install and enable Polyglot Renderer separately; the importer does not change renderer settings. JavaScript may execute immediately and make external network requests. Verified pairing is not a safety guarantee. Disabling rendering stops future conversions but does not revert existing `html`; disable cleanup and the renderer before restoring backups.

Use **立即清理資料夾** ("Clean folder now") in settings or **GPT Pages Importer: 立即清理指定資料夾** ("Clean watched folder now") to rescan. Saving disabled cleanup cancels pending items. Cleanup runs only while Obsidian and the plugin are running and does not fetch from Pages. Disable cleanup before restoring a backup so the restored note is not immediately cleaned again.

## HTML and the optional renderer

Manual import changes all CommonMark HTML fence languages to `html-source` by default, preserving code body bytes and preventing automatic Polyglot Renderer execution. In-place cleanup preserves existing languages by default; conversion to `html` requires explicit folder trust and saved rendering settings. Without a renderer, sources can still be read and saved. Standard Obsidian does not provide interactive HTML execution from these fences.

After inspecting the entire document, select **我信任這份內容，允許 renderer 執行 HTML／JavaScript** ("I trust this content and allow the renderer to run HTML/JavaScript") to output the [publicly supported Polyglot Renderer `html` fence](https://github.com/Nimaapr/polyglot-renderer). Its inline rendering defaults to on and may execute content immediately on write or reading. **Trust covers every HTML fence in the document, including unpaired blocks.** Disable the renderer before re-importing previously enabled content to avoid immediate execution in reading mode.

The renderer is installed independently. This plugin uses no private renderer APIs and does not change its settings automatically. Published renderer documentation describes an `allow-scripts`, opaque-origin iframe; this does not guarantee network isolation. Scripts, external images, fonts and libraries can make network requests. The importer has no executable preview, is not a general HTML sanitizer and cannot control how other plugins execute raw HTML. Leave trust disabled for unknown content.

## Format, preservation and fallback

The [v3 format contract](format.md) puts only `<!-- gpt-pages:figure id=FIGURE_ID -->` and the adjacent native image in the body. Complete HTML sources go at the bottom, each preceded by `<!-- gpt-pages:source v=3 id=FIGURE_ID ref=NATIVE_FILE_ID sha256=64_LOWERCASE_HEX_DIGEST -->`, with only blank lines between marker and fence. Unique IDs, exact references and SHA-256 must verify before the importer moves the complete fence back to its figure position and removes both markers and the image reference. Missing, duplicate or ambiguous sources remain and produce warnings. Extra source headings are unnecessary. Existing HTML trust, backup and conflict protections still apply; no Page download is performed.

Create a native visualization from the same HTML, obtain its file ID, then generate both markers:

```sh
node scripts/figure-marker.mjs --v3 example-chart NATIVE_FILE_ID source.html
```

Pages does not add these fields automatically. Only verified pairs are cleaned. Hash mismatches, duplicate IDs, unknown versions and missing/incomplete sources remain with warnings. Legacy standalone v1, adjacent v2 and footer v2 remain supported. Omitting `--v3` generates the original v2 marker. Unbound native images are not paired by guesswork.

CommonMark parsing identifies markers/URIs and removes only verified metadata. Section headings and ordinary captions remain; backslashes are not globally removed. Preserve localized text, UTF-8, formulas, HTML entities and HTML/CSS/JavaScript code body bytes. Hashes include line endings and BOM. Pairing does not imply safety or trust. Default fence-language changes prevent automatic renderer execution. Re-importing an older note with the same source name backs it up before marker cleanup; local edits still stop replacement.

## Re-imports, backups and recovery

- A stable source name maps to a fixed destination. Records live in plugin `data.json` and track the last output with SHA-256.
- Re-importing identical content does not add files or blocks. Local edits trigger conflict protection even when they happen to equal the new source output.
- Before replacing a destination, write a complete backup under `GPT Pages Backups/sourceHash/time-random.md`. Backup failure stops the write. Backups may contain `html` fences; disable the renderer before reading or restoring them.
- After preview, content is checked again and replaced through Obsidian `Vault.process`, which protects concurrent local edits. New files use `Vault.create` without overwriting existing paths.
- To restore, disable cleanup if relevant and disable the renderer, then manually copy the backup to the destination. Re-import may conflict with the recorded baseline afterward; preserve both versions and merge manually or use a new source name.
- Damaged or unknown-version `data.json` stops import command registration. A record-save failure after writing is reported explicitly. Do not delete records to force a retry; inspect the destination and backups first.

## Examples and development resources

- [Static example](../examples/static.md) and [interactive example](../examples/interactive.md): authored generic content, not private data or actual Pages export evidence.
- `tests/fixtures/`: inputs and independently authored expected outputs. The escaped v2 fixture uses generic test IDs and observed UI syntax; it is not a fresh download.
- [GPT Pages to Obsidian skill](../skills/gpt-pages-obsidian-visualizations/SKILL.md): the main authoring skill defaults to Plotly.js charts and MathBox mathematical animations with pinned CDN dependencies. The folder includes mandatory v3 marker generation, footer templates, CDN-backed and self-contained examples, and an export-source verifier that inventories dependencies without fetching them. CDN-backed graphs require network access; HTML hashes do not cover remote library bytes. Follow its layered acceptance guidance for actual downloads and Obsidian rendering.
- `src/convert.ts`: pure conversion, asynchronous v2/v3 verification and asset scanning; `src/hash.ts`: UTF-8 hashes; `src/importer.ts`: storage-independent planning/writing; `src/cleanup.ts`: in-place cleanup, backups and event queue; `src/cleanup-settings.ts`: watched-folder settings; `src/main.ts`: Obsidian commands/modals/events; `src/preview.ts`: non-executing previews.

This plugin does not provide cloud/bidirectional Pages sync, replace a renderer, guarantee safe execution of arbitrary HTML or guarantee compatibility with every Pages visualization. Other export versions and platforms require additional compatibility testing.
