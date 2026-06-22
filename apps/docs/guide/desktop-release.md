# Desktop release

Desktop release builds are created by `.github/workflows/release-desktop.yml` on `v*` tags and manual dispatch. The current workflow builds unsigned artifacts, uploads SBOMs and attaches provenance attestations. Signing and notarization start only after credentials are added to GitHub Actions secrets.

## Required credentials

macOS:

- `APPLE_CERTIFICATE` — base64-encoded Developer ID Application `.p12`.
- `APPLE_CERTIFICATE_PASSWORD` — password for the `.p12`.
- `APPLE_SIGNING_IDENTITY` — Developer ID Application identity name.
- `APPLE_ID` — Apple account used for notarization.
- `APPLE_PASSWORD` — app-specific password.
- `APPLE_TEAM_ID` — Apple Developer Team ID.

Windows:

- `WINDOWS_CERTIFICATE` — base64-encoded code-signing `.pfx`, or the chosen Trusted Signing profile.
- `WINDOWS_CERTIFICATE_PASSWORD` — password for the `.pfx`.

Linux:

- No mandatory code-signing credential for local tarball/AppImage output.
- Add package repository signing keys only when `.deb` / `.rpm` repository publishing is introduced.

## Checklist

1. Confirm the release commit passes `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:rust` and `npm run docs:build`.
2. Run `npm run tauri:build` locally once on the target platform if signing config changed.
3. Add the platform credentials as GitHub Actions secrets. Do not commit certificates, profiles, passwords or exported keychains.
4. Enable signing/notarization in the release workflow for one platform at a time.
5. Verify the produced artifact on a clean machine: install, open a project, run a scan, export an HTML report.
6. Keep unsigned artifacts clearly labelled until the signed path is verified.

## Release boundary

Publishing signed desktop artifacts is an external release action. The repository can prepare the checklist and workflow, but the signing step stays blocked until the certificates and account access exist.
