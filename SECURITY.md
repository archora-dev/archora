# Security policy

## Supported versions

Archora supports the current minor and one prior minor for twelve months.

## Reporting

Email **akotov@archora.dev** with the subject prefix `[security]`, or
contact **@akotofff** on Telegram. Do not disclose the issue publicly
until a fix is released. Include repro steps, affected version, and any
PoC or logs.

We acknowledge within 48 hours and aim to ship a fix or documented
mitigation within 14 days for confirmed high-severity reports.

A PGP key will be published alongside the public release site.

## Scope

In scope: the desktop app, `@archora/core`, `@archora/cli`, the
analyzer parsers, and Rust IPC commands in `src-tauri/src/commands.rs`.

Out of scope: issues in the frameworks we analyze (Vue, React, Nuxt,
etc. — report upstream), DoS from pathological input projects (we bound
file size and apply discover filters, but crafted adversarial inputs
are a known limitation), and dev-dependency vulnerabilities that don't
reach production bundles (see below).

## Dependencies

CI runs `npm audit --omit=dev`; production vulnerabilities block the
release. Current state: 0 in production, a handful of moderate issues
in the dev chain (`vite@5` → `esbuild`) that affect only the dev server
and tests. Fixing those requires `vite@8` — planned as a separate
breaking upgrade.

Rust crates go through `cargo audit` in the release workflow; any
`Critical` advisory blocks the release.

## Design

- Local-first by default. The desktop app makes no network requests
  during a scan. The license check is the only planned outbound product
  request and is enumerated in the desktop CSP.
- Filesystem access is scoped to the picked root. `read_file` and
  `file_exists` reject absolute paths and `..`, canonicalize both the
  root and the target, and refuse anything that escapes. Covered by
  `cargo test` in `src-tauri/`.
- `read_file` caps input size at 2 MiB by default, 16 MiB hard max.
- No subprocesses. No shell interpolation of user input.
- Desktop WebView runs with a CSP that blocks `connect-src` outside an
  explicit allow-list.

## Planned hardening

Signed macOS/Windows/Linux builds, Playwright network-isolation smoke
on built artifacts, SAML SSO for Team/Enterprise, optional audit log.
