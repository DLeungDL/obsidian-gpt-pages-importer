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

   `canonical.md` must have been compared against Page readback. The extraction verifier accepts only a new or empty directory and never overwrites files. It validates payloads, signatures, budgets and expected bytes; it does not validate Markdown image pairing, real rendering or import behavior. Also run the mandatory completeness gate on both Page readback and actual export:

   ```sh
   npm ci --ignore-scripts --prefix <skill-dir>
   node <skill-dir>/scripts/verify_page_export.mjs page-readback.md
   node <skill-dir>/scripts/verify_page_export.mjs downloaded.md --expected page-readback.md
   ```

   Inventory every native image and visualization, not only sources or marked figures. Every native image must bind to exactly one verified payload; every visualization must have its v3 marker and verified HTML source. Unpaired, duplicate, mismatched or orphan content fails. Compare inventories by ID/reference/hash to catch stale downloads and omitted visuals.

   The importer accepts the exact `#display=full` fragment on `library-file:`/`project-file:` image destinations while matching the bare `source_ref`; keep that display setting in the Page, and keep footer references bare. Do not strip arbitrary URL fragments or query strings. Exports can replace a native image with a standalone inline or reference-style `data:image/png|jpeg|gif|webp;base64,...` image. Validate canonical Base64, MIME/signature, decoded size and SHA-256. With asset footers present, require a unique matching payload by MIME/length/hash before removing anything; a nonmatching or ambiguous source remains unresolved. Without asset footers, a valid standalone data image can be restored directly. Duplicate image occurrences and nested images remain unresolved. Definitions are removed only after successful restoration and only when no remaining image or ordinary link uses them. Do not paste giant data definitions into Page prose or claim their presence proves successful Obsidian restoration. These importer changes need an updated installed build; do not assume an older release supports them.
6. With user-authorized Obsidian testing, verify the preview's image count, saved file bytes, relative image link, repeated import and error preservation. Keep Page/tool readback, UI export and real Obsidian results separate. Only a tiny PNG ordinary-JSON export has historical UI evidence; dedicated asset fences, larger images and other formats need fresh UI verification. Installed importer support is not established by preparing a source checkout. Preserve unresolved assets and provide a concise missing-source report.

See [the full contract](../../../docs/images.md) in a repository checkout. This skill folder includes its own generator and verifier and requires no repository runtime dependencies.
