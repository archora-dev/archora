# `diff`

Scan the project and emit a `ScanDiff` against a previously saved baseline.

Useful for "what changed since `main`" PR comments and for trend dashboards.

## Synopsis

```
archora diff [path] --base <baseline.json> [options]
```

## Options

| Option                  | Meaning                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `--base <file>`         | **Required.** Baseline JSON snapshot to compare against.      |
| `--output`, `-o <file>` | Write diff JSON to file instead of stdout.                    |
| `--quiet`               | Suppress the diff summary on stderr.                          |
| `--help`, `-h`          | Show help and exit.                                           |

## Output

A `ScanDiff` JSON document — see [`packages/core/src/diff`](https://github.com/archora-dev/archora/blob/main/packages/core/src/diff) for the schema. High-level fields:

- `summary` — counts of added / removed / changed modules and cycles.
- `addedModules`, `removedModules`, `changedModules` — per-module entries.
- `newCycles`, `resolvedCycles` — full cycle records.
- `metricDeltas` — per-module before/after for fan-in, fan-out, coupling, hotness.

A one-line summary is written to stderr:

```
Diff: +N / -M modules, K changed, +A / -B cycles.
```

## Examples

```bash
# Save a baseline today, diff a week later
archora analyze . > baseline.json
# … a week of refactors …
archora diff . --base baseline.json -o diff.json

# Pipe straight into jq
archora diff . --base baseline.json --quiet \
  | jq '{addedModules: (.addedModules | length), newCycles: (.newCycles | length)}'
```

## When to pick `diff` vs `report --base`

- **`diff`** — machine-readable JSON of changes only. Best for piping, custom dashboards, archiving.
- **`report --base`** — human-readable Markdown that *includes* the diff section. Best for PR comments.
