# Privacy

Archora runs on your machine. It reads source code locally, analyzes
locally, and does not send anything over the network during scans. The
current license flow uses local signed keys and does not require a
network request.

Last updated: 2026-05-26.

## Source code

When you open a project, Archora walks the filesystem from the
directory you select, parses source files, builds a dependency graph,
and computes metrics. Nothing about your files, paths, imports or
derived data leaves the machine.

## Scan results

`ScanResult` stays in memory during a session. Export writes to a local
file (`*.json` / `*.html` / `*.md`). PDF export renders locally.

Recent projects, theme, language, and history snapshots are stored at:

- macOS: `~/Library/Application Support/archora/`
- Windows: `%APPDATA%/archora/`
- Linux: `~/.config/archora/`

Delete that directory to reset state.

## Outbound traffic

### License validation

Activating a license in the current release validates a signed key
locally. The desktop build reads `VITE_ARCHORA_LICENSE_PUBLIC_KEY_JWK`;
the CLI reads `ARCHORA_LICENSE_PUBLIC_KEY_JWK` and stores the active key
in `~/.config/archora/license.json`, unless `ARCHORA_LICENSE_FILE`
overrides the path. No email, project data, file path, scan result or
report is sent by activation.

### Crash reports

None automatically. If you open a bug, you can attach logs manually;
`archora diagnose` hashes file paths before printing.

## Analytics

The website (when it launches) uses cookie-less self-hosted Plausible
or Umami. Desktop and CLI have no telemetry, no heartbeats.

## Third parties

- **Payment provider**: checkout delivery is not wired in the current
  release. First licenses are issued manually from the request file the
  customer chooses to send.
- **GitHub**: the Archora GitHub App reads
  PR diffs and runs the CLI inside your CI environment. No scan data
  leaves GitHub Actions; the PR comment is produced and posted there.

## Your rights

We don't collect personal data, so there's nothing to request, export,
or delete from us. The data that exists is on your machine. For license
purchases, email **privacy@archora.io** to request deletion of your
email or payment record.

## Changes

Material changes are noted in `CHANGELOG.md` and on the website. This
file is the canonical source.

## Contact

Security: **security@archora.io** (see [Security policy](./security)).
Privacy: **privacy@archora.io**.
