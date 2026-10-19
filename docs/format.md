# Portable Figure Format: Compact v3 Markers with v1/v2 Compatibility

**English** · [繁體中文](format.zh-TW.md)

This contract is defined by this project; Pages does not automatically add binding metadata. v3 reduces the body marker to a figure ID and moves the complete native file reference and HTML SHA-256 digest to the document footer. Adjacent and footer v2 layouts and legacy v1 remain supported. The importer does not download native attachments, prove their contents match or reconstruct missing HTML.

Observed v1/v2 Pages UI exports have escaped markers as `\<!-- gpt-pages\:figure ... -->` and image URIs as `visualize\:file_id`. The public [v2 fixture](../tests/fixtures/v2-escaped.input.md) was authored from that syntax with fictional IDs; it is not an original export. Original exports, attachments and source identifiers stay outside Git. See the [public validation summary](pages-roundtrip.md) for scope.

## Compact v3 body markers and footer checksums

Use this layout for new Pages when target-plugin support is confirmed. Keep an adjacent short-ID marker and native chart in the body. Put a source marker with the same ID, actual native reference and digest before each complete footer HTML block. The footer's `v=3` declares the version; the body does not repeat it or the checksum fields:

````markdown
<!-- gpt-pages:figure id=example-chart -->

![Chart](visualize:example-native-file)

An ordinary caption and other body content.

<!-- gpt-pages:source v=3 id=example-chart ref=example-native-file sha256=5fba2d5772f1d86f8a2339a59c0837c35b6d2e79259e1e656240c153748c8688 -->

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"></head><body>Chart</body></html>
```
````

The identifiers above are fictional. Create a real native visualization from the same HTML, obtain its file ID, then generate the body and footer markers:

```sh
node scripts/figure-marker.mjs --v3 example-chart NATIVE_FILE_ID source.html
```

Body figure IDs, footer source IDs and native references must each be unique within their respective sets. The image URI must match the footer `ref` exactly. Sources may be ordered differently from charts: pair by ID, not title, position, identical HTML or matching hashes. v3 requires a matching v3 source marker and complete fence. It does not fall back to unmarked adjacent HTML, and removing only `ref`/`sha256` from a v2 body marker while keeping a v2 footer is invalid.

Separate the source marker and complete fence only with blank lines. Do not add "HTML source" headings or instructions. Successful pairing moves the complete fence back into the body and removes the body marker, native image reference and footer source pair. Existing prose and headings remain. Verification, backup and trust conditions are shared with v2 below.

## v2 declarations and generation

v2 supports adjacent or footer sources. The original adjacent layout uses three separate top-level blocks, separated by blank lines:

````markdown
<!-- gpt-pages:figure v=2 id=example-chart ref=example-native-file sha256=5fba2d5772f1d86f8a2339a59c0837c35b6d2e79259e1e656240c153748c8688 -->

![Chart](visualize:example-native-file)

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"></head><body>Chart</body></html>
```
````

These illustrative IDs do not create a native visualization. The digest covers the two displayed HTML lines plus their final LF. In actual use, create a native chart from the same HTML and obtain its real file ID before generating the marker:

```sh
node scripts/figure-marker.mjs example-chart NATIVE_FILE_ID source.html
```

- `id`: a generic figure ID unique within the document, using ASCII letters, digits, underscores or hyphens.
- `ref`: the real native file ID, using the same character set, 1–256 characters long. Exclude the `visualize:` prefix; do not use a Page ID.
- `sha256`: a 64-character lowercase hexadecimal digest of all UTF-8 bytes after the HTML opening fence's newline and before the closing delimiter. Include the final newline, BOM and CRLF; exclude fences.

The generator requires valid UTF-8, a complete document, at most 256 KiB and a final newline. Place the original bytes in the fence without reformatting. Use a longer fence if the source contains delimiters. If exported HTML changes, investigate and correct the source rather than simply recalculating a digest to conceal the difference.

### Collect complete HTML at the document bottom

Keep the figure marker adjacent to its native image reference in the body. Move the complete fence to the footer and add a separate source marker before it, using the same ID as the figure:

````markdown
<!-- gpt-pages:figure v=2 id=example-chart ref=example-native-file sha256=5fba2d5772f1d86f8a2339a59c0837c35b6d2e79259e1e656240c153748c8688 -->

![Chart](visualize:example-native-file)

An ordinary caption and other body content.

