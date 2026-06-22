# `analyze`

Run a fresh scan of a project and emit the full result as a JSON envelope.

## Synopsis

```
archora analyze [path] [options]
```

`path` is the project root (directory containing `package.json`). Defaults to the current working directory.

## Options

| Option                  | Type    | Default | Meaning                                        |
| ----------------------- | ------- | ------- | ---------------------------------------------- |
| `--output`, `-o <file>` | string  | —       | Write JSON to file instead of stdout.          |
| `--quiet`               | boolean | `false` | Suppress progress messages on stderr.          |
| `--help`, `-h`          | flag    | —       | Show help and exit.                            |

## Output

The command emits a `ScanResult` JSON envelope: project metadata, modules, edges, cycles, metrics, layer violations, recommendations, archDebt grade, and warnings. The exact schema is the same one the desktop app consumes — see [`packages/core/src/analyzer/types.ts`](https://github.com/archora-dev/archora/blob/main/packages/core/src/analyzer/types.ts) for the source of truth.

Stdout is JSON only. Progress and summary lines (`Scanning …`, `Done: N modules…`) are written to stderr, so piping is safe:

```bash
archora analyze . > scan.json          # scan.json gets pure JSON
archora analyze . | jq '.cycles | length'
```

## Examples

```bash
# Quick scan of the current directory
archora analyze . > scan.json

# Scan an external path, save to file, stay quiet
archora analyze ../my-app --quiet -o scan.json

# Just print the cycle count
archora analyze . --quiet | jq '.cycles | length'
```

## Exit codes

`0` on success, non-zero on a scan error (bad path, parser crash). For *result-driven* gating use [`check`](./check) instead.

See [Exit codes](./exit-codes) for the full table.
