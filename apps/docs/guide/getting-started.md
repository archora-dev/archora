# Getting Started

Archora scans a Vue / React / Svelte / TypeScript repository and returns a prioritised architecture repair queue. Beyond cycles and layer violations, it surfaces the signals other dependency tools can't: temporal coupling from git history, bundle bloat from build stats, and server-only code leaking into client bundles.

Start with one command — no config, no graph to read first:

```bash
npx @archora/cli scan .
```

You get a grade, a blocking/clean verdict and a ranked list of what to fix first, each with a concrete next action. The engine (`@archora/core`) and CLI (`@archora/cli`) are open source under Apache-2.0.

Two surfaces share that engine:

- **CLI** (`@archora/cli`) — zero-config scans, CI gates and headless analysis. Free, Apache-2.0.
- **Desktop app** — the Architecture Workspace: Overview, Explorer, Matrix, Cycles, Hotspots, Impact, Rules and a persistent Inspector. The paid product.

Both run **locally**. Source code never leaves your machine.

## In 60 seconds

1. **Scan** — `npx @archora/cli scan .` from the repo root. No setup required.
2. **Add rules** (optional) — run `archora init . --dry-run`, then `archora init .` if the proposed `.archora.json` looks right.
3. **Gate CI** — `archora check . --fail-on grade:D --fail-on cycles:0` exits non-zero when the queue regresses.
4. **Go deeper** — open the Desktop Workspace to read the Overview, inspect why and where, then verify impact before changing code.

`init` writes conservative defaults: detected entry points, common build/cache
ignores, signal noise controls, generated-code policy when generated API files
are present, and workspace package contracts only when package entries are
detected. Existing configs are left untouched unless you pass `--force`.

## Where to next

- [Installation](./installation) — desktop + CLI.
- [First Scan](./first-scan) — a 2-minute walkthrough of the Architecture Workspace.
- [Demo script](./demo-script) — the shortest Review → Impact → Rules → Report story for screenshots or a walkthrough.
- [How it works](/how-it-works/) — the algorithms behind every insight.
- [CLI](/cli/) — for CI integration.
