# Formula authoring and import

Use this form for a Pages formula, with no dollar or bracket delimiters inside:

```latex
\frac{2}{3}+\frac{1}{6}=\frac{5}{6}
```

The importer in this source branch turns that complete top-level block into:

$$
\frac{2}{3}+\frac{1}{6}=\frac{5}{6}
$$

Put blank lines around formulas. The converter adds a boundary blank line where a fence touches prose; it preserves the formula body, backslashes, line endings and opening file BOM. Existing math outside code is unchanged. Repeated conversion is idempotent. Manual preview and cleanup summaries report converted formula counts.

Only closed, nonempty, top-level `latex` fences with no extra info qualify (language matching is case-insensitive). Backtick and tilde CommonMark fences are supported. Blocks containing dollar or bracket math delimiters are retained, along with recognized document/preamble commands such as `documentclass`, `usepackage`, `newcommand`, `renewcommand`, `def`, `input`, `include` or a `document` environment. This conservative check is not a full TeX validator. Intentional source examples should use `tex`, `text` or `latex source`. Nested fences and other languages remain code.

Manual imports use this conversion with HTML trust both off and on. Automatic cleanup also handles formula-only notes in the configured folder without enabling HTML rendering, backs up exact source bytes before replacement, and retains the existing conflict and cancellation checks. This does not authorize changing vault settings or accepting trust prompts.

Published importer 0.2.2 and earlier keep `latex` as code. A new skill installation or a source build does not establish the user's installed plugin version. Report missing/unverified conversion support rather than claiming working Obsidian output.

## Evidence and limits

A controlled Pages comparison was user-reported on 2026-10-19 UTC: only a bare `latex` fence displayed the simple fraction as typeset math. Plain `$$` and a `latex` fence containing `$$` did not. A separate cases example containing `$$` also was not reported as working. No independent agent visual inspection, actual Markdown-download check, or new Obsidian runtime check follows from that report. Do not publish the user's Page IDs or source exports.

The current Pages content catalog describes fenced code and lists math extensions as unsupported; the user-observed `latex` preview is narrower runtime evidence. Recheck the actual target viewer. Longer formulas, matrices, alignment and cases need their own visual checks. LaTeX syntax success and rendered appearance are separate questions.

Keep Page prose editable. For short inline notation use Unicode when suitable; use separate formula blocks for complex expressions. Do not claim native Pages inline math support, replace a whole note with an HTML iframe, or create a duplicate reading Page without an explicit request.

Verify each layer separately: Page source, Page display, actual downloaded Markdown, converter output and Obsidian Reading view. Label user-reported display separately from automated byte-preservation tests.
