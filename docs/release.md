# Release checklist

Archora release artifacts are built by `.github/workflows/release-desktop.yml`.
The workflow does not publish npm packages.

## Desktop artifacts

The workflow builds Tauri bundles for:

- Linux
- macOS
- Windows

Artifacts are uploaded per platform. Until signing secrets are configured,
these are unsigned build outputs and should be treated as release candidates,
not public installers.

## Signing and notarization

Signing requires platform credentials in GitHub Actions secrets. Do not commit
certificates, provisioning files, passwords or API keys.

Required before public desktop distribution:

- Apple Developer ID certificate.
- Apple notarization credentials: Apple ID/app-specific password or App Store
  Connect API credentials.
- Apple team ID.
- Windows code signing certificate and password, or a cloud signing provider.
- Linux package signing key if distributing signed Linux repositories.

After secrets are configured, update the release workflow with the exact
platform signing commands and keep unsigned local builds available for smoke
testing.

## SBOM and provenance

Each desktop workflow run uploads:

- a platform artifact;
- an SPDX JSON SBOM;
- GitHub build provenance attestations for both.

Before a public release, verify the workflow run is green and download the
artifact/SBOM pair from that exact run.

## Local release checks

Run these before triggering the workflow:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run docs:build
npm run cli:smoke:tarball
npm run test:rust
npm run bench
npm audit --omit=dev --audit-level=moderate
```

`npm run cli:smoke:tarball` builds `@archora/cli`, packs the workspace package,
checks that the tarball contains only runtime package files (`dist`,
`README.md`, `package.json`), installs that tarball into a temporary project
and runs `archora --help`, `analyze` and `report`.

## Release cut

Use this sequence for a tagged release candidate:

1. Start from a clean working tree on the release branch.
2. Run the local release checks above.
3. Update versioned metadata and changelog entries in the same commit.
4. Create an annotated tag for the current version, for example
   `git tag -a v1.0.3 -m "Archora v1.0.3"`.
5. Push the branch and tag.
6. Wait for CI and `.github/workflows/release-desktop.yml` to finish.
7. Download each platform artifact and its SBOM from that workflow run.
8. Smoke the unsigned desktop artifact on the matching platform.
9. Create the GitHub Release from the tag and attach artifacts from the green
   workflow run only.

Until signing secrets are configured, mark desktop artifacts as unsigned release
candidates in the release notes. Do not publish npm packages from this workflow;
publish `@archora/cli` only after `npm run cli:smoke:tarball` passes for the
same commit.
