# `check` / `ci`

Run a scan and exit non-zero when one or more `--fail-on` rules trip. Designed to gate CI / pre-commit.
`archora ci` is an alias for the same command, useful when pipeline YAML should read like a CI gate.

## Synopsis

```
archora check [path] [--fail-on <rule>…] [options]
archora ci    [path] [--fail-on <rule>…] [options]
```

At least one `--fail-on` or `.archora.json` `architectureBudget` threshold is
required.

## Rules

`--fail-on` is repeatable. Each rule is `<key>:<value>`:

| Rule                   | Trips when …                                 | Needs `--base`? |
| ---------------------- | -------------------------------------------- | --------------- |
| `grade:<A\|B\|C\|D\|F>` | archDebt grade ≤ threshold                  | no              |
| `cycles:<N>`           | total cycles in scan > N                     | no              |
| `layer-violations:<N>` | total layer violations > N                   | no              |
| `recommendations:<N>`  | total recommendations > N                    | no              |
| `new-cycles:<N>`       | diff vs `--base` introduces > N new cycles   | **yes**         |
| `new-layer-violations:<N>` | diff vs `--base` introduces > N new layer violations | **yes** |
| `new-contract-violations:<N>` | diff vs `--base` introduces > N new contract violations | **yes** |
| `signals:<severity>`   | current CI-safe signals at severity or above | no              |
| `new-signals:<severity>` | new CI-safe signals vs `--base`            | **yes**         |
| `regressed-signals:<severity>` | existing CI-safe signals regress vs `--base` | **yes**   |

> Threshold semantics: `cycles:0` trips when there is *more than* zero cycles, i.e. any cycle at all. `cycles:5` allows up to 5.

Signal gates only count signals that are safe for CI: stable maturity, high confidence, not suppressed and not resolved. `beta` or `experimental` signals stay visible in JSON/report output but do not fail `signals:*` by default.

## Options

| Option                  | Meaning                                                  |
| ----------------------- | -------------------------------------------------------- |
| `--fail-on <rule>`      | Repeatable. Rule that fails the run (see above).         |
| `--base <file>`         | Baseline JSON snapshot. Required for the `new-*` rules (`new-cycles`, `new-layer-violations`, `new-contract-violations`, `new-signals`) and `regressed-signals`. |
| `--quiet`               | Suppress the "OK / FAIL" summary on stderr.              |
| `--help`, `-h`          | Show help and exit.                                      |

## Output

- **Pass:** stderr line `OK: N rule(s) passed. Grade …, K cycles, L violations.`, exit `0`.
- **Fail:** stderr lines `FAIL: M/N rule(s) tripped` followed by `  - <rule> → <description>` per failed rule, exit `1`.

Nothing is written to stdout. This makes `check` safe to chain with another command.

If `.archora.json` contains `architectureBudget`, `check` also evaluates those
thresholds and reports `architectureBudget → ...` with exact actual and budget
values when a limit is exceeded.

## Examples

```bash
# Gate any cycles, bad grade, or any layer violation
archora check . \
  --fail-on grade:D \
  --fail-on cycles:0 \
  --fail-on layer-violations:0

# Allow some debt but block regressions
archora check . \
  --fail-on grade:C \
  --fail-on new-cycles:0 \
  --base scan-baseline.json

# Block trusted signal regressions against a saved mainline scan
archora ci . \
  --fail-on new-signals:high \
  --fail-on regressed-signals:high \
  --base scan-baseline.json

# Use project-level architectureBudget from .archora.json
archora check .

# Update the mainline baseline intentionally
archora baseline write . -o .archora/baseline.json
```

## Exit codes

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| `0`  | All rules passed.                                             |
| `1`  | One or more rules tripped.                                    |
| `2`  | Bad invocation (no `--fail-on` or `architectureBudget`, invalid rule, missing baseline). |

See [CI integration](./ci) for GitHub Actions / GitLab examples.
