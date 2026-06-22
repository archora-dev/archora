# CLI overview

`@archora/cli` runs the same analyzer as the desktop app but exits with a structured JSON envelope, suitable for piping into other tools, archiving, or gating CI.

## Synopsis

```
archora <command> [path] [options]
```

## Commands

| Command                                | What it does                                      |
| -------------------------------------- | ------------------------------------------------- |
| `init`                                 | Create a conservative `.archora.json` starter config. |
| `baseline write`                       | Write a scan snapshot for future `--base` checks. |
| [`analyze`](./analyze)                 | Run analysis, output JSON envelope.               |
| [`check` / `ci`](./check)              | Exit non-zero when `--fail-on` rules trip.        |
| [`diff`](./diff)                       | Diff a scan against a baseline JSON snapshot.     |
| [`report`](./report)                   | Render report (`md`, `html`, `junit`, `json`).    |
| [`matrix / impact / explain / review / ownership / semantic / hygiene / trend`](./views) | Headless analyzer-first review views. |

## Common options

| Option                       | Meaning                                           |
| ---------------------------- | ------------------------------------------------- |
| `--output`, `-o <file>`      | Write to file instead of stdout.                  |
| `--base <file>`              | Baseline JSON snapshot (`diff` / `report` / `check`). |
| `--input <file>`             | Reuse an existing scan JSON for analyzer-first view commands. |
| `--quiet`                    | Suppress progress messages on stderr.             |
| `--help`, `-h`               | Show help.                                        |
| `--version`, `-v`            | Show CLI version.                                 |

## Examples

```bash
# Inspect and write a starter rules config
archora init . --dry-run
archora init .
archora baseline write . -o .archora/baseline.json
archora review . --base .archora/baseline.json --changed-files src/features/auth/model/session.ts --pr-comment

# Quick analysis
archora analyze . > scan.json

# Gate CI on grade D / any cycles
archora check . --fail-on grade:D --fail-on cycles:0

# Same gate with CI-oriented naming
archora ci . --fail-on signals:high --base scan-baseline.json

# Markdown report for a PR comment
archora report . --format md -o report.md

# Diff against last week's baseline
archora diff . --base scan-baseline.json -o diff.json

# Analyzer-first review without rescanning
archora analyze . -o scan.json --quiet
archora matrix --input scan.json --group-by area --format md
archora impact --input scan.json --module src/features/auth/model/session.ts --format md
archora explain --input scan.json --base scan-baseline.json --format md
archora review --input scan.json --format md
archora ownership --input scan.json --format md
archora semantic --input scan.json --format md
archora hygiene --input scan.json --format md
archora trend --input scan.json --base baseline.json --format md
```

See [Exit codes](./exit-codes) and [CI integration](./ci) for putting this in pipelines.
