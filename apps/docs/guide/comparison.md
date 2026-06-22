# How Archora compares to madge / dependency-cruiser

[madge](https://github.com/pahen/madge) and [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) are the two best-known JavaScript dependency tools. Archora shares the underlying primitive — parse imports, build a graph — but optimises for a different workflow.

## Side by side

|                                | **madge**                                  | **dependency-cruiser**            | **Archora**                                                               |
| ------------------------------ | ------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------- |
| Primary use                    | Visualise / list dependencies, find cycles | Enforce architectural rules in CI | Diagnose what to fix first and verify the fix                                |
| Output                         | Tree, list, image (graphviz)               | Lint-style violations, dot graph  | Repair queue with reason/action/verify, HTML brief, fix-plan JSON            |
| UI                             | CLI only                                   | CLI only                          | Desktop app + CLI + reports                                                  |
| Cycle detection                | Yes                                        | Yes (rule-based)                  | Yes + suggested breakpoint, severity, type-only auto-fix candidate           |
| Layer / boundary rules         | No                                         | Yes (`forbidden`/`allowed`)       | Yes (`.archora.json` `contracts`/`layerOverrides`) with live preview      |
| Hot zones / risk score         | No                                         | No                                | Yes (fan-in/out + cycles + churn)                                            |
| Generated code policy          | No                                         | Some via excludes                 | Dedicated `analysis.generated` (exclude / classify) with priority adjustment |
| Bundle awareness               | No                                         | Some                              | Yes (heavy chunks, duplicates, hot solos, barrel tree-shaking leaks)         |
| Git history (churn / coupling) | No                                         | No                                | Yes (per-module churn, temporal coupling ranked by risk: hidden + cross-boundary first) |
| Frameworks                     | JS/TS                                      | JS/TS                             | TS/JS + Vue + Svelte + RSC directives                                        |
| Where the data lives           | Local                                      | Local                             | **Local** — source code never leaves your machine                            |
| CI exit codes                  | Limited                                    | Yes                               | Yes (`--fail-on grade:D`, `cycles:0`, `new-cycles:0`, `signals:high`, …)     |
| Reports for review             | Image / JSON                               | JSON / HTML                       | HTML brief + fix-plan JSON + JUnit + Markdown                                |
| Diff against baseline          | No                                         | Limited                           | Yes (`archora diff --base scan.json`)                                     |

## When to pick which

- **Quick visual / "do I have cycles?"** — madge is the cheapest answer.
- **Lint-style architectural assertions in CI** — dependency-cruiser's rule DSL is mature and works well as a pure linter.
- **Repair workflow on a real codebase** — Archora, because the question stops being "are there cycles?" and starts being "which one matters, why, where, and how do I verify the fix?". The Architecture Workspace, the fix-plan JSON, generated code policy and the diff baseline are built around that workflow.

You can also stack them: keep dependency-cruiser as a strict linter and use Archora as the diagnosis surface and PR brief.

## Local-first

Both madge and dependency-cruiser are local-first by default. Archora keeps that property explicit:

- The desktop app and the CLI run entirely on your machine. No network calls during scan, parse, analyse, report.
- No telemetry. No project metadata leaves the process.
- The cache (`.archora/`) is local files only.

If you bring Archora into a regulated environment, that property is the one you can point at.
