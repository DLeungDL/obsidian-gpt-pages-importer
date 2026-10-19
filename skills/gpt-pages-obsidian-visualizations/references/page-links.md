# Cross-Page link preflight

Run this check before exporting a Page for Obsidian. Internal Page URIs can survive a Pages Markdown download, and the offline importer does not resolve them. Convert only actual Markdown link destinations to canonical HTTPS URLs obtained from Pages tools.

## Parser helper

The standalone skill uses Node.js and npm. Install its locked Markdown parser dependencies once after installing or updating the skill:

```sh
npm ci --ignore-scripts --prefix <skill-dir>
node <skill-dir>/scripts/page_links.mjs scan snapshot.md
```

`snapshot.md` must contain the exact Markdown from the current Pages read, with code fences intact. Keep snapshots, read receipts and real URLs outside the public repository. A tool readback is not evidence of a UI Markdown download.

The helper uses a Markdown AST to identify links and micromark tokens to locate only destination spans. It supports `page:page_ALPHA`, `page://page_ALPHA`, Markdown-escaped forms such as `page\:page_ALPHA`, character references, autolinks, and full/collapsed/shortcut reference links. IDs remain case-sensitive. It preserves custom labels, generic `Page` labels, link titles, BOMs, line endings, formatting and every character outside the edited destinations. It does not inspect code or HTML contents, rewrite image destinations or change existing HTTPS links.

Unused definitions are left alone. Duplicate definitions, definitions shared with images, unsupported Page URI shapes (including query/fragment suffixes), and destinations that cannot be located remain unchanged and are reported. Do not remove suffixes or guess their meaning.

If an unfenced complete HTML document starts with `<!doctype html>` or `<html>`, blank lines can make its contents look like Markdown. The helper conservatively preserves potentially affected links from that point onward, including their referenced definitions, and reports `raw-html-document`. Put that HTML source inside its required code fence and rescan rather than guessing document boundaries.

## Resolve through Pages

1. Read the source Page and retain its current Markdown, block IDs and hashes. Run `scan`; its `targets` array lists distinct eligible Page IDs and occurrence counts. Deduplicate targets across the entire source Page, including repeated inline links and shared reference definitions.
2. For each target, call the available Pages `read_page` tool using that exact ID. A metadata-only read (`include_content: false`, when supported) is sufficient because the helper preserves labels. Check that `metadata.page_id` exactly equals the requested ID. If a content Page ID is returned, it must agree too. Use only the tool's canonical HTTPS `metadata.url`, not a URL in Page prose, a fabricated path or a guessed sharing URL. The tool handles account selection and access; a canonical URL does not make a private Page public.
3. Save a minimal receipt object keyed by the requested ID. Copy `metadata` from the successful tool result's `structuredContent`. For example, the following is fictional test data, not a URL-building template:

```json
{
  "page_ALPHA": {
    "metadata": {
      "page_id": "page_ALPHA",
      "url": "https://example.invalid/pages/alpha"
    }
  }
}
```

4. If a target is inaccessible, missing, has no canonical URL, returns a mismatched ID, or its tool fails, leave that entry absent or record an `error` object. Preserve the original link and list it as unresolved. If Pages tools are unavailable, do not invent a replacement or claim a completed Page update; local scanning can still report the dependent work.
5. Plan changes and optionally create a new prepared copy:

```sh
node <skill-dir>/scripts/page_links.mjs rewrite snapshot.md receipts.json --out prepared.md
```

Without `--out`, the command only emits the plan. Output JSON includes `sourceSha256`, distinct `targets`, ordered `edits` (`start`, `end`, `oldText`, `newText`) and `unresolved` (`pageId`, original `url`, `line`, `reason`). Offsets are JavaScript UTF-16 string offsets, not UTF-8 byte offsets. The source hash covers the original UTF-8 bytes. `applyPageLinkPlan` checks that hash and every original span before applying edits from the end of the string. No Markdown serializer runs. URL punctuation is escaped only as needed to preserve the exact parsed HTTPS target.

Exit codes: `scan` returns 0 after a successful scan even when links need resolution; `rewrite` returns 0 when all eligible links resolve, 2 when unresolved links remain, and 1 for invalid input or file errors. A partial prepared copy retains unresolved links. Existing output files and original input files cannot be overwritten. Review the report rather than treating any created file as a fully resolved export.

## Guarded Page editing and validation

- Read the latest source Page again before applying changes. If its snapshot or affected block hash has changed, discard the stale plan and rescan. Use Pages editing tools with observed block IDs and expected hashes. Apply a unique literal destination patch where possible; repeated destinations may require a guarded replacement of the affected Markdown block computed from the local edits. Preserve all other block content. Do not submit a whole-Page rewrite or assume that a helper offset is a Pages API edit coordinate.
- Preserve user-defined link text. The helper also preserves generic `Page` labels. An agent may separately replace a literal generic label with a confirmed target title when useful and authorized; obtain that title from a successful target read, escape it as Markdown text, and preserve reference binding. Do not rename arbitrary custom labels.
- Read back the edited source Page, rescan it, and confirm idempotence: already converted HTTPS links require no further edits or target reads. Report remaining unresolved targets with their causes. Verify that native references, v3 figure/source markers, HTML bytes and SHA-256 remain unchanged.
- Download Markdown through the actual Pages UI and check the downloaded destinations and unchanged HTML sources. Then import that file with GPT Pages Importer in the authorized Obsidian test vault and click each representative HTTPS link. Verify the correct target Page under the test account's permissions; do not mark this passed from a tool read or browser URL alone.
- Report Page read/patch checks, actual UI download, importer conversion and Obsidian clicks as separate **agent-tested / user-reported / untested / failed** layers. Record versions, account/access conditions without secrets, and unresolved cases. Store real exports and account URLs outside Git; public fixtures use fictional IDs and `example.invalid` URLs.

The importer remains offline. Link conversion does not download target content, localize images/attachments, change sharing permissions or promise offline navigation.
