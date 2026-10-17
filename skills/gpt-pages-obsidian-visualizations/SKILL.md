---
name: gpt-pages-obsidian-visualizations
description: "Generate standard GPT Pages for Markdown export to Obsidian: native visualizations in the body, paired complete HTML sources at the bottom, compatible markers, byte-preserving verification, and explicit rendering trust. Use when creating or updating portable Page visualizations or reusable export layouts; not for live sync or general Obsidian configuration."
---

# GPT Pages to Obsidian: Standard Export Template

Keep readable, interactive native visualizations in the GPT Page body and complete HTML sources at the bottom for manual Markdown export to Obsidian. The importer uses pairing markers to move HTML back to each chart position and remove verified markers and native image references.

## Core invariants

- **Two representations per figure:** include both a native Page visualization and a fenced code block labeled `html`. Do not replace the native chart with code, or deliver only a local HTML file while omitting the source from the Page.
- Maintain one canonical source per figure, including its data, formulas, labels and interaction logic. Submit the same complete HTML to the native visualization tool and place it unchanged in the footer. Generate markers only after receiving the tool's actual reference. Host colors may differ; data, calculations and event behavior must agree.
- **Clean layout:** the body contains subject headings, necessary explanations, figure markers and native visuals. The footer contains only source markers and complete HTML fences. Do not add an "Exportable HTML source" appendix heading, per-chart "HTML source" subheadings, empty sections or export instructions. Preserve meaningful existing prose and user-requested content.
- **Compatible format:** use compact v3 markers for new Pages only when the target plugin's support is confirmed. Keep only the short ID in the body and put `ref` and `sha256` in the footer. Otherwise use full v2 markers. New code in a local checkout does not establish which version the user has installed. SHA-256 verifies source consistency; it does not establish trust to execute code.
- Standalone HTML must be self-contained: a complete UTF-8 document with HTML/SVG, embedded data, CSS and any required inline JavaScript. Set fonts, background and text colors explicitly, with defaults for CSS variables. Do not depend on CDNs, remote fonts, external images, host CSS, private Page references or network APIs.
- Preserve existing content and user edits. Invoking this skill does not itself authorize Page edits, vault configuration changes, plugin installation, publishing or synchronization. Follow the current task's authorization.
- Write Page prose, labels and accessibility text in the user's requested language. English skill instructions do not require English output.

## Create or update a Page

1. Identify the requested Page, visualizations and output scope. Read the latest Page before designing suitable charts and interactions. Do not treat a past example's chart count, subject, private IDs or local paths as fixed requirements.
2. Read [references/export-format.md](references/export-format.md) and use [assets/page-export-template.md](assets/page-export-template.md) as the layout blueprint. Choose chart count and interactions for the subject. [assets/weighted-sum.html](assets/weighted-sum.html) is an optional interactive starting point without private content. Replace every template placeholder before writing to the Page.
3. Keep existing native charts whose source and references still match, or create/update them with the available tools. Assign each figure a short ID unique within the document and obtain its file ID from the actual native reference. Choose v3 or v2 according to the target plugin's support, then generate the figure marker and source block with the helper below. Put the figure marker immediately before its native chart. Put the same-ID source marker and complete `html` fence after all body content. Pair by ID, not title or order; do not substitute raw HTML for fences.
4. Read the latest Page again before writing. Use guarded, local insertions or replacements with unique anchors and old-content or version preconditions. If an anchor is ambiguous or content has changed, re-read and rebuild the local edit. Do not rewrite the whole Page or automatically remove tests or references. If tools cannot perform safe local edits, provide an insertable fragment and explain the limitation.
5. Read back the result and check unique IDs, native references, SHA-256, HTML bytes, complete fences and figure/source counts. Confirm that no extra source-section headings or unreplaced placeholders were added. Check localized titles, formulas and ARIA text. `????` or replacement characters may indicate encoding damage; do not assume a font issue. Inspect UTF-8 bytes or Unicode code points when needed.
6. Verify Markdown actually downloaded from the Page. Self-assembled Markdown is not download evidence. If no downloaded file is available, state that the export layer remains untested.

