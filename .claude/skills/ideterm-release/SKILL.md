---
name: ideterm-release
description: >-
  Use when cutting a new release of Mayo's IdeTerm — bumping the version, writing
  release notes, tagging, and publishing the Windows/macOS/Linux installers via the
  GitHub Actions workflow. Also covers why releases must build on CI, not locally.
---

# Releasing Mayo's IdeTerm

Releases are built and published by **GitHub Actions** (`.github/workflows/release.yml`), which runs
`electron-builder --publish always` on `windows-latest`, `macos-latest`, and `ubuntu-latest` for any
pushed `v*` tag. `electron-builder.yml` has `publish.releaseType: release` so it publishes a real
(non-draft) release. Artifacts: `IdeTerm-<ver>-Setup.exe` (Win NSIS), `IdeTerm-<ver>-arm64.dmg`/`.zip`
(macOS), `IdeTerm-<ver>.AppImage`/`.deb` (Linux), plus `latest*.yml` for the in-app update check.

## Why not build locally

`electron-builder --win` fails on this Windows dev machine (winCodeSign symlink-privilege error
without Developer Mode/admin), and macOS/Linux installers can't be built on Windows at all. Always
release through CI.

## Steps

1. **Land all changes on `main`** (green `npm run check` + `npm run build`).
2. **Bump the version** in `package.json` (e.g. `0.2.0` → `0.3.0`). The tag must match (`v0.3.0`).
3. **Update the README** if features changed (feature list, roadmap, the download table version is
   illustrative `x.y.z`, no edit needed).
4. **Commit and push** to `main`.
5. **Create the release**, which also creates+pushes the tag and triggers CI:
   ```bash
   gh release create vX.Y.Z --target main --title "vX.Y.Z — <headline>" --notes @'
   ... markdown notes ...
   '@
   ```
   (Pre-creating the release with `gh` gives you nice notes; CI then uploads assets to it. Pushing
   just the tag also works — CI's electron-builder will create the release.)
6. **Watch CI and confirm assets land** (the run is misleading on the watcher's own exit code, so
   always re-query the conclusion):
   ```bash
   gh run list --workflow=release.yml --limit 3
   gh run watch <run-id> --exit-status
   gh run view <run-id> --json conclusion --jq .conclusion       # expect "success"
   gh release view vX.Y.Z --json assets --jq '.assets[].name'    # expect all 3 OSes + latest*.yml
   ```
   If a leg fails, get the cause with `gh run view <run-id> --log-failed | grep -iE "error|fail"`.

## Notes / quoting

- `gh` is authenticated with `repo` scope; `secrets.GITHUB_TOKEN` powers the workflow's publish.
- In a bash here-doc, an apostrophe in "Mayo's" must be escaped as `'"'"'`.
- Builds are **unsigned** — release notes should mention SmartScreen/Gatekeeper first-launch warnings.
- Past CI failures and their fixes are baked into the current workflow: `npm ci` lockfile sync
  (keep Vitest on v2), and a required `npm run build` step before `electron-builder` (so `out/` exists).
