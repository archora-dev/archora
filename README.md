# Archora

[![npm](https://img.shields.io/npm/v/@archora/cli.svg)](https://www.npmjs.com/package/@archora/cli)
[![License](https://img.shields.io/badge/core%2Fcli-Apache--2.0-blue.svg)](./LICENSE)
[![License](https://img.shields.io/badge/desktop-source--available-orange.svg)](./LICENSE-DESKTOP)

> **Open-core.** The `@archora/core` analyzer and the `@archora/cli`
> command-line tool are free and open source under **Apache-2.0** — use them
> in any project, personal or commercial, including in CI.
> The Archora **desktop app** (team workspace, history, dashboards) is a paid,
> source-available product; see [`LICENSE-DESKTOP`](./LICENSE-DESKTOP).
>
> Desktop / commercial: **akotov@archora.dev** · Telegram **@akotofff**

---

A local analyzer that reads a frontend repository and tells you where the architecture is rotting — cycles, hot zones, layer violations, contract breaches, bundle bloat, churn-coupled modules. Runs as a desktop app, a CLI, or inside CI. No code leaves the machine.

Docs: **[docs.archora.dev](https://docs.archora.dev)**

## Why teams use it

- Catch architecture regressions in PRs before they become refactors.
- Keep a baseline with `architectureBudget` instead of arguing about taste.
- Turn cycles, layer violations and hot zones into a repair queue with evidence.
- Give non-CLI teammates a desktop cockpit: a merge-risk verdict, dead-code cleanup ROI, area risk, and per-finding triage (acknowledge / snooze / won't-fix).
- Stay local-first: scans and reports run on your machine or inside your CI.

## What it does, concretely

Given a path to a Vue / TS / JS project, Archora:

1. Parses every source file (TypeScript compiler API for `.ts`/`.tsx`, `@vue/compiler-sfc` for `.vue`), resolves imports across `tsconfig` alias chains, builds a dependency graph.
2. Runs Tarjan's SCC to find cycles; separates direct (length ≤ 2) from indirect.
3. Computes per-module fan-in, fan-out, instability, depth, coupling, hotness.
4. Maps the modules onto FSD-style layers (`shared → entities → features → widgets → pages → app`) and flags every edge that points the wrong way.
5. Checks user-declared contracts from `.archora.json`: boundary rules, package budgets, API stability, bundle thresholds.
6. If you pass `git log` to it, computes per-module churn and finds temporally coupled pairs — files that always change together but have no static edge between them. Those are usually missing abstractions.
7. If you pass webpack/rollup stats, finds bundle bloat — duplicated modules across chunks, heavy chunks, single modules dominating a chunk.
8. Reports the result as JSON, Markdown, or a self-contained HTML file you can ship to a reviewer.

Accuracy is measured two ways, both in [BENCHMARKS.md](./BENCHMARKS.md). The nine-project reference corpus is a **false-positive gate**: healthy Vue / React / Svelte / Nuxt / SvelteKit projects where the analyzer should stay silent, and does — a guard against crying wolf on clean code, not a score for how well it finds real problems. For independent accuracy we run cycle detection against [madge](https://github.com/pahen/madge) as an external oracle on third-party repos we did not tune for: zero false-positive cycles across the corpus, and stricter than madge wherever the compiler erases type-only edges.

## How it compares

|                                                             | Archora | madge | dependency-cruiser | knip    |
| ----------------------------------------------------------- | ------- | ----- | ------------------ | ------- |
| Dependency graph                                            | ✓       | ✓     | ✓                  | partial |
| Dynamic & framework-auto imports (React.lazy / next-dynamic / Nuxt composables) | ✓ | partial | partial | – |
| Cycle detection (SCC)                                       | ✓       | ✓     | ✓                  | –       |
| Layer rules                                                 | ✓       | –     | ✓ (config-heavy)   | –       |
| Architectural contracts (boundaries / budgets / API freeze) | ✓       | –     | partial            | –       |
| Bundle bloat (webpack / rollup stats)                       | ✓       | –     | –                  | –       |
| Server/client (RSC) boundary leak                           | ✓       | –     | –                  | –       |
| Temporal coupling (git churn correlation)                   | ✓       | –     | –                  | –       |
| Desktop UI / explorer                                       | ✓       | –     | –                  | –       |
| Self-contained HTML report                                  | ✓       | –     | partial            | –       |
| Local-first, no telemetry                                   | ✓       | ✓     | ✓                  | ✓       |

The point of overlap with `madge` and `dependency-cruiser` is the dependency graph and cycles. The point of difference is everything after that — layer/contract enforcement, bundle and git signals fused into the same report, and a desktop UI you can hand to a non-CLI teammate.

## Install path

```bash
npx @archora/cli init . --dry-run
npx @archora/cli init .
npx @archora/cli baseline write . -o .archora/baseline.json
npx @archora/cli check .
npx @archora/cli report . --format html -o archora-report.html
```

Recommended GitHub Actions path:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx -y @archora/cli@2.0.0 check . --fail-on grade:F
```

From source:

```bash
git clone https://github.com/archora-dev/archora.git
cd archora
npm install

npm run dev          # web dev server (Vite)
npm run tauri:dev    # desktop dev (Tauri 2)
npm run cli -- init ./your-project --dry-run
npm run cli -- analyze ./your-project -o scan.json
npm run cli -- report ./your-project --format html -o report.html
```

Open a project directory from the dashboard. The web build uses the File System Access API (Chromium browsers). The desktop build uses Tauri's directory picker.

## Desktop app

Pre-built binaries are attached to each [GitHub Release](https://github.com/archora-dev/archora/releases) (`.dmg` for macOS, `.msi`/`.exe` for Windows, `.deb`/`.AppImage` for Linux).

The desktop app requires a license key. A 30-day trial key is available on request — see [COMMERCIAL-LICENSE.md](./COMMERCIAL-LICENSE.md).

**The builds are currently unsigned.** This means the OS will show a security warning on first launch:

<details>
<summary>macOS — "app is damaged" or "unidentified developer"</summary>

After downloading the `.dmg`, if macOS blocks the app:

```bash
# Remove the quarantine attribute
xattr -cr /Applications/Archora.app
```

Or: right-click the app → Open → Open (in the dialog that appears).

</details>

<details>
<summary>Windows — SmartScreen warning</summary>

When Windows shows "Windows protected your PC":

Click **More info** → **Run anyway**.

</details>

<details>
<summary>Windows + WSL — scanning a project under <code>\\wsl$\…</code></summary>

The native Windows build reaches WSL files over the 9P protocol, which is slow for
the many small reads a scan performs. If your project lives inside WSL, either run
the **Linux build** or the **CLI inside WSL** against the native Linux path
(`/home/...`) rather than pointing the Windows app at `\\wsl$\...`.

</details>

## CLI

```bash
archora init . --dry-run                            # inspect conservative config
archora init .                                      # write .archora.json
archora baseline write . -o .archora/baseline.json  # intentional mainline baseline
archora check .                                     # architecture budget / fail-on gate
archora review . --base .archora/baseline.json --pr-comment
archora report . --format html -o archora.html
archora report . --format fix-plan -o fix-plan.json
```

`check` exits non-zero when thresholds are breached, so it slots into any CI as a regression gate.

## Demo script

The walkthrough script lives in:

- [`apps/docs/guide/demo-script.md`](./apps/docs/guide/demo-script.md)

The intended story is Review → Impact → Cycles/Rules → Report. The product no longer uses a full-project graph as the main UI.

## Architecture

Feature-Sliced Design, with a hard rule: `packages/core` has zero Vue / Pinia / Tauri / framework imports, and it can run in Node and inside a Web Worker without modification. UI layers respect `app → pages → widgets → features → entities → shared`. Both rules are enforced by ESLint, not just convention.

```
packages/
  core/        analyzer pipeline, dependency model, diff, metrics, report builders, contract engine
  cli/         @archora/cli — thin wrapper around core

src/
  app/         providers, router, layouts, global stores
  pages/       route containers
  widgets/     cockpit briefing, findings queue, command palette, drilldown surfaces (change risk / dead code / area risk / impact / explorer / rules), …
  features/    open-project, scan-project, export-report, apply-fix, layer-rules
  entities/    project / scan / history / export-history / settings / finding-triage Pinia stores
  shared/      UI primitives, hotkeys, Tauri runtime

src-tauri/     Rust shell, IPC commands, file watcher
apps/docs/     VitePress site (docs.archora.dev)
```

Analyzer pipeline:

```
discoverFiles → parseFiles → resolveImports → buildGraph
              → detectCycles → computeMetrics → rankHotZones → ScanResult
```

`FileSource` is the only IO seam. Implementations exist for Node FS, browser File System Access API, in-memory (tests, Web Worker payload) and Tauri.

## License

**Open-core.**

- **`@archora/core`, `@archora/cli`, the GitHub Action** — [Apache-2.0](./LICENSE). Free for any use, including commercial and CI.
- **Archora desktop app** (`src-tauri/`, Vue UI under `src/`) — proprietary, source-available; see [`LICENSE-DESKTOP`](./LICENSE-DESKTOP) and [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md). A paid license is required to use the desktop app beyond evaluation.

The CLI needs no license key. To use the desktop app:

```bash
# in the desktop app: Settings → License → Activate
```

## Status

`@archora/core` and `@archora/cli` are published on npm under Apache-2.0. The desktop app is source-available and requires a paid license beyond the 30-day evaluation period. Analyzer core, CLI, desktop workspace, reports, history, contracts engine and bundle/RSC/temporal-coupling signals are in. Architecture Explorer is analyzer-first; the legacy product graph UI has been removed.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run bench                                  # accuracy: precision/recall on reference corpus
npm run bench -- --threshold-precision=0.9     # use as a hard gate
```

CI runs `web` (lint + typecheck + test + coverage + build + `npm audit` + bench gate) and `tauri` (cargo + bundle smoke) on every push and PR.

## Links

- Docs: [docs.archora.dev](https://docs.archora.dev)
- Bug reports, feature requests, licensing: **akotov@archora.dev** · Telegram **@akotofff**
- Benchmarks: [BENCHMARKS.md](./BENCHMARKS.md)
- Privacy: [PRIVACY.md](./PRIVACY.md) — what data the tool touches and what stays on disk
- Security policy: [SECURITY.md](./SECURITY.md)
