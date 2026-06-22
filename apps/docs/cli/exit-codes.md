# Exit codes

Every Archora CLI command follows the same convention.

| Code | Meaning                                                                  | Used by                  |
| ---- | ------------------------------------------------------------------------ | ------------------------ |
| `0`  | Success. For `check`: all `--fail-on` rules passed.                      | all commands             |
| `1`  | A rule tripped (`check`) **or** an unhandled error during the scan.       | `check`, all commands    |
| `2`  | Bad invocation: unknown command, missing required flag, invalid argument. | all commands             |

## Notes

- `analyze`, `diff`, `report` exit `0` even when the scan finds problems — they only describe state, they don't judge it. Use `check` for build gates.
- The CLI never throws unhandled exceptions silently. With `FRONTSCOPE_DEBUG=1` set in the environment, full stack traces are printed to stderr alongside the error message.
- Stdout is reserved for *data* (JSON, Markdown, HTML, JUnit). Diagnostics, progress messages and "OK / FAIL" summaries go to stderr.

## In CI

Most CI providers consider a non-zero exit code a build failure. That means dropping `archora check` into a step is enough — no extra wiring required. See [CI integration](./ci) for ready-to-paste configs.
