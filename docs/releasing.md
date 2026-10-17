# Release process

Release tags must exactly match the version in `manifest.json`, without a `v` prefix. Keep `package.json`, the lockfile root, `versions.json` and README source-version badges aligned. The next prepared patch is `0.1.3`; creating its tag publishes it.

## Preflight

1. Run `npm ci`, `npm run check`, and the Python skill verifier: `python -B -m unittest discover -s tests -p 'test_skill_export.py' -v`.
2. Run `npm run build:verify`. It builds twice and requires byte-identical `main.js`, `manifest.json` and `styles.css`.
3. Review and merge the release commit. Confirm that the tag points to that exact committed source and that the working tree is clean.
4. Create and push the matching tag. `.github/workflows/release.yml` performs validation, builds, attests and verifies the artifacts, then creates the GitHub release. Do not upload locally edited assets afterward.

The build normalizes license notices and packaged text to LF. The `0.1.2` scan mismatch was reproduced: its released bundle had 21 CRLF sequences in the license header; converting CRLF to LF made it byte-identical to the tagged-source rebuild. Executable code was identical. New builds canonicalize these bytes before publication.

## Supported release assets

Upload only `main.js`, `manifest.json` and `styles.css`. `scripts/check-release-assets.mjs` rejects extra files, empty assets, CRLF output or a tag/version mismatch. Do not attach ZIP archives, standalone licenses, notices or checksum files to the community release. GitHub provides source archives separately; CI installation artifacts still include readable license files.

The MIT license and bundled third-party notices remain embedded in `main.js`, so attribution is present in the three-file community installation. For manual installation, create `.obsidian/plugins/gpt-pages-importer/` and download the three release assets into that directory.

## Build provenance

The release workflow grants `id-token: write` and `attestations: write` only to the tag-release job. A commit-pinned `actions/attest-build-provenance` step attests all three assets; `gh attestation verify` must succeed before publication. Attestations live in GitHub's attestation service, not as extra release attachments.

After publication, download the assets and verify them, for example:

```sh
gh attestation verify main.js --repo DLeungDL/obsidian-gpt-pages-importer
```

Repeat for `manifest.json` and `styles.css`. GitHub's asset digests can be compared to the build job's SHA-256 output. The attestation and new release scanner results cannot be claimed until the tag workflow has actually succeeded.

## Community review

Run `npm run lint` before submission. It uses the Obsidian ESLint plugin and typed rules with zero allowed warnings. The plugin's older SDK peer constraint is overridden to the project's existing `obsidian` SDK, keeping the 1.13 search definitions typed without downgrading the supported API declarations. English sentence-case checks exclude Chinese UI strings and preserve product names.

The Obsidian review service controls the disclosures that malware scanning or build verification is unavailable; source changes cannot enable a service it does not provide. Review the next release's actual report instead of treating these disclosures as plugin errors or claiming they disappeared locally. Vault writes remain necessary for importing and backups; folder cleanup traverses only the explicitly configured folder subtree.

For first-time directory submission, follow the [official process](https://docs.obsidian.md/plugins/releasing/submit-plugin) and the community developer policies. Never claim an unpublished version is available through the directory.
