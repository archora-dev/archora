# `report`

Render a human-readable (or CI-readable) report from a scan.

## Synopsis

```
archora report [path] [--format md|html|junit|json] [--base <file>] [options]
```

## Options

| Option                  | Default | Meaning                                                        |
| ----------------------- | ------- | -------------------------------------------------------------- |
| `--format <fmt>`        | `md`    | One of `md` (alias `markdown`), `html`, `junit`, `json`.       |
| `--output`, `-o <file>` | —       | Write report to file. Otherwise printed to stdout.             |
| `--base <file>`         | —       | Baseline snapshot. Currently affects only the Markdown format. |
| `--quiet`               | —       | Suppress the "Wrote …" line on stderr.                         |

## Formats

| Format  | Best for                                    | Notes                                                        |
| ------- | ------------------------------------------- | ------------------------------------------------------------ |
| `md`    | PR comments, team chats, GitHub issues      | If `--base` is supplied, includes a "What changed" section.  |
| `html`  | Self-contained artifact for archiving       | Single file, no external assets.                             |
| `junit` | CI test reporters (GitLab, Jenkins, GitHub) | Each cycle / layer violation becomes a `<testcase failure>`. |
| `json`  | Same as `analyze` output                    | Identical to `archora analyze` JSON.                         |

Markdown and HTML reports include a **Signal review** section. It lists the
top signals with severity, confidence, lifecycle state, suppression reason,
modules and first evidence line, while keeping CI-safe signal counts separate
from suppressed or lower-confidence review items.

Markdown reports also include a **Review checklist**. It is intentionally short:
config errors first, then blocking contracts/layers, direct cycles, CI-safe
signals and the first hotspot. Each item carries one evidence line so the PR
comment stays actionable instead of becoming another raw dump.

When `--base` is supplied, the Markdown report includes **Baseline regression
drivers**: new cycles, changed modules with LOC deltas and newly added modules
that explain why the current scan is riskier than the baseline.

If `.archora.json` has schema or parsing problems, the report also includes a
**Rules config diagnostics** section with the exact config path and message.

## Examples

```bash
# Markdown for a PR comment
archora report . --format md -o report.md

# HTML you can open locally or attach to a build
archora report . --format html -o report.html

# JUnit for GitHub's "Tests" tab via dorny/test-reporter
archora report . --format junit -o reports/archora.xml

# Markdown that diffs against a stored baseline
archora report . --format md --base baseline.json -o report.md
```

## Pairing with `check`

`report` doesn't fail the build — it always exits `0` (or `2` on bad invocation). Pair it with [`check`](./check) when you want to _both_ publish a nice report _and_ fail the build:

```bash
archora report . --format md -o report.md --quiet
archora check . --fail-on grade:D --fail-on cycles:0
```