## Export and Obsidian

Read [references/validation.md](references/validation.md) when checking exports, renderer compatibility or interaction acceptance. It covers evidence layers, common failures and primary sources.

- Previous native visualization/PNG exports have contained only `visualize:` or `library-file:` references. These references do not prove that source code or image bytes were exported. The HTML code block carries the portable source.
- v2/v3 pairing uses HTML already in the exported Markdown; it does not connect to Pages to download it. Clean only successfully verified pairs. Preserve and report missing, duplicate, ambiguous or hash-mismatched content. Complete removal of visible clutter is not sufficient evidence of success.
- Raw HTML has appeared as text, and exports may add Markdown escaping. Never strip backslashes across the document: doing so damages code, mathematics and paths.
- Prefer an available Polyglot Renderer already chosen by the user. It processes `html` code blocks. Native Obsidian raw HTML restricts scripts; CSS snippets and fenced `css`, `js` or `json` blocks are not interactive HTML renderers. JSON/YAML data does not automatically become a visualization.
- Execute only inspected, trusted source. Preserve the renderer's sandbox permissions. Do not add `allow-same-origin`, change vault settings or bypass restrictions with DataviewJS. A sandbox is not a complete network block or a general safety guarantee.
- Manual import defaults to `html-source`; executable `html` requires explicit trust. Automatic folder cleanup does not itself enable rendering, nor does it disable existing `html` blocks. To test the trust flow, use a separate `html-source` test copy and change only the fence language, preserving HTML bytes and checksums. This skill must not automatically accept trust dialogs.
- Renderers add their own HTML/body wrapper, so test complete documents with representative samples. Record the Reading view and Live Preview modes, plugin versions and platforms actually tested. Do not hard-code a version as permanently "latest."

## Verification tools and delivery

[scripts/build_figure_pair.mjs](scripts/build_figure_pair.mjs) reads a complete HTML file, hashes its original bytes with SHA-256 and chooses a fence that cannot truncate the source. It requires Node.js. Its three positional arguments are the unique figure ID, the tool-returned native file ID and the HTML path. After confirming v3 support:

```sh
node <skill-dir>/scripts/build_figure_pair.mjs --v3 chart-a ACTUAL_NATIVE_FILE_ID canonical.html
```

Omit `--v3` for v2 output. Put the JSON output's `figure_marker` before the native chart and `source_markdown` in the footer. Parse the JSON and use its string values; do not paste JSON escape sequences literally into the Page. The helper neither creates native charts nor verifies that a reference belongs to a chart. HTML must retain its final newline. If any bytes are added or changed, regenerate the native chart and checksum. See the format reference for exact rules.

[scripts/verify_html_export.py](scripts/verify_html_export.py) uses the Python standard library to parse top-level `html` fences, preserve UTF-8 content and line endings, and report byte counts and SHA-256. It can compare against canonical Markdown, extract HTML and run `node --check` on inline JavaScript. It does not execute document scripts or verify rendering, network isolation or Obsidian behavior.

```sh
python <skill-dir>/scripts/verify_html_export.py downloaded.md --expected canonical.md --out extracted --node-check
```

Generate `canonical.md` from canonical sources and verify it against the Page readback first. Both files must contain HTML blocks in the same order. `--out` accepts only a new or empty directory and never overwrites files. The validation reference explains all options and exact-newline comparison limits.

Report completed Page figure/source pairings, downloaded-source comparisons, JavaScript syntax checks, browser interactions and real Obsidian tests separately. Label each layer **agent-tested / user-reported / untested / failed** with corresponding evidence. You may quote a user's end-to-end success report accurately; do not promote it to independent agent verification across all platforms.
