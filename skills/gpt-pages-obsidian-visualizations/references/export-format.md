# Standard export layout

Use this format for GPT Pages → Markdown → GPT Pages Importer when creating or updating a Page. A question about the format alone does not authorize Page edits.

## Layout and placeholders

The [standard template](../assets/page-export-template.md) is a layout blueprint, not publishable content. Use the Page's title field for its title. Start the body with an introduction, then repeat subject headings, explanations, figure markers and native charts as appropriate. Collect all complete HTML sources at the end, separated only by blank lines. Do not add source-section headings or export-validation instructions.

| Template field | Replacement |
| --- | --- |
| `INTRODUCTION` | The subject introduction readers need |
| `SUBJECT_HEADING`, `SUBJECT_DESCRIPTION` | Meaningful chart titles and descriptions of data or interactions |
| `FIGURE_MARKER_FROM_BUILDER` | The helper's `figure_marker` string |
| `EXACT_NATIVE_VISUALIZATION_MARKDOWN_FROM_TOOL` | The native tool's complete chart Markdown, unchanged |
| `OTHER_BODY_SECTIONS_BEFORE_ALL_SOURCES` | Remaining body sections and charts; omit for a single chart |
| `SOURCE_MARKDOWN_FROM_BUILDER` | The helper's `source_markdown` string for the same chart |
| `OTHER_SOURCE_BLOCKS_WITHOUT_APPENDIX_HEADINGS` | Remaining chart source blocks; omit for a single chart |

Remove unused placeholders and verify that no `{{...}}` remains before writing. Source blocks occupy space in the Page. This format does not promise to hide sources or automatically attach HTML when native charts are exported.

## Preferred format: compact v3 markers

Use v3 when support in the target plugin is confirmed. Keep only the figure ID in the body:

```text
<!-- gpt-pages:figure id=chart-a -->
```

Move the complete native reference and checksum to the document footer, immediately before the complete HTML fence:

```text
<!-- gpt-pages:source v=3 id=chart-a ref=ACTUAL_NATIVE_FILE_ID sha256=ACTUAL_64_LOWERCASE_HEX -->
```

The footer source marker declares v3. Do not add `v=3`, `ref` or `sha256` to the body marker, or invent shorthand such as `gpt-pages:chart-a`. Shared rules for IDs, references, source bytes, fences and adjacency appear below.

```sh
node <skill-dir>/scripts/build_figure_pair.mjs --v3 chart-a ACTUAL_NATIVE_FILE_ID canonical.html
```

## Compatible format: full v2 markers

The body figure marker has the following shape. Replace every uppercase field; do not use placeholders as actual metadata:

```text
<!-- gpt-pages:figure v=2 id=chart-a ref=ACTUAL_NATIVE_FILE_ID sha256=ACTUAL_64_LOWERCASE_HEX -->
```

Put the tool-returned native visualization Markdown immediately after the figure marker, separated only by blank lines. `ref` is the file ID from the native reference URI, without the `visualize:` or `library-file:` prefix. Do not substitute a Page ID, filename or invented ID. If native chart creation is unavailable, deliver a draft and disclose the missing pairing instead of fabricating a successful reference.

Each footer source has the following shape. Replace `COMPLETE_HTML_BYTES` with the complete document. The helper chooses the actual fence length.

````text
<!-- gpt-pages:source v=2 id=chart-a -->

```html
COMPLETE_HTML_BYTES
```
````

- Figure IDs match `[A-Za-z0-9_-]+` and must be unique within the document. The corresponding source uses the same ID. Prefer short, stable IDs such as `chart-a` and preserve them when updating content.
- Native file IDs match `[A-Za-z0-9_-]{1,256}`. If tool output or actual exports do not fit, stop claiming pairing compatibility and check the target parser.
- Source markers and source fences must be separate top-level blocks, separated only by blank lines. Do not nest them in lists, blockquotes or other code blocks, or insert headings or explanations between them.
- Sources may appear in a different order from body figures. Do not duplicate IDs or keep both an adjacent and a footer source for one figure. Do not infer pairings solely from titles, order or matching hashes.
- `sha256` is a 64-character lowercase hexadecimal digest covering the **complete HTML UTF-8 bytes** after the opening fence's newline and before the closing fence. It includes the HTML payload's BOM, CRLF and final newline, but excludes markers and fences.
- Preserve original source bytes without formatting, HTML entity decoding, global unescaping or newline normalization. The builder requires a final newline; if missing, add it to the canonical source before creating the native chart and hash.
- The builder accepts sources up to 256 KiB. For larger sources, check the target plugin's limits and adjust the design. Do not truncate a document.
- If source contains backticks, use an outer fence longer than the longest consecutive backtick run, with at least three backticks. Complete HTML should be self-contained, including chart data, styles and interactions.

Generate the figure marker and source block rather than calculating hashes manually:

```sh
node <skill-dir>/scripts/build_figure_pair.mjs chart-a ACTUAL_NATIVE_FILE_ID canonical.html
```

Use the JSON string values as Markdown; obtain the native chart from the visualization tool. Submit the same canonical HTML to that tool. If its source readback differs, resolve the difference before generating markers.

## Format compatibility boundaries

v2 puts `ref` and `sha256` in the figure marker, with only version and ID in the source marker. v3 uses a compact body marker and a complete footer source marker. Do not migrate only half a pair, mix fields or omit metadata arbitrarily.

Confirm support using the target parser, format contract and behavioral tests. Distinguish local development code from the user's installed version; use v2 without evidence of v3 support. Do not invent syntax, move metadata into unsupported fields or claim short markers will be hidden in the Page. Preserve an existing Page's valid format unless migration is requested or a new format is needed.

## Import and trust

The plugin obtains complete HTML from exported Markdown. Only after successful verification does it move the source fence to the native chart position and clean the matching marker and native image reference. Hash mismatches, missing/incomplete sources, duplicate IDs or reference mismatches must preserve the relevant original content and produce warnings. Do not remove every image that appears broken.

Manual import defaults to `html-source`; executable `html` requires explicit user trust. Automatic folder cleanup preserves existing fence languages by default. Disabling conversion does not undo previously enabled HTML. To test trust, use a separate test copy, change its source fence language from `html` to `html-source`, preserve all payload bytes and hashes, and confirm target-plugin support for that language label.

Do not automatically confirm trust, install or enable a renderer. SHA-256 establishes source consistency, not source safety or authorization to execute it.

## Acceptance

1. Each figure has one real native chart, one unique figure marker, one same-ID source marker and a complete HTML fence. Data and interactions match.
2. Native sources, Page readback and actually downloaded Markdown have matching HTML bytes and hashes. All source blocks follow the body.
3. No placeholders, fabricated native references, extra source-section headings or empty subheadings remain. Preserve subject headings, prose and other images.
4. If plugin validation is available, check restored positions, cleanup limited to valid pairs, preservation of ambiguity and repeat processing without duplication. Do not modify the plugin merely to generate a Page.
5. Report rendering, interactions, trust dialogs and real Obsidian results as separate evidence layers. See [validation.md](validation.md). Explicitly mark download or device validation as untested when unavailable.