<!-- gpt-pages:source v=2 id=example-chart -->

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"></head><body>Chart</body></html>
```
````

The source marker and fence must be adjacent, separate top-level blocks with only blank lines between them. Any headings or explanations belong before the source marker. Multiple sources may appear in a different order; match by unique IDs, not order, titles or identical digests. Escaped source markers from Pages are supported. The body still requires a native image reference adjacent to the figure marker, with an exact URI match.

After asynchronous verification, the importer moves the complete fence to the body figure position and removes the figure marker, image reference, source marker and original footer fence. HTML body bytes and fence delimiters stay unchanged; only the language token may change according to trust settings. Footer headings and other prose remain, and HTML is not duplicated. This applies to manual import and in-place folder cleanup, with backup and conflict protection before writes. HTML comes from exported Markdown; no Pages connection or attachment download is performed.

Missing/duplicate source IDs, unknown versions, incomplete documents, hash mismatches or unavailable verification leave that HTML in place and preserve its markers and native reference. A figure with both an adjacent and a separate source is ambiguous and remains unchanged; the importer does not silently choose an alternative source. Other valid pairs can still be processed.

## Pairing conditions and failure handling

The CommonMark syntax tree identifies separate markers and image-style `visualize:` references, including the escaping above. Successful pairing removes markers and native image references so escaped metadata and broken-image alternative text do not appear in Obsidian. Keep section headings, ordinary captions and complete HTML. Inline markers, blockquotes, lists and example code blocks are not paired. Do not remove backslashes globally.

Cleanup requires a supported version, unique figure ID, unique native reference, exact URI, a complete adjacent or explicitly identified source fence, and matching SHA-256. Preserve an opening UTF-8 BOM even when the marker is the first content in the file. Intervening paragraphs, ID/hash mismatches, duplicate identifiers, unknown versions, missing fields/sources or unavailable verification preserve the affected markers and references and produce warnings. Other valid pairs in the document may proceed.

A source fence must be complete and closed, labeled `html` or `html-source`. CommonMark backtick and tilde fences are supported. The payload must start with an HTML doctype, contain `<html>` and end with `</html>`. This checks document boundaries, not HTML/CSS/JavaScript semantics.

Converted output contains HTML fences and existing prose. Repeating conversion leaves it unchanged: conversion is idempotent. Cleaned output has no pairing metadata, so another pass does not recount figures or reverify their digests. Each import from the original export still verifies the original v2/v3 metadata. Older v2 output containing only a retained marker and adjacent complete fence must still pass hash verification before marker removal. Re-importing with the same source name can update an unmodified old note after a complete backup; local edits still block replacement.

The importer uses asynchronous `convertVerified()`. The existing synchronous `convert()` removes markers and standalone references from successful v1 pairs, but preserves unverified v2/v3 metadata and references and reports `verification-required`.

## v1 compatibility

The legacy contract uses the figure ID itself as a standalone reference. Unique-ID, top-level adjacent complete-document pairs remain supported:

````markdown
<!-- gpt-pages:figure v=1 id=example-chart -->
visualize:example-chart
```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><style>/* complete CSS */</style></head>
<body><!-- content and data --><script>/* complete JS */</script></body>
</html>
```
````

Literal `visualize:` text does not create a native chart. Original UI samples with v1 markers lacked a native file ID/digest, and their image-style references did not satisfy the legacy contract. Those references remain, are recognized as unpaired and produce warnings; the importer does not guess a relationship.

## Source preservation and safe default output

Include complete HTML/CSS/JavaScript and all required data in the fence; a `visualize:` URI alone is insufficient. Preserve code body bytes, localized text, emoji, formulas, backslashes, HTML entities, BOM and line endings. Do not guess that `&lt;` should become `<`.

By default, manual conversion changes every CommonMark HTML fence to `html-source`, including blocks in lists/quotes, unpaired blocks and unknown-version content. Only the opening language token changes; payloads and delimiters remain intact. Other code fences are preserved except eligible standalone Pages `latex` formulas, described below. This safety transformation does not imply successful pairing. Automatic folder cleanup preserves existing fence languages unless folder rendering trust is explicitly enabled.

Only explicit trust for the entire document enables `html` output, including unpaired HTML blocks. **Successful verification is not a safety guarantee or digital signature, and does not automatically enable execution.** Polyglot Renderer may run scripts immediately. Previews always use `textContent` and never execute content. Raw HTML stays unchanged; the importer is not a general sanitizer and cannot control execution by other plugins.

## Asset limitations

Keep chart data and initialization in the complete HTML. The authoring skill allows fixed-version CDN libraries such as Plotly.js and MathBox; these require network access and the HTML checksum does not validate fetched library bytes. Use measured self-contained HTML/CSS/JavaScript/data when offline operation is requested; images can use data URIs. Relative assets are checked against the destination note's directory. The importer **does not copy or download** attachments located beside the source file. A separate [image asset v1 contract](images.md) supports explicitly embedded Base64 PNG/JPEG/GIF/WebP sources in the Markdown itself; it does not rewrite images inside HTML or change the v1/v2/v3 figure contracts.

Static scanning includes HTML src/href/poster, CSS url/@import, Markdown images, Obsidian embeds and URL candidates. It reports external, missing, special-protocol and unsafe-to-resolve references. Paths escaping the directory with `..` are rejected, and root-relative URLs are not interpreted as vault paths.

This is not complete dependency resolution. Dynamic JavaScript URLs, srcset, CSS escaping and special HTML entities need manual inspection; ordinary hyperlinks may also be reported. Existence in the vault does not prove an iframe can load an asset. Opaque origins, CORS and the renderer's relative-URL base require real tests. Do not claim universal asset availability, offline operation or safe execution of arbitrary HTML.

## Pages formula blocks

This source update is not yet in released 0.2.2. The updated skill authors standalone, nonempty `latex` fences with bare TeX and no `$`, `$$`, `\(` or `\[` wrappers. A controlled comparison was user-reported to render this form in Pages. The importer converts eligible fences to standalone `$$` lines, preserving formula bytes and line endings. Manual preview reports the count; folder cleanup also handles formula-only notes with HTML conversion off, using the existing backup and conflict checks.

Only complete top-level blocks with no extra info qualify. Empty, unclosed, nested, dollar/bracket-wrapped and recognized document/preamble blocks stay unchanged. `tex`, `math` and `latex source` remain code; use them for intentional source examples. Existing inline/display math outside code is unchanged. This is a conservative source transformation, not TeX validation or proof of rendering. Obsidian uses built-in MathJax, without Polyglot Renderer or HTML trust. See the [math workflow](../skills/gpt-pages-obsidian-visualizations/references/math.md).
