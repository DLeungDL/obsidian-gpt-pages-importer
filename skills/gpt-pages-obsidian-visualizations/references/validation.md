# Export and rendering validation

## Record evidence by layer

| Layer | What to verify | Evidence and limits |
| --- | --- | --- |
| Canonical source and Page readback | Native chart remains; complete HTML pairing; matching data, formulas, localized text, ARIA and events | Readback text/source hashes plus actual Page rendering. An HTML hash does not prove native chart behavior. |
| Cross-Page link preflight | Tool-confirmed matching target IDs and canonical HTTPS URLs; guarded destination edits; unchanged labels and HTML; unresolved targets reported | Follow [page-links.md](page-links.md). A successful tool read or rewrite does not establish a UI export or an Obsidian click. |
| Actually downloaded Markdown | HTML block count, order, UTF-8 bytes and SHA-256 match the verified canonical source | A user-downloaded or actually exported file, with its byte count recorded. Self-assembled files are only test fixtures. |
| Static HTML/JavaScript checks | Complete document, CSS defaults, embedded data, no external dependencies and parseable inline JavaScript | `node --check` proves syntax only, not DOM, events or renderer behavior. Inspect sources for CSS URLs/imports, script sources, images, modules, fetch calls and other dependencies. |
| Browser rendering and interactions | Labels, formulas, shapes, values and event results; narrow layouts, reset and repeated operations | Record browser, standalone HTML or iframe context, sandbox conditions and results. A simulated sandbox is not an Obsidian device test. |
| Real Obsidian tests | Put the actual downloaded Markdown in the designated test vault, then check Polyglot Renderer display and interactions | Record platform, plugin versions, Reading view and any Live Preview mode actually tested. Screenshots establish appearance; interactions require observed results. Label user reports as user-reported. |
| Real Obsidian cross-Page navigation | Click representative HTTPS links from the actually downloaded and imported file; verify correct Page and account permissions | Tool reads and importer simulations are not click evidence. HTTPS links do not provide public sharing or offline navigation. |
| Automatic-cleanup trust flow (separate test) | Use the separate `html-source` Markdown copy; check cleanup without conversion, cancellation, and conversion after user-confirmed trust and saved settings | Record fence languages and identical HTML hashes before/after, the folder and renderer state, and who confirmed trust. A normal Page's `html` fences or a manual import are not evidence for this layer. |

Passing one layer does not establish a later layer. For untested or blocked layers, identify the missing evidence. Without Page/download/Obsidian access, complete available authoring and static checks, but do not claim end-to-end success.

## Ordinary export

This is the default workflow for creating a Page or an unspecified import demo. The Page and its downloaded Markdown contain native visuals, compact v3 figure markers and complete `html` sources in the footer. Verify those bytes first. A manual import defaults to `html-source`; trusting a manual import and testing its renderer does not test the watched folder's trust setting.

## Automatic-cleanup trust test

Use this workflow when the user requests validation of watched-folder cleanup and rendering trust:

1. Start with the verified, actually downloaded ordinary export. Prepare a separate Markdown test copy outside the original Page, changing only the top-level HTML source opening fences from `html` to `html-source`. Preserve fence delimiters, all payload bytes (including BOM/CRLF/final newline), v3 metadata and checksums. Do not use a global text replacement. Check that all expected sources are non-executable `html-source` fences and no executable HTML fences remain in the test copy.
2. Verify the test copy against the ordinary `html` export using the command below. A count or byte mismatch is a failure; do not repair it by recalculating hashes over altered payloads. This comparison does not by itself establish that the original file came from an actual download.
3. In the authorized test vault/folder, enable automatic cleanup, keep trusted HTML conversion off, and select **Save settings** to apply that state. Trigger cleanup and confirm that valid v3 markers/native references are cleaned while the fences stay `html-source` and no chart runs. Reprocessing must not duplicate sources or change their bytes. Do not change vault settings without the task's authorization; if the required state or runtime is unavailable, mark this layer untested.
4. Ask the user to cancel a trust confirmation, select **Save settings**, trigger cleanup and verify that conversion stays off. Then have the user explicitly confirm folder trust; the agent must not accept the dialog. Confirmation changes only the settings draft: select **Save settings** before triggering cleanup again. Confirm `html-source` becomes `html`, hashes stay identical, and the already installed/enabled renderer displays the expected interactions. Record renderer status; folder trust does not install or enable it.
5. Turning conversion off leaves already converted `html` intact. Use a fresh non-executable test copy for another before-trust run. Report cancellation, confirmation/conversion and actual renderer interaction separately; a source comparison or browser simulation does not prove those runtime results.

```sh
python <skill-dir>/scripts/verify_html_export.py downloaded-trust-test.md --language html-source --expected downloaded.md --node-check
```

