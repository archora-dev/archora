# Privacy

Archora runs on your machine. It reads source code locally, analyzes
locally, and does not send anything over the network by default. The
only outbound traffic is license validation once licensing launches.

Last updated: 2026-05-07.

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

Activating a license sends HTTPS to `api.archora.io` with: the
license key (HMAC-signed), Archora version, and a random
installation UUID (rotatable in settings). No email, project data, or
scan contents. Validation also works offline via an embedded signed
certificate; the network call is a heartbeat, not a gate.

### Crash reports

None automatically. If you open a bug, you can attach logs manually;
`archora diagnose` hashes file paths before printing.

## Analytics

The website (when it launches) uses cookie-less self-hosted Plausible
or Umami. Desktop and CLI have no telemetry, no heartbeats.

## Third parties

- **Paddle / Lemon Squeezy** processes payments.
  They receive checkout data (email, card, country). We receive email
  and a transaction ID to generate your license key.
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

Security: **security@archora.io** (see [SECURITY.md](SECURITY.md)).
Privacy: **privacy@archora.io**.
