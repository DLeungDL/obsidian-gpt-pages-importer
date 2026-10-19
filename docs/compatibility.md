# Compatibility and Acceptance Record

**English** · [繁體中文](compatibility.zh-TW.md)

This is a record of specific test runs, including historical failures and later fixes. Counts, versions and hashes below describe those runs; they are not claims that every check was repeated for the latest release.

## 0.1.6 v3 authoring skill and separate trust validation

On 2026-10-19, the updated authoring skill and helper enforce v3 for new or updated pairs, including default invocations, and reject explicit legacy requests. Ordinary Page sources remain `html`; automatic-cleanup trust tests use a separate `html-source` copy with matching HTML bytes/checksums. Instructions require saving settings after user-confirmed folder trust and use the current importer's exact `visualize:` reference scheme. Legacy v1/v2 importing is unchanged.

Release validation covers 327 Vitest tests in 20 suites, 10 Python export-verifier tests, lint, typechecking, packaged-bundle loading and reproducible installation assets. Regression cases cover default/explicit v3 generation, legacy rejection, fence conversion before/after the trusted flag, repeat processing, exact BOM/CRLF preservation and hash mismatches in a separate test copy. The installed local skill and repository skill were compared byte for byte across all eight files. No new Page export, browser interaction, Obsidian rendering or human trust-dialog run was performed for this release; the automated checks do not replace those runtime layers.

The release preflight's `npm audit --omit=dev` reported no known production-dependency advisories. The full audit reported six development-tool findings (four moderate, two critical); dependency versions were unchanged. Passing the release checks is not a claim that the development dependency audit is clean.

## Public interfaces and automated checks

