# @archora/cli

Command-line interface for [Archora](../../README.md). Runs the analyzer on
a local repository and produces JSON / Markdown / JUnit / HTML reports.
Designed for CI gates: `archora check` exits non-zero when configurable
thresholds are crossed.

## Install

```bash
npx @archora/cli init .
npx @archora/cli check .
npx @archora/cli report . --format md -o archora-report.md
npx @archora/cli report . --format fix-plan --git-history -o archora-fix-plan.json
```

For pinned CI installs:

```bash
npm install --save-dev @archora/cli
npx archora check .
```

## Commands

```
archora analyze <path> [-o file]
archora init    <path> [--dry-run] [--force]
archora baseline write <path> -o baseline.json
archora report  <path> --format md|html|junit|json [-o file] [--base baseline.json]
archora diff    <path> --base baseline.json [-o file]
archora check   <path> [--fail-on <rule> …] [--base baseline.json]
archora ci      <path> [--fail-on <rule> …] [--base baseline.json]
archora matrix  <path> [--group-by area|layer|folder|package] [--format json|md] [--input scan.json]
archora matrix  <path> [--only-violations] [--only-cycles] [--top N]
archora impact  <path> --module <module-id-or-substring> [--format json|md] [--top N] [--input scan.json]
archora explain <path> [--module <module-id> | --cycle <id> | --signal <stable-key>] [--input scan.json] [--base baseline.json]
archora review  <path> [--format json|md] [--input scan.json] [--base baseline.json] [--pr-comment] [--changed-files a.ts,b.ts]
archora ownership <path> [--format json|md] [--top N] [--input scan.json]
archora semantic <path> [--format json|md] [--top N] [--input scan.json]
archora hygiene <path> [--format json|md] [--top N] [--input scan.json]
archora trend   <path> --base baseline.json [--format json|md] [--input scan.json]
archora license request [--plan trial|solo|team|company] [--out license-request.md]
archora license activate <license-key>
archora license status [--json]
archora license remove
```

### `--fail-on` rules

Repeatable. The command exits with code `1` if any rule trips, else `0`.

| Rule                           | Meaning                                                     |
| ------------------------------ | ----------------------------------------------------------- | --- | --- | --- | --------------------------------------------------- |
| `grade:<A                      | B                                                           | C   | D   | F>` | Fail if `archDebt.grade` is at or below the letter. |
| `cycles:N`                     | Fail if more than N cycles.                                 |
| `layer-violations:N`           | Fail if more than N layer violations.                       |
| `recommendations:N`            | Fail if more than N recommendations.                        |
| `new-cycles:N`                 | Fail if the diff against `--base` adds more than N cycles.  |
| `new-layer-violations:N`       | Fail if the diff against `--base` adds more than N layer violations. |
| `new-contract-violations:N`    | Fail if the diff against `--base` adds more than N contract violations. |
| `signals:<severity>`           | Fail if any current CI-safe signal is at severity or above. |
| `new-signals:<severity>`       | Fail if the scan adds CI-safe signals versus `--base`.      |
| `regressed-signals:<severity>` | Fail if existing CI-safe signals regress versus `--base`.   |

CI-safe signal gates only count stable, high-confidence, unsuppressed, unresolved signals. Lower-maturity signals remain visible in reports without failing CI by default.

## Examples

```bash
# Bootstrap a conservative rules config. Use dry-run first if you want to
# inspect the JSON before writing `.archora.json`.
npx @archora/cli init . --dry-run
npx @archora/cli init .

# Create or update a mainline baseline intentionally.
npx @archora/cli baseline write . -o .archora/baseline.json

# Dump a JSON snapshot of the current repository.
npx @archora/cli analyze . -o scan.json

# `analyze` writes JSON to stdout or `-o`, and progress to stderr. When static
# memory or async lifecycle findings exist, stderr includes a short top list.
# `hygiene` groups those findings by side-effect owner for architecture review.

# CI: fail the build when the project drops to D or below, or any new cycle
# is introduced versus the previous mainline snapshot.
npx @archora/cli check . \
  --fail-on grade:D \
  --fail-on new-cycles:0 \
  --base ./snapshots/mainline.json

# Same command can use .archora.json architectureBudget without --fail-on.
npx @archora/cli check .

# Same gate with a CI-oriented command name.
npx @archora/cli ci . --fail-on signals:high --base ./snapshots/mainline.json

# PR comment: render a Markdown report with diff context.
npx @archora/cli report . --format md --base ./snapshots/mainline.json -o report.md
npx @archora/cli report . --format fix-plan --git-history -o fix-plan.json

# Analyzer-first review: inspect dependency matrix and module impact.
npx @archora/cli matrix . --group-by area --format md
npx @archora/cli impact . --module src/features/auth/model/session.ts --format md
npx @archora/cli explain . --signal 'contract:src/features/auth'
npx @archora/cli matrix --input scan.json --format md
npx @archora/cli review --input scan.json --format md
npx @archora/cli review --input scan.json --base baseline.json --format md
npx @archora/cli review --input scan.json --base baseline.json --pr-comment --changed-files src/features/auth/model/session.ts
npx @archora/cli ownership --input scan.json --format md
npx @archora/cli semantic --input scan.json --format md
npx @archora/cli hygiene --input scan.json --format md
npx @archora/cli trend --input scan.json --base baseline.json --format md
```

For analyzer-first review commands, `--input scan.json` reuses an existing
`archora analyze` output instead of scanning the repository again.
`matrix --format md` includes a `Cell imports` drilldown; JSON output includes
the same concrete edges under each cell.

Markdown and HTML reports are optimized for review, not raw dumps: they keep
blocking rule violations, signal review state, risk buckets, a short review
plan with verification hints, checklist and readable next actions near the top. Signal rows include
confidence, lifecycle state and suppression reason; CI-safe counts stay
separate from lower-confidence review items. Findings that only touch
`fixtures/**` are counted in the scan summary but hidden from human-facing
sections by default.

## License

`@archora/cli` is free and open source under **Apache-2.0** — use it in any
project, personal or commercial, including in CI. The CLI needs no license key.

The Archora desktop app is a separate, paid, source-available product. The
`archora license` subcommand exists only to manage a desktop license key
locally and is not required for any CLI command.

## Output streams

- **stdout**: machine-readable output (JSON / Markdown / JUnit / HTML body).
  Always safe to redirect to a file.
- **stderr**: progress and diagnostics. Suppressed by `--quiet`.
- **exit code**: `0` success, `1` rule tripped (`check`), `2` invalid usage,
  other non-zero on unexpected errors.

## Source layout

```
src/
  index.ts          # entrypoint + dispatch
  argv.ts           # minimal argv parser, no external dep
  commands/         # analyze | diff | report | check
  exporters/        # markdown | junit | html
  lib/              # loadScan, failOn rule parser
```

During development the CLI imports the analyzer through the `@archora/core`
workspace path. The published tarball bundles the core into `dist/index.js`,
so consumers do not need a separate `@archora/core` package.
