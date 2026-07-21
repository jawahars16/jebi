# Releasing jebi

Releases are built and published fully locally — there is no CI release
pipeline. This requires a Mac with:

- A "Developer ID Application" signing identity in the keychain matching
  `app/package.json`'s `build.mac.identity`.
- A `notarytool` keychain profile named `jebi-notary`
  (`xcrun notarytool store-credentials jebi-notary ...`).
- `gh` authenticated with access to `jebi-sh/jebi` and push access to
  `jebi-sh/homebrew-tap` (SSH).

## 1. Build, sign, notarize, staple

```bash
make release-build VERSION=0.1.25
```

This will:

1. Clear `app/dist` and `release-output/0.1.25`.
2. Set `app/package.json` version to `0.1.25`.
3. Download llama.cpp dependencies (`make deps`).
4. Build the Go core.
5. Build and Developer ID sign the Electron app (`npm run build && npm run pack`).
6. Submit the signed app ZIP to Apple for notarization via the `jebi-notary`
   keychain profile, saving the submission ID to
   `release-output/0.1.25/.release-build-state`.
7. Poll for up to 60 minutes.
8. Staple the notarization ticket, build the final DMG and ZIP from the
   stapled app, validate codesign/stapler/Gatekeeper, and write
   `SHA256SUMS.txt` — all under `release-output/0.1.25/`.

If notarization is still in progress after 60 minutes, the command exits
safely without failing. Resume polling later with:

```bash
make release-build VERSION=0.1.25 RESUME_NOTARIZATION=1
```

## 2. Commit and push the version bump

`release-build` updates `app/package.json` but does not commit. Review and
commit it yourself, then push to `main`:

```bash
git add app/package.json
git commit -m "chore: release v0.1.25"
git push origin main
```

`release-publish` refuses to run until this is done.

## 3. Publish

```bash
make release-publish VERSION=0.1.25
```

This never builds, signs or notarizes — it only requires that
`release-build` already produced a DMG, ZIP and checksums file under
`release-output/0.1.25/`, and that the version bump is committed and pushed
to `main`. It will:

1. Create and push tag `v0.1.25`.
2. Create a draft GitHub Release.
3. Upload the DMG, ZIP and `SHA256SUMS.txt`.
4. Update `jebi-sh/homebrew-tap`'s `Casks/jebi.rb` with the new version and
   DMG SHA-256, and push it.
5. Publish the draft GitHub Release.

Each step is recorded in `release-output/0.1.25/.release-publish-state`. If
a step fails partway through, fix the issue and re-run with:

```bash
make release-publish VERSION=0.1.25 RESUME=1
```

already-completed steps are skipped.

To preview what would happen without making any changes:

```bash
make release-publish VERSION=0.1.25 DRY_RUN=1
```

## Other commands

```bash
make release-status VERSION=0.1.25   # notarization + build/publish progress
make release-clean VERSION=0.1.25    # remove app/dist and release-output/0.1.25
```
