# Portable images in a single Markdown file

[繁體中文](images.zh-TW.md)

An explicitly authored `gpt-pages-asset` fence carries the original raster bytes inside the downloaded Markdown. The importer validates it offline, saves the image in the vault, then replaces its native image reference with a relative Markdown link. No ZIP, network access or renderer trust is required for these raster images.

## Image asset version 1

Keep exactly one standalone top-level image for each full `source_ref`, followed anywhere in the document by one closed top-level fence:

````markdown
![Caption](library-file:fixture-image)

```gpt-pages-asset
{
  "version": 1,
  "id": "image-a",
  "source_ref": "library-file:fixture-image",
  "filename": "image.png",
  "mime": "image/png",
  "byte_size": 0,
  "sha256": "GENERATE_FROM_ORIGINAL_BYTES",
  "base64": "GENERATE_FROM_ORIGINAL_BYTES"
}
```
````

This is a schema illustration, not a valid payload. Generate real values with the [skill helper](../skills/gpt-pages-obsidian-visualizations/scripts/build_image_asset.mjs). The source reference includes its exact `library-file:` or `project-file:` prefix. The Markdown parser accepts exported `library-file\:` escaping; JSON strings keep the actual unescaped reference. The experimental ordinary `json` fence from the initial trial is not an import contract and is ignored.

IDs are unique ASCII letters/digits/underscore/hyphen, 1–64 characters. Native reference tokens allow the same characters, 1–512 characters. Filenames are descriptive ASCII basenames, up to 128 characters; they never select vault paths. Base64 is a canonical padded string with no whitespace. SHA-256 is lowercase hex over decoded original bytes, not the Base64 text. `byte_size` must match the decoded length. MIME must agree with a PNG, JPEG, GIF or WebP signature. Signature checks do not prove full decoder validity. SVG and arbitrary binary attachments are outside this format.

Limits: 1 MiB decoded per image, 4 MiB total accepted image bytes per import, and at most 32 source blocks. Base64 adds about one third to the original size. These importer limits do not establish Pages' capacity or tool edit limits. A large source block may exceed the host's per-edit budget; do not split a single JSON fence or silently recompress images. Report the limitation instead. Failed and ambiguous sources remain unchanged with warnings. Nested or inline images, reference-style images and repeated native references are not restored; code examples and raw HTML remain untouched.

## Storage and recovery

Both manual import and automatic folder cleanup write `<note folder>/GPT Pages Assets/<full SHA-256>.<detected extension>`. The resulting note uses `GPT%20Pages%20Assets/<hash>.png` (or jpg/gif/webp). Files are create-only: reuse requires matching length and digest. Differing existing bytes, folder collisions, write failures or failed readback stop the note write. Filenames in untrusted payloads cannot choose paths.

Planning and preview do not write or load images. Existing notes are backed up before new image writes; the note is replaced only after every planned image is saved and read back, using the original atomic note-conflict check. This is not a multi-file transaction: an interrupted or failed operation can leave unused content-addressed images and an exact note backup. Retrying safely reuses verified images. No automatic asset deletion occurs because images may be shared. An unchanged manual re-import checks/restores its planned binaries without rewriting the note; already-cleaned folder notes no longer contain source payloads and cannot recreate deleted images without the original export.

## Verification scope

A 191-byte, 120 × 60 PNG passed an actual Pages read → Base64 source in a JSON fence → UI Markdown download → decode comparison on 2026-10-19: restored bytes and SHA-256 matched the original. The dedicated `gpt-pages-asset` language, larger/multiple images and automatic vault writes have automated coverage, not a new Pages UI or real Obsidian run. Private exports and original identifiers are excluded from the repository. See the [skill workflow](../skills/gpt-pages-obsidian-visualizations/references/images.md) for creating and checking exports.
