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

## Required format: compact v3 markers

Use v3 for every pair this skill creates or updates, with no v1/v2 fallback. Keep only the figure ID in the body:

```text
<!-- gpt-pages:figure id=chart-a -->
```

Move the complete native reference and checksum to the document footer, immediately before the complete HTML fence:

```text
<!-- gpt-pages:source v=3 id=chart-a ref=ACTUAL_NATIVE_FILE_ID sha256=ACTUAL_64_LOWERCASE_HEX -->
```

The footer source marker declares v3. Do not add `v=3`, `ref` or `sha256` to the body marker, or invent shorthand such as `gpt-pages:chart-a`. Shared rules for IDs, references, source bytes, fences and adjacency appear below.

```sh
node <skill-dir>/scripts/build_figure_pair.mjs chart-a ACTUAL_NATIVE_FILE_ID canonical.html
```

## Source block and shared rules

Put the tool-returned native visualization Markdown immediately after the compact figure marker, separated only by blank lines. The current importer requires an image URI exactly equal to `visualize:<file-id>`. The footer's `ref` is that actual file ID without the `visualize:` prefix. A `library-file:` or other URI is not an interchangeable pairing reference: preserve it, report unsupported pairing and check the target parser rather than rewriting the scheme or claiming compatibility. Do not substitute a Page ID, filename or invented ID. If native chart creation is unavailable, deliver a draft and disclose the missing pairing instead of fabricating a successful reference.

Each footer source has the following shape. Replace `COMPLETE_HTML_BYTES` with the complete document. The helper chooses the actual fence length.

````text
<!-- gpt-pages:source v=3 id=chart-a ref=ACTUAL_NATIVE_FILE_ID sha256=ACTUAL_64_LOWERCASE_HEX -->

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
- If source contains backticks, use an outer fence longer than the longest consecutive backtick run, with at least three backticks. Complete HTML includes chart data, styles, initialization, interactions and explicit dependency URLs. Fixed-version HTTPS CDN libraries are allowed; preserve their URLs unchanged and record the network requirement. The HTML checksum does not validate downloaded library bytes. An explicitly requested offline figure must instead embed its dependencies and fit the active size limits; see [libraries.md](libraries.md).

Generate markers with the helper rather than calculating hashes manually. It only generates v3; the optional `--v3` flag is retained for existing callers and requests for legacy versions fail. Use the JSON string values as Markdown; obtain the native chart from Pages' visualization tool. Submit the same canonical HTML to that tool. If its source readback differs, resolve the difference before generating markers.

## Format compatibility boundaries

The importer may retain support for legacy exports; this skill must not generate v1/v2. When an authorized edit updates a legacy pair, migrate both markers to v3 together. A format-only migration preserves the figure ID, actual reference, HTML bytes and checksum. If HTML changes, retain the figure ID but create/update its native visualization and regenerate metadata from the actual reference and new canonical bytes. Do not migrate only half a pair, mix fields or omit metadata arbitrarily. Leave unrelated pairs outside the requested edit alone.

Check the target importer, format contract and behavioral tests when compatibility validation is in scope. An unknown installed version means compatibility is unverified; a known older parser requires a v3-capable importer. Neither case permits a v2 fallback or an unauthorized installation/update. Authoring v3 can proceed, but do not claim target import or runtime validation without evidence. Do not invent syntax or claim short markers will be hidden in the Page.

## Ordinary export and rendering-trust tests

The plugin obtains complete HTML from exported Markdown. Only after successful verification does it move the source fence to the native chart position and clean the matching marker and native image reference. Hash mismatches, missing/incomplete sources, duplicate IDs or reference mismatches must preserve the relevant original content and produce warnings. Do not remove every image that appears broken.

For ordinary Page export, keep the footer fences labeled `html`. Manual import defaults to `html-source`; executable `html` requires explicit user trust. Automatic folder cleanup preserves existing fence languages by default, so an existing `html` block may already render and cannot prove that trust gates conversion. Disabling conversion does not undo previously enabled HTML.

For an automatic-cleanup trust test, create a separate Markdown copy of the verified actual export. Change only each top-level HTML source fence's language to `html-source`; preserve its delimiter, payload bytes, line endings, v3 markers, references and hashes. Do not change the ordinary Page or globally replace `html` inside payloads. Follow the separate before/after/cancel checks in [validation.md](validation.md#automatic-cleanup-trust-test).

Do not automatically confirm trust, install or enable a renderer. SHA-256 establishes source consistency, not source safety or authorization to execute it.

## Acceptance

1. Each created or updated figure has one real native chart, one compact ID-only figure marker, one same-ID complete v3 footer source marker and a complete `html` fence. Data and interactions match.
2. Native sources, Page readback and actually downloaded Markdown have matching HTML bytes and hashes. All source blocks follow the body.
3. No placeholders, fabricated native references, extra source-section headings or empty subheadings remain. Preserve subject headings, prose and other images.
4. If plugin validation is available, check restored positions, cleanup limited to valid pairs, preservation of ambiguity and repeat processing without duplication. Do not modify the plugin merely to generate a Page.
5. Report the ordinary-export and separate trust-test workflows distinctly, with rendering, interactions, trust dialogs and real Obsidian results as separate evidence layers. See [validation.md](validation.md). Explicitly mark download, device or trust validation as untested when unavailable.
