# Portable raster images

Use this workflow when the user requests images that survive a single Markdown export without ZIP. It extends the existing v3 visualization workflow; image asset version 1 is a separate contract. Do not change HTML sources or their hashes.

1. Read the requested Page and identify actual standalone native image references (`library-file:` or `project-file:`). Read each exact authorized reference with Pages' file tools. For raster responses, use the returned image content bytes/Base64 through a programmatic tool bridge, not the model's visual reconstruction. Confirm decoded length and SHA-256 against the file tool's original-byte metadata. A rendered screenshot, thumbnail or generated substitute is not the original. If raw bytes cannot be materialized, report the missing capability and retain the native image.
2. Keep the original image in the Page. Assign a unique short ID and pass the confirmed file bytes, full native reference and ID to the generator:

   ```sh
   node <skill-dir>/scripts/build_image_asset.mjs image-a 'library-file:ACTUAL_NATIVE_FILE_ID' original.png
   ```

   Parse the returned JSON and use `source_markdown` as a string. Never hand-copy or generate Base64 tokens. The full reference must come from tools, not this example. The helper validates signature and length but does not verify access or the image's Page binding.
3. Insert one complete top-level `gpt-pages-asset` fence per image in the source footer using guarded Page edits. It includes version, ID, source_ref, filename, MIME, decoded byte_size, original-byte SHA-256 and canonical padded Base64. Keep the native reference unchanged. Do not insert a second source for an existing ID/reference; regenerate its existing block when the actual original changes. Never reinterpret arbitrary existing JSON as a source. If a reference appears more than once, leave it unresolved and explain the current unique-occurrence requirement.
4. Respect both importer limits (1 MiB per image, 4 MiB total, 32 sources) and the active tool's per-call/Page budgets. Base64 increases data size about one third. A source block must fit as a complete edit; do not split it across fences or claim that successive edits guarantee sufficient Page capacity. Ask for a smaller original only when required, or report the limit. Do not silently recompress or replace images.
5. Read back exact JSON, decode it in a program and compare original bytes/digests. Then check a real UI Markdown download:

   ```sh
   python <skill-dir>/scripts/verify_image_export.py downloaded.md --expected canonical.md --out restored-images
   ```

   `canonical.md` must have been compared against Page readback. The verifier accepts only a new or empty extraction directory and never overwrites files. It validates payloads, signatures, budgets and expected bytes; it does not validate Markdown image pairing, real rendering or import behavior. The importer uses a Markdown syntax tree for pairing.
6. With user-authorized Obsidian testing, verify the preview's image count, saved file bytes, relative image link, repeated import and error preservation. Keep Page/tool readback, UI export and real Obsidian results separate. Only a tiny PNG ordinary-JSON export has historical UI evidence; dedicated asset fences, larger images and other formats need fresh UI verification. Installed importer support is not established by preparing a source checkout. Preserve unresolved assets and provide a concise missing-source report.

See [the full contract](../../../docs/images.md) in a repository checkout. This skill folder includes its own generator and verifier and requires no repository runtime dependencies.
