---
name: gpt-pages-obsidian-visualizations
description: "Prepare GPT Pages for Markdown export to Obsidian using Pages: native visualizations with mandatory v3 HTML pairing, portable raster image sources, and separate export and rendering validation. Use for portable Page visuals, images or reusable export layouts; not for live sync or general Obsidian configuration."
---

# GPT Pages to Obsidian: Standard Export Template

Keep readable, interactive native visualizations in the GPT Page body and complete HTML sources at the bottom for manual Markdown export to Obsidian. The importer uses pairing markers to move HTML back to each chart position and remove verified markers and native image references.

For native PNG/JPEG/GIF/WebP images requested in a single Markdown export, also follow [references/images.md](references/images.md). It defines a separate image asset v1 source fence, original-byte acquisition, programmatic Base64 generation and export verification. Ordinary native image references alone do not export the image bytes. Image source support requires an importer that implements this new contract; do not infer installed support from a checkout.

## Required dependency: Pages

The [Pages plugin](https://chatgpt.com/plugins/plugin_connector_1p_4a72ddeef4c481918f92d8e8df18fb2c?open_in_app) (`pages@openai-curated-remote`, invoked as `@Pages`) is required for creating or updating a Page with this skill. It provides the ChatGPT Space app's Page and native visualization tools.

- Confirm that Pages is enabled and connected, and discover its actual tools before starting Page operations. Use Pages tools to read, create and edit Pages, and its native visualization tool to create or replace charts. Typical tool names include `read_page`, `create_page`, `edit_page`, `patch_page` and `create_page_visualization`; namespace prefixes may vary by host.
- If the required Pages tools are unavailable, disconnected or lack access to the target Page, stop the dependent Page operation and explain what is missing. Do not substitute a local HTML/Markdown file, a chat draft, another provider or a fabricated native reference and report the Page as created or updated. Installing the skill or declaring its tool dependency does not itself connect Pages.
- Confirm successful Page operations through tool receipts and Page readback. Local source preparation and verification can proceed independently, but do not count as a completed Page operation.

## Core invariants

- **Two representations per figure:** include both a native Page visualization and a fenced code block labeled `html`. Do not replace the native chart with code, or deliver only a local HTML file while omitting the source from the Page.
- Maintain one canonical source per figure, including its data, formulas, labels and interaction logic. Submit the same complete HTML to the native visualization tool and place it unchanged in the footer. Generate markers only after receiving the tool's actual reference. Host colors may differ; data, calculations and event behavior must agree.
- **Clean layout:** the body contains subject headings, necessary explanations, figure markers and native visuals. The footer contains source markers and complete HTML fences, plus explicitly requested portable image source fences. Do not add an "Exportable HTML source" appendix heading, per-chart "HTML source" subheadings, empty sections or export instructions. Preserve meaningful existing prose and user-requested content.
- **Mandatory v3:** every figure pair created or updated by this skill must use compact v3 markers. Keep only the short ID in the body and put `ref` and `sha256` in the footer. Never fall back to v1/v2, including when target support is unknown. If the installed importer is unknown or lacks v3 support, report compatibility as unverified or requiring an update; do not claim successful import or change the installed plugin without authorization. New checkout code does not establish the installed version. SHA-256 verifies source consistency, not trust to execute code.
- Standalone HTML must be self-contained: a complete UTF-8 document with HTML/SVG, embedded data, CSS and any required inline JavaScript. Set fonts, background and text colors explicitly, with defaults for CSS variables. Do not depend on CDNs, remote fonts, external images, host CSS, private Page references or network APIs.
- Preserve existing content and user edits. Invoking this skill does not itself authorize Page edits, vault configuration changes, plugin installation, publishing or synchronization. Follow the current task's authorization.
- Write Page prose, labels and accessibility text in the user's requested language. English skill instructions do not require English output.

## Choose the workflow

| Purpose | Source fence and expected behavior |
| --- | --- |
| Ordinary Page authoring and export (default) | Keep complete `html` fences in the Page and its downloaded Markdown. Manual import defaults to non-executable `html-source`; executable `html` requires explicit trust. This is not a watched-folder trust test. |
| Automatic-cleanup rendering-trust test | First verify the ordinary export, then prepare a separate Markdown copy with top-level source fences changed to `html-source`. Keep the Page unchanged and preserve HTML bytes, v3 markers and checksums. Verify cleanup with rendering conversion off and saved, then verify conversion only after the user confirms folder trust and saves settings. |

For an unspecified demo, use ordinary export and identify trust-flow testing as outside the completed scope. When the user requests automatic-cleanup trust validation, prepare the separate test copy and follow [references/validation.md](references/validation.md#automatic-cleanup-trust-test). Existing `html` fences can already be rendered and cannot demonstrate that trust blocks rendering. Never accept a trust dialog on the user's behalf.

## Create or update a Page

1. Confirm the required Pages tools, then identify the requested Page, visualizations and output scope. Read an existing Page with Pages before designing suitable charts and interactions. For a new Page, use Pages' creation tool and read the result before inserting native visualizations. Do not treat a past example's chart count, subject, private IDs or local paths as fixed requirements.
2. Read [references/export-format.md](references/export-format.md) and use [assets/page-export-template.md](assets/page-export-template.md) as the layout blueprint. Choose chart count and interactions for the subject. [assets/weighted-sum.html](assets/weighted-sum.html) is an optional interactive starting point without private content. Replace every template placeholder before writing to the Page.
3. Keep existing native charts whose source and references still match, or create/update them with Pages' native visualization tool. Assign each figure a short ID unique within the document. Confirm its actual native image uses `visualize:<file-id>`, the URI supported by the current importer, and obtain its file ID without rewriting the URI scheme. Generate v3 pairs with the helper below. Migrate both markers of any legacy pair you update. A format-only migration preserves its ID, reference, source bytes and checksum; changed HTML requires a matching native visualization and regenerated pairing metadata. Do not alter unrelated pairs outside the requested scope. Put the figure marker immediately before its native chart. Put the same-ID source marker and complete `html` fence after all body content. Pair by ID, not title or order; do not substitute raw HTML for fences.
4. Read the latest Page again with Pages before writing. Use Pages' editing tools for guarded, local insertions or replacements with unique anchors and old-content or version preconditions. If an anchor is ambiguous or content has changed, re-read and rebuild the local edit. Do not rewrite the whole Page or automatically remove tests or references. If Pages tools cannot perform a safe local edit, stop that edit and explain the limitation; a draft is not a completed Page update.
5. Read back the result with Pages and check unique IDs, native references, SHA-256, HTML bytes, complete fences and figure/source counts. Confirm that no extra source-section headings or unreplaced placeholders were added. Check localized titles, formulas and ARIA text. `????` or replacement characters may indicate encoding damage; do not assume a font issue. Inspect UTF-8 bytes or Unicode code points when needed.
6. Verify Markdown actually downloaded from the Page. Self-assembled Markdown is not download evidence. If no downloaded file is available, state that the export layer remains untested.

## Export and Obsidian

Read [references/validation.md](references/validation.md) when checking exports, renderer compatibility or interaction acceptance. It covers evidence layers, common failures and primary sources.

- Previous native visualization/PNG exports have contained only `visualize:` or `library-file:` references. These references do not prove that source code or image bytes were exported. The HTML code block carries the portable source.
- v3 pairing uses HTML already in the exported Markdown; it does not connect to Pages to download it. Clean only successfully verified pairs. Preserve and report missing, duplicate, ambiguous or hash-mismatched content. Complete removal of visible clutter is not sufficient evidence of success. The importer's legacy-format support is not permission for this skill to generate v1/v2.
- Raw HTML has appeared as text, and exports may add Markdown escaping. Never strip backslashes across the document: doing so damages code, mathematics and paths.
- Prefer an available Polyglot Renderer already chosen by the user. It processes `html` code blocks. Native Obsidian raw HTML restricts scripts; CSS snippets and fenced `css`, `js` or `json` blocks are not interactive HTML renderers. JSON/YAML data does not automatically become a visualization.
- Execute only inspected, trusted source. Preserve the renderer's sandbox permissions. Do not add `allow-same-origin`, change vault settings or bypass restrictions with DataviewJS. A sandbox is not a complete network block or a general safety guarantee.
- Automatic folder cleanup preserves fence languages unless the user enables trusted rendering conversion. It does not disable existing `html` blocks; turning conversion off does not revert previously converted blocks. Follow the separate trust-test workflow above.
- Renderers add their own HTML/body wrapper, so test complete documents with representative samples. Record the Reading view and Live Preview modes, plugin versions and platforms actually tested. Do not hard-code a version as permanently "latest."

## Verification tools and delivery

[scripts/build_figure_pair.mjs](scripts/build_figure_pair.mjs) reads a complete HTML file, hashes its original bytes with SHA-256 and chooses a fence that cannot truncate the source. It requires Node.js and only generates v3. Its three positional arguments are the unique figure ID, the tool-returned native file ID and the HTML path:

```sh
node <skill-dir>/scripts/build_figure_pair.mjs chart-a ACTUAL_NATIVE_FILE_ID canonical.html
```

The optional `--v3` flag remains accepted for existing callers; omitting it also produces v3. v2 requests are rejected. Put the JSON output's `figure_marker` before the native chart and `source_markdown` in the footer. Parse the JSON and use its string values; do not paste JSON escape sequences literally into the Page. The helper neither creates native charts nor verifies that a reference belongs to a chart. HTML must retain its final newline. If any bytes are added or changed, regenerate the native chart and checksum. See the format reference for exact rules.

[scripts/verify_html_export.py](scripts/verify_html_export.py) uses the Python standard library to parse top-level `html` fences, preserve UTF-8 content and line endings, and report byte counts and SHA-256. For the separate trust-test copy, add `--language html-source`; `--expected` still reads the ordinary canonical/downloaded `html` Markdown. It can extract HTML and run `node --check` on inline JavaScript. It does not execute document scripts or verify rendering, network isolation or Obsidian behavior.

```sh
python <skill-dir>/scripts/verify_html_export.py downloaded.md --expected canonical.md --out extracted --node-check
```

Generate `canonical.md` from canonical sources and verify it against the Page readback first. Both files must contain HTML blocks in the same order. `--out` accepts only a new or empty directory and never overwrites files. The validation reference explains all options and exact-newline comparison limits.

Report the workflow used, v3 Page figure/source pairings, downloaded-source comparisons, JavaScript syntax checks, browser interactions, real Obsidian tests and folder-trust tests separately. Label each layer **agent-tested / user-reported / untested / failed** with corresponding evidence. Ordinary import or browser success does not establish folder-trust or Obsidian runtime success. You may quote a user's end-to-end success report accurately; do not promote it to independent agent verification across all platforms.