## Source verification helper

```sh
python <skill-dir>/scripts/verify_html_export.py downloaded.md --expected canonical.md --out extracted --node-check
```

- Requires only the Python standard library. `--node-check` also requires Node.js; use `--node <executable>` to select it.
- Parses top-level `html` fences by default; `--language html-source` selects the separate trust-test copy's non-executable fences instead. Accepts backtick/tilde and longer delimiters. Selected opening fences must start in column 1. HTML inside lists/blockquotes is unsupported. Unclosed fences, invalid UTF-8, missing selected fences or unsupported indentation fail explicitly rather than being silently repaired.
- Compares each fence's complete UTF-8 payload, including the final newline, in block order. A BOM on the Markdown document itself is not part of the HTML payload. Preserve LF/CRLF without automatic normalization, unescaping or HTML entity decoding. Different line endings yield different hashes: investigate and report them instead of claiming identical bytes.
- `--expected` always reads ordinary `html` fences from the canonical/Page export, even when the input uses `--language html-source`. Verify that expected file against exact Page readback first. The report records the selected input `fence_language`. Without `--expected`, the helper only produces a manifest, with `source_match` set to `null`; do not claim source comparison.
- `--out` extracts payloads into sequentially named HTML files, writing only to a new or empty directory. Reports go to stdout. Exit code `0` means requested checks passed, `1` means hash/JavaScript syntax checks failed, and `2` means an input or tool error.
- JavaScript checks distinguish classic scripts from `type="module"` and skip non-JavaScript data blocks. External `script src` fails. The helper cannot fully validate HTML event attributes or `javascript:` URLs; inspect them separately. It never executes extracted scripts.

## Representative interactions

The bundled [weighted-sum.html](../assets/weighted-sum.html) is a starting point without private course content, not a required design for every subject. With fixed inputs `x = (2, 3)`, two weights are controlled through sliders and numeric fields:

| Action | Expected result |
| --- | --- |
| Initial weights `(2, 1)` | `s = 7` |
| `(0, 0)` | `s = 0`; zero contributions remain distinguishable |
| `(-1, 2)` | `s = 4`; negative contributions appear left of zero |
| `(0.5, -0.2)` | `s = 0.4`, without visible floating-point residue |
| Repeated slider/numeric-field changes | Values, formula, ARIA and graphics update together |
| Reset | Return to `(2, 1)` and `7` |
| About 320px wide; keyboard operation | No clipping; controls remain usable with labels and visible focus |

Design other charts' tests around their own semantics; do not apply these values to unrelated formulas. Check the same cases in the native Page and exported HTML. Styling differences may be acceptable; data and event differences require investigation.

## Common sources of confusion

- Internal visualization/PNG references do not contain portable source or image bytes. Do not assume exports embed them unless actual download inspection establishes it.
- Preserving HTML in a code block does not mean every Markdown viewer executes it. Verify source preservation and renderer display separately.
- Raw HTML, CSS snippets and fenced CSS/JavaScript/JSON serve different purposes. Native Obsidian HTML restricts scripts. If the user separately requests JSON-to-YAML frontmatter conversion, perform that conversion explicitly rather than calling it an automatic visualization.
- If localized text becomes `????` or U+FFFD, inspect bytes/code points and compare against canonical sources. Valid UTF-8 decoding does not prove characters were never replaced; fonts cannot repair damaged data.
- Never strip Markdown backslashes globally: this damages code, formulas, paths and valid escapes. Handle escaping only in confirmed local text where needed.

## Polyglot Renderer compatibility

Check the installed version first. Consult primary sources when capabilities are uncertain; do not treat a version such as `1.3.0` mentioned in earlier research as permanently latest.

- [Official Obsidian plugin page](https://community.obsidian.md/plugins/polyglot-renderer): plugin identity and version information.
- [Upstream repository](https://github.com/Nimaapr/polyglot-renderer): features and usage.
- [Code-block registration](https://github.com/Nimaapr/polyglot-renderer/blob/main/src/main.ts) and [HTML renderer](https://github.com/Nimaapr/polyglot-renderer/blob/main/src/renderers/html-renderer.ts): inspect when current implementation details matter.

The previously inspected implementation used an `html` code-block processor with `iframe.srcdoc` and `sandbox="allow-scripts"`, without `allow-same-origin`. It added HTML/head/body wrappers and placed the provided source inside the body. Standalone browser success therefore does not establish complete-document compatibility in the plugin; use representative tests. An opaque origin may also make storage APIs unavailable, so prefer document-local in-memory interaction state.

These sandbox properties do not provide complete network isolation or general safety. Inspect the source, embed dependencies and execute trusted content only. Do not expand permissions, install plugins or change vault settings without authorization to address compatibility.
