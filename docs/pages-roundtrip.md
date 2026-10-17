# Pages Export and Obsidian Import Validation Summary

**English** · [繁體中文](pages-roundtrip.zh-TW.md)

On 2026-10-14, the maintainer used original sample content authored for this project to validate native Pages visualizations, Markdown downloads through the Pages interface, and imports into Obsidian. The actual v2 UI export passed all 15 desktop import checks, with both figures paired successfully. Original exports and identifying information remain outside this repository.

## Public test data

The [v2 input fixture](../tests/fixtures/v2-escaped.input.md) and [independently authored expected output](../tests/fixtures/v2-escaped.expected.md) use fictional file IDs. They include a static bar chart, an interactive slider and reset button, Chinese text, emoji, formula notation, backslashes and HTML entities. These fixtures reproduce the observed CommonMark syntax; they are not the original files downloaded through the Pages interface.

```markdown
\<!-- gpt-pages\:figure v=2 id=example-chart ref=fixture-native-file sha256=ACTUAL_64_LOWERCASE_HEX -->

![Chart](visualize\:fixture-native-file)
```

This snippet illustrates the syntax. The fixtures contain valid hashes and complete HTML. A native file ID must be explicitly bound to the HTML checksum; proximity alone is insufficient. Native image references without binding metadata in v1 are preserved with a warning.

## Desktop results

The run used official Obsidian 1.14.4 and Polyglot Renderer 1.3.0 on Debian 13.6 with an Xorg virtual display and an isolated vault and settings. It exercised the actual command palette, file input, buttons and iframes, without the Obsidian stub or jsdom.

| Check | Maintainer-reported result |
| --- | --- |
| Actual v2 UI export and HTML | The ref and sha256 fields survived export. Both HTML payloads retained identical bytes; escaping occurred only outside HTML. |
| Pairing and output | Two figures paired successfully. Only verified native reference lines were removed, and the fence language was changed. |
| Default preview and reading view | The text preview created no scripts, iframes or images. The html-source blocks did not execute. |
| Trusted reading view and Live Preview | Static labels displayed correctly. The slider changed from 50 to 83, the bar reached 83%, and reset restored 50. |
| Re-imports, updates and local edits | No duplicate imports or unnecessary backups. Updates created complete backups first; local edits blocked replacement. |
| Incorrect checksum or native ID | Mismatched references were preserved with warnings, while the other valid figure still paired. |
| Original file integrity | The source file was unchanged before and after import. It was not rewritten into the contract format before testing. |

The [public validation summary](evidence/validation-summary.json) records the separate phases: 19 passes and one BOM failure for the baseline MVP desktop run; 13 passes and one unsupported case for the original v1 UI export; and 15 passes each for the upgraded v2 copy and the actual v2 UI export. These results do not establish compatibility with arbitrary Pages content or other platforms.

## Published evidence and limitations

The public-data cleanup on 2026-10-15 moved actual exports, service snapshots, attachment receipts, upload IDs, block IDs, native file IDs, Page URLs and screenshots outside Git. Only fictional fixtures and maintainer-reported summaries are published. The public summary cannot independently prove every desktop step. Detailed records remain outside Git, and copies with substituted IDs are not presented as original exports.

To repeat the validation, use your own test Page and follow the [compatibility and acceptance record](compatibility.md). Run `npm run check:public` before publishing material.

The 2026-10-14 run did not validate other exporters or attachment packaging, direct interaction with the native Pages viewer, Windows, macOS, mobile devices, physical GPUs or the outer Electron sandbox. It also recorded an unresolved BOM re-import defect at that time. The [compatibility record](compatibility.md) documents the later BOM fix, Windows checks and newer pairing formats; those later results are separate from this historical run.