The inspected Polyglot Renderer [README](https://github.com/Nimaapr/polyglot-renderer) and [manifest](https://github.com/Nimaapr/polyglot-renderer/blob/main/manifest.json) describe `html` fences, inline rendering and a minimum Obsidian version of 1.5.0. This plugin produces publicly supported fences, uses no private renderer APIs and does not bundle the renderer. The documented iframe uses `allow-scripts`; an opaque origin does not establish network isolation.

The recorded automated check on 2026-10-17 used Node.js 24.15.0, npm 11.12.1 and Obsidian SDK types 1.13.1. At that stage, `npm run check` ran the public-data check, TypeScript, esbuild, a packaged-bundle smoke check without a DOM and 108 Vitest tests. Complete dependency versions are in `package-lock.json`.

- Independent input/expected fixtures cover CommonMark fences, escaped references, Chinese/emoji/formulas/backslashes, CRLF/BOM and source bytes.
- v2 checks cover hashes, IDs/URIs/document boundaries, duplicate declarations, partial success, preservation on verification failure, idempotence and synchronous v1 compatibility.
- Successful pairing removes markers/native image references while preserving prose, HTML bytes and an opening BOM. Old notes retaining markers are backed up before re-import cleanup, and local edits still block replacement. That change added 12 regression tests.
- Import lifecycle checks cover creation, re-imports, backups, local edits, races and backup/record-save failures.
- Obsidian API simulations cover invalid UTF-8, paths, size limits and non-executing text previews.
- The BOM fix added 10 regression cases: LF/CRLF/double BOM, existing records, source BOM additions/removals with exact backups/hashes, local BOM conflicts and atomic-write races after backup. The host double now reflects real `Vault.read()` BOM stripping. Eight new cases failed before the fix; all passed afterward.

Simulations, SDK types and jsdom do not establish real desktop compatibility. The public-data check covers this repository's source-identifier patterns and evidence-directory rules; it is not a general secret scanner.

## Real Linux desktop results

On 2026-10-14, the maintainer ran official Obsidian 1.14.4 and Polyglot Renderer 1.3.0 on Debian GNU/Linux 13.6 x86_64 with an Xorg virtual display. Embedded versions were Electron 43.7.7, Chromium 150.0.7871.250 and Node.js 24.21.0. Playwright/CDP drove the real UI, Vault API and iframes, without stubs or jsdom. Launch flags were `--no-sandbox --disable-gpu`; the outer Electron sandbox and GPU were not validated.

| Stage | Maintainer-reported result |
| --- | --- |
| Baseline MVP desktop validation | 19 passed, 1 BOM failure; covered importing, re-importing, backups, races/conflicts, size/path/UTF-8 rejection and restart |
| Baseline MVP with an actual v1 UI export | 13 passed, 1 unsupported native-reference pairing; complete HTML rendered after explicit trust |
| Test copy with explicit v2 bindings | 15 passed; two figures paired, hash/ID mismatches preserved and both tested rendering modes worked |
| Service source saved with v2 metadata | 4 passed: both markers saved, other content preserved, correct hashes and idempotence |
| Fresh actual v2 UI export | 15 passed: original unchanged, 2 pairs, exact HTML bytes, slider/reset, re-imports/backups/conflicts |

The [result summary](evidence/validation-summary.json) excludes source identifiers. [Public fixture notes](evidence/README.md) (Traditional Chinese) describe fictional-ID fixtures. Original exports, readbacks, operation receipts and screenshots remain outside the repository, so public artifacts cannot independently verify every desktop step.

### BOM re-import false conflict: baseline and fix

A generic Markdown file saved with a UTF-8 BOM imported successfully, but an immediate re-import under the same source name incorrectly stopped writing. A full restart reproduced it. Disk bytes matched the saved `outputHash`, but real `Vault.read()` stripped the opening BOM while `Vault.readBinary()` retained it. `VaultStorage.read()` used the former, so hash comparison mistook unchanged content for a local edit. The original host double did not reflect that difference.

Those were pre-fix results. On 2026-10-17, reading changed to `Vault.readBinary()` with strict UTF-8 decoding (`fatal: true, ignoreBOM: true`), preserving BOM/line endings before hashing and backup. Existing atomic comparison through `Vault.process()` remains; real testing confirmed its callback receives the BOM-containing original. Existing output hashes were not migrated, and local BOM edits are not ignored. Old records remain usable; local BOM changes still block overwrites. Windows post-fix results follow. No Linux retest of the fixed version is claimed.

## Windows desktop acceptance

On 2026-10-17, Hong Kong time, a separate test vault on Windows 11 Home x64 (10.0.22631) ran a build from commit `bd5e0a7`. Obsidian was 1.14.4, with the existing 1.6.7 installer. Embedded versions were Electron 30.1.2, Chromium 124.0.6367.243 and Node.js 20.14.0; Polyglot Renderer was 1.3.0. The build environment used Node.js 24.15.0 and npm 11.12.1, and all 86 automated tests then in `npm run check` passed.

Core acceptance used the official Obsidian CLI to invoke registered import commands in the real Electron renderer, operate actual modals/File API and verify real Vault API/disk bytes, without stubs or jsdom. Supplementary checks used the native Windows file picker and mouse. Input was the repository-authored public v2 fixture with fictional IDs, not a fresh Pages UI download.

| Core acceptance check | Result |
| --- | --- |
| Plugin loading and import command registration | Passed |
| Two v2 pairs and a text-only preview without executable elements | Passed |
| First import matches independent expected bytes and output hash | Passed |
| Identical re-import performs no write, duplication or extra backup | Passed |
| Update fully backs up before replacement | Passed |
| Local edits and post-preview races block overwrites | 2 passed |
| Hash mismatch, native ID mismatch and duplicate figure IDs retain references | 3 passed |
| Invalid destination path, invalid UTF-8 and files over 20 MiB are rejected | 3 passed |
| First BOM import preserves disk bytes | Passed |
| Unmodified BOM re-import should be unchanged | **Failed: known false conflict reproduced; original not overwritten** |

Core total: 15 checks, 14 passed and 1 known failure. Five supplementary checks passed: native file selection paired 2 figures and wrote exact bytes; default `html-source` Reading view showed 2 source blocks without iframes; static labels/proportions rendered; moving the slider from 50 to 85 updated the value/bar; reset returned to 50. Rendering checks used a separate `html`-fence note derived from independent expected output, not an end-to-end trust-checkbox import. Both visible renderer iframes used `sandbox="allow-scripts"`; network isolation was not tested.

These are pre-fix Windows baseline results. Disk retained the BOM and matched `outputHash`, while `Vault.read()` omitted it, reproducing the Linux false-conflict behavior.

Original receipts, acceptance scripts, vault and screenshots stay outside the repository. The [public result summary](evidence/validation-summary.json) records environments, counts and limitations only. This run did not test a full application restart, importer trust-checkbox flow, other renderer modes or arbitrary Pages files; complete compatibility acceptance is not established.

### Windows BOM fix retest

On the same date and Windows/Obsidian environment, the separate test vault installed a working-tree fix built on `bd5e0a7` and was reloaded. Built and installed `main.js` SHA-256 both matched `6f6072abfb36c17df0d223f7f26ca632d0337001e33d2a0d5e2800497c3a210a`.

| Post-fix acceptance check | Result |
| --- | --- |
| All 15 core flows rerun, including the formerly failing identical BOM re-import | 15 passed |
| Previously imported BOM note needs no record migration or destination rewrite | Passed |
| BOM/CRLF first import, re-import, update backup and output hash | 2 passed |
| Adding/removing a source BOM updates after backup, then re-imports unchanged | 2 passed |
| Adding/removing a local BOM blocks replacement | 2 passed |
| Adding/removing a BOM after preview stops before backup | 2 passed |
| BOM addition/removal injected after backup but before real `Vault.process()` is rejected atomically; backup retained | 2 passed |
| Double opening BOM is preserved and re-imports unchanged | Passed |
| Vault reload loads persisted records and re-imports BOM/CRLF content unchanged | Passed |

All 28 real-device checks passed using actual modals, File/Vault APIs and disk bytes, without stubs/jsdom. An initial background UI wait exceeded five seconds; receipts were retained, the wait was extended and affected cases rerun with separate source names. Final results were 27 flow checks plus 1 vault-reload check. Public summaries exclude raw receipts. Earlier renderer mouse checks were not repeated; neither full application exit/restart nor the Linux fix was tested.

### Windows marker cleanup validation

On 2026-10-17, marker cleanup changes based on `a56bbe8` were built, installed and reloaded in the same separate vault. Built and installed `main.js` SHA-256 matched `33b49be1037e4db7cb3a7537adaa00f14ab13adbb45fc3b2615857c2a527c0f1`. All 8 checks passed:

| Acceptance check | Result |
| --- | --- |
| Actual runtime, loaded plugin and installed bundle hash | Passed |
| Public v2 fixture: both markers/native image references cleaned; safe preview matches independent output | Passed |
| Exact written bytes and recorded output hash | Passed |
| Identical re-import creates no write or backup | Passed |
| Hash mismatch preserves that metadata; valid neighboring pairs still clean | Passed |
| Native ID mismatch preserves marker/image reference | Passed |
| First-line marker cleanup retains opening BOM; re-import unchanged | Passed |
| Trusted rainwater example import: 2 visible renderer iframes, exact HTML, headings retained and no visible metadata/broken images | Passed |

The rainwater example used saved Page API readback, **not a fresh Pages UI export**. The actual display confirmed the bars and interactive initial state: 240 liters stored, 30 liters/day, 8 days available and 30 liters left after seven days. Slider/reset were not operated in this run. Original sources, scripts and receipts remain outside Git.

The first runtime diagnostic required a module unavailable in the CLI context, so no product checks ran in that attempt. After correction, the first 7 checks completed. The final rendering check initially counted a hidden cached iframe; it was corrected to inspect 2 visible iframes and verify distinct static/interactive sources. Final result: 8 passed. The renderer was unchanged.

### Windows import workflow improvements

On 2026-10-17, the same separate vault installed a working-tree build based on `fd16aca`. Final built/installed `main.js` SHA-256 matched `c6c8271a0d05b0b6cd71191ec5e228cd16a22d6d8a56ac325dab84780cf55321`. Build and 129 automated tests passed. Input was a copy of the user's preserved four-figure Markdown export; Pages was not re-exported.

| Real-device check | Result |
| --- | --- |
| Right-click import preloads the selected Markdown and shows filename/change-file controls | Passed |
| Preview shows 4 verified pairs, visible summary/confirmation and initially collapsed sources/assets | Passed |
| Returning to settings keeps the selected file; preview can be repeated without reselecting | Passed |
| Confirming closes preview and opens the correct destination | Passed |
| Disk output has no pairing/native image references; 4 HTML payloads match; original unchanged; record hash correct | Passed |
| Destination note no longer offers the current-note import command | Passed |

Default untrusted mode produced 4 `html-source` blocks; interactive execution was not retested. Drag/drop, trust reset when changing files, different source names/folders, unchanged/error/cancel flows are covered separately by automated tests, not claimed as Windows device checks. Export copy, operation summary and disk-verification receipts remain outside Git.

### Windows watched-folder in-place cleanup

On 2026-10-17, the same separate vault installed a working-tree build based on `fd16aca`, including import workflow improvements and automatic folder cleanup. Built/installed `main.js` SHA-256 matched `24c9d2e55ba6a488d31e6ab3b0f6cdbb23ade2df939f46a3c357c02b3b8ce38b`. Build and 163 automated tests passed.

Obsidian CLI invoked the installed plugin's settings and real Vault API using a public, authored two-figure v2 fixture with `html-source` fences. Test HTML was not executed. All 17 runtime checks passed, covering:

| Scope | Result |
| --- | --- |
| Correct test vault, initially disabled settings, immediate scan of existing/subfolder Markdown on enable | Passed |
| Real create/modify/rename events clean original files without changing paths | Passed |
| Repeated scans and the plugin's own modify events cause no redundant write/backup | Passed |
| Similar out-of-scope folder names, non-Markdown files and unknown markers remain unchanged | Passed |
| Backups match pre-write bytes; same filenames in different subfolders use distinct backup directories | Passed |
| HTML bytes, fence languages, current note and prior import records preserved; verified metadata removed | Passed |
| Files added after disabling are not processed; original disabled settings restored after testing | Passed |

Native Windows UI inspection confirmed folder input, initially disabled toggle, save and immediate-cleanup controls under **Settings → GPT Pages Importer**. Watching was not enabled through the GUI in this run; settings persistence and events were validated through real runtime APIs. Backup failure, concurrent edits, atomic protection during disable, invalid UTF-8 and size limits were covered by automated tests rather than device-level fault injection. Raw receipts, backups and test notes remain outside Git.

### Windows HTML rendering after automatic cleanup

On 2026-10-17, the same separate vault installed a working-tree build with folder trust confirmation. Built/installed `main.js` SHA-256 matched `26d99781f4d7df6239f88058e7f5717aa543bea9b34c2420d74c97e91ac4f8ee`. Build and 177 automated tests passed.

Obsidian CLI drove the installed plugin and real Vault API using a separate folder, the public v2 fixture and authored HTML without external dependencies. All 15 runtime checks passed, including:

| Scope | Result |
| --- | --- |
| Upgrade preserves folder/cleanup settings; new rendering option defaults off; API calls without confirmed folder trust are rejected | Passed |
| Default cleanup keeps `html-source`; explicit test-folder trust converts cleaned notes and newly added files to `html` | Passed |
| Exact HTML payloads/backups, no repeated-scan rewrites, out-of-scope sources and import records preserved | Passed |
| Authored proof note: renderer iframe source and execution-time `postMessage` receipt confirm actual HTML/JavaScript execution | Passed |
| Revoking rendering trust leaves future cleanup at `html-source` and preserves existing `html` | Passed |
| Original watched folder, enable setting and current note restored; rendering remains disabled | Passed |

Confirm/cancel/close behavior, folder changes requiring renewed trust, saving after confirmation and atomic protection when trust is revoked were covered by jsdom tests. This device run directly granted API trust for an authored test folder; it did not accept the GUI prompt for the user or enable rendering on the original watched folder. Raw receipts, backups and sources remain outside Git.

### Windows trust-confirmation button regression

On 2026-10-17, a user report of a non-working confirmation button was traced to installed Obsidian 1.14.4: `ToggleComponent.setValue` synchronously invokes `onChange` when the value changes. Updating the toggle after confirmation re-entered the flow that opened the trust dialog. The old double did not simulate programmatic changes firing events.

After correcting the double, 3 tests failed: existing trust cases and a new regression asserting that one confirmation closes the dialog without opening another. Guarding programmatic toggle updates made the build and all 178 tests pass. Automated checks also covered cancellation/close, reopening confirmation, not enabling before save and renewed trust after folder changes.

The fix was installed in the same vault; built/installed `main.js` SHA-256 matched `6b2a7297ecc8d9ed6a7e21c42b499b2e0317ff5886f47e2dd98b738b4fde17a4`. The real runtime reloaded the plugin with existing settings and unchanged `data.json` bytes. GUI acceptance of folder trust and actual rendering was left for the user to validate manually; button-flow evidence for this fix comes from automated tests above.

### Windows footer HTML pairing and plugin reload

On 2026-10-17, after the user moved five sources to the Page footer, preview still reported the old adjacent-complete-source warning and zero pairs. Plugin files on disk were updated, but the runtime still used the old version. Obsidian CLI unloaded/reloaded the existing plugin in the same separate Windows vault, confirming a new instance, stopped old instance and preserved watched-folder/trust settings. Loaded-file SHA-256 was `52945805db823265abfcf055e36f1754dcd1b218af3b7c04119ae8d665b311ce`.

Testing used five-figure Markdown actually downloaded through the Pages UI; original export and receipts remain outside Git.

| Real-device check | Result |
| --- | --- |
| Adding to the existing trusted folder triggers the installed create handler and pairs all 5 footer sources | Passed |
| Pairing/native image references removed; complete HTML restored to each body position; sections/footer text retained | Passed |
| All 5 HTML body hashes match the UI export; cleanup backup matches pre-write bytes | Passed |
| Existing folder trust converts the copy's 5 `html-source` fences to `html`; rescan causes no write/backup | Passed |
| Import core updates the original destination through real Vault API after a complete backup; record hash matches disk | Passed |
| Default untrusted plan still produces 5 `html-source` fences; identical trusted re-import is unchanged | Passed |

Automatic cleanup used installed event handlers. Destination update/re-import checks used the import core built from the same sources and real Vault API, not GUI preview/confirmation clicks. Windows automation could not focus the window; tools did not press trust confirmation or exercise five-chart controls. Existing trust settings and destination trust state remained intact.

### Windows compact v3 markers and footer checksums

On 2026-10-17, body figure markers were reduced to short IDs, with native references and SHA-256 in same-ID v3 source markers. Actual five-figure Pages UI Markdown paired all 5 figures and retained every HTML payload byte. Equivalent v2/v3 documents produced identical cleaned output. Added compact-format/generator/legacy re-import regression tests cover escaping, BOM/CRLF, reordered sources, duplicate/ambiguous pairings, hash failure, unavailable verification, default trust and local-edit protection.

The new plugin was installed and actually reloaded in the separate Obsidian 1.14.4 Windows vault. Loaded-file SHA-256 was `b2fb01dacf31ff360882d4349fae0d4f3558698e2b434e6eb3bffb7b8e6145d6`. Existing watched folder and user-granted rendering trust were unchanged.

| Real-device check | Result |
| --- | --- |
| Actual UI export retains 5 short body markers and 5 complete footer markers, without extra source-section headings | Passed |
| Real Vault create event triggers installed cleanup of 5 v3 pairs; complete HTML returns to each chart position | Passed |
| Native image references and both marker types removed; exact HTML bytes retained; exact pre-write backup exists | Passed |
| Existing trust converts 5 `html-source` fences to `html`; rescan creates no write/backup | Passed |
| Same-version import core reads through real Vault API, verifies 5 pairs and defaults to 5 `html-source` fences | Passed |

This run did not reconfirm trust through the GUI or operate the five charts' controls. Cleanup used installed handlers; import-plan checks used the built core and real Vault API. Existing destination notes were not overwritten. Original Page, exports, screenshots and service receipts remain outside Git.

## 0.1.5 bilingual interface and cleanup layout

The 0.1.5 bilingual interface was checked on 2026-10-19 with automated language/DOM tests and bundle-level host doubles. Coverage includes English/Traditional Chinese, unsupported-language fallback, modern API priority, missing/failed APIs and legacy storage, plain-text previews, explicit rendering trust in both settings UIs, and exact imported bytes/hashes across languages. The actual Obsidian 1.5.0 application has not been newly tested; host doubles do not establish real-device compatibility.

On 2026-10-19, the user reported successful manual language switching in the Windows Obsidian 1.14.4 test vault: English displays English, Traditional Chinese displays Traditional Chinese, and French/Japanese fall back to English. This is user-reported desktop validation, separate from the automated checks above.

The cleanup action layout fix was then installed and inspected in the native Traditional Chinese settings window: status text occupies a full row above the buttons. An in-app DOM layout probe with cloned controls, English labels and a long folder name passed at action-row widths of 580, 360 and 240 pixels: the status stays full-width, buttons stay below it, and no horizontal overflow occurs. Plugin settings and the enabled-plugin list retained their pre-update SHA-256 hashes. The build and all 324 automated tests passed.

## Not yet tested

| Area | Scope |
| --- | --- |
| Other Pages exporter versions, attachment packaging and visualization types | UI coverage limited to authored, self-contained static/interactive test Pages in v1/v2/v3 |
| Minimum Obsidian 1.5.0 and other runtimes | Tested 1.14.4 on Linux and the specified Windows runtime; others unverified |
| Other renderer versions and file view/embed/smart paste | Tested 1.3.0 inline; other combinations unverified |
| macOS, physical Linux GPU, Android/iOS | Unverified |
| Lossless import, safe execution or offline operation for arbitrary Pages/HTML | Not guaranteed |

## Manual end-to-end acceptance

1. Author generic content in your own test Page, with native static/interactive visualizations and complete HTML. Do not commit private Pages/exports.
2. Follow the [pairing contract](format.md), using actual file IDs and hashes. Export manually, keeping the date, UI version and original outside the repository. Inspect metadata, fences and HTML bytes.
3. Record OS/Obsidian/renderer versions and install in a separate vault. First verify default `html-source`, non-executing preview and text/HTML preservation.
4. Re-import without duplication; local edits must block replacement; updates of unchanged notes must create exact backups first.
5. Explicitly trust only inspected content you own. Check static charts, sliders, reset, localized text, assets and network behavior in Reading view/Live Preview.
6. Test hash/ID mismatches, duplicate IDs, missing sources, escaping and assets. Publish summaries and fictional fixtures only, run `npm run check:public` and keep original receipts/screenshots out of Git.

Actual v1/v2 UI exports, Linux importing and the specified Windows fixture scope were tested. Windows retests cover the BOM fix and marker cleanup, with later footer/v3 checks above. Other platforms and untested areas remain gaps; full compatibility acceptance cannot be marked complete.

## 0.1.3 community-review corrections

On 2026-10-17, the prepared 0.1.3 source passed Obsidian ESLint with zero warnings, all 255 Vitest tests and 8 Python export-verifier tests. Two builds produced byte-identical community assets. The 0.1.2 release mismatch was reproduced as 21 CRLF sequences in the license header; executable bytes were identical. New builds canonicalize these text bytes to LF.

A fresh real Obsidian 1.14.4 Linux vault verified manual import pairing (2 figures), plain-text preview, native settings-search results, confirmation/cancellation before rendering, save-before-application, nested watched-folder cleanup, exact backup and an unchanged outside-folder note. No renderer was installed for this run. The legacy settings UI remains covered by host-double tests; an older Obsidian desktop version was not newly tested.

The tag workflow now prepares only the supported three assets and requires GitHub build provenance before publication. No new tag, release, attestation or external scanner result is claimed yet. See the [release process](releasing.md) and [public summary](evidence/validation-summary.json).

## Simplified Chinese interface (development)

On 2026-10-20 (Hong Kong), the post-0.2.0 source passed all 441 Vitest tests, 10 Python export-verifier tests, TypeScript, the build smoke check and zero-warning Obsidian ESLint. Coverage includes Simplified Chinese locale aliases, complete translation keys/placeholders, all three UI languages, legacy/declarative settings trust flows, and unchanged imported bytes/hashes.

A fresh real Obsidian 1.14.4 vault on Debian 13.6 with an Xorg virtual display verified the app's `zh` language, Simplified Chinese commands/forms/renderer status, text-only preview, two paired figures, exact fixture output/hash and an unchanged re-import. Native settings search, cancelled rendering trust, explicit save and localized success status passed. Reloading the actual host switched between Traditional Chinese, English and Simplified Chinese. Screenshots and raw runtime evidence remain outside Git; only aggregate results are published. No renderer, older-host, mobile or new Pages-export validation is claimed. This feature is not part of the published 0.2.0 release.
