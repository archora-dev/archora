# Changelog

The full per-version changelog lives on [GitHub Releases](https://github.com/archora-dev/archora/releases). This page summarizes the milestones — for the record of _what shipped when_, the Releases page is canonical.

## Unreleased

- **Cockpit drilldowns.** Three analyzer-first surfaces reachable from the `Cmd+K` / `Ctrl+K` command palette: **Change risk** (the "should I merge?" verdict the CLI `review` produces, with baseline regression tracking when History has a baseline), **Dead code** (fully disconnected deletion candidates with reclaimable LOC, split isolated vs. script entry), and **Area risk** (areas ranked by concentrated architectural risk, with drifting areas and loose hotspots). See [Cockpit surfaces](/guide/cockpit-surfaces).
- **Finding triage.** Acknowledge, snooze, or mark findings won't-fix (with a reason), remembered per project. Snoozed and won't-fix findings drop out of the queue behind a reveal toggle; acknowledged stay visible but muted — so the queue keeps showing only what still needs attention.
- **Architecture lock in CI.** `archora check` now fails a PR on newly introduced layer or contract violations, not just new cycles (`--fail-on new-layer-violations:0`, `--fail-on new-contract-violations:0`). The Change risk surface shows the matching copy-paste CI command. See [CI integration](/cli/ci).
- **Why this grade.** The briefing explains the grade with ranked debt-driver bars (cycles / layer violations / hot zones / coupling), so the highest-leverage fix is obvious.
- **Readable fix plan.** The desktop **Fix plan** export now saves a standalone HTML document — repair order with per-finding action and verify, suggested batches by blast radius, and a verification order — with the raw JSON folded in. The fix-plan JSON for CI stays available through the save API and `archora report --format fix-plan`.
- **Switch projects anytime.** A persistent **Open project** action in the sidebar rail lets you change repositories mid-analysis, not only from the empty state.
- **English-only.** The desktop app and docs are now English-only; the Russian locale was removed.

## 1.3.0 — 2026-06-20

- **Graph completeness.** Edge recall is now measured against madge on real OSS repos (100% on the analysable corpus — a lower bound, since madge is blind to the dynamic edges below). `React.lazy` / `next/dynamic` and Nuxt `composables/` auto-imports resolve to edges; `tsconfig` alias→alias chains resolve recursively.
- **RSC depth.** Module runtime is inferred from the `server-only` / `client-only` packages in addition to directives and conventions; `client → server` leaks are detected both directly and **transitively** through shared barrel/re-export chains.
- **Bundle depth.** New `barrel-leak` signal flags a barrel that pulls its whole directory into one chunk (a tree-shaking miss) by fusing the import graph with bundler stats.
- **Temporal coupling.** Pairs are ranked by a risk score that boosts hidden, cross-boundary couplings (the "missing abstraction" smell), not just raw co-change.
- **Honest signals.** Heuristic findings (memory / async lifecycle) stay at `beta` maturity and cannot fail CI by default; composite arch-debt is presented as a heuristic summary with documented weights.

## 1.0.3 release candidate

- **Review workflow.** Review risk now includes a guided review plan in CLI reports and in the Architecture Workspace Overview, so the first concrete checks are visible before broad tables.
- **Lifecycle hygiene.** Static memory-risk and async lifecycle findings are grouped into a lifecycle hygiene view with side-effect ownership, UI details and CLI/report output.
- **Visual QA.** Architecture Workspace visual smoke captures Overview, Explorer, Matrix, Cycles, Hotspots, Impact and Rules screens with layout overflow/overlap checks.
- **Localization.** Russian UI copy for lifecycle, memory risk and guided review actions is tightened around product terms instead of mixed English/Russian labels.

## Already shipped

- **CLI 1.0.1.** Adds manual signed-key license commands: `license request`, `license activate`, `license status` and `license remove`.
- **Repair reports.** `fix-plan` now includes concrete repair actions for barrel cycles, layer boundaries, contract violations, hotspots, script entry candidates and churn-aware hotspot review.
- **Analyzer.** Tarjan SCC + Feedback Arc Set heuristic, hot-zone scoring, layered-architecture violations. Validated two ways: a false-positive gate on healthy reference projects, and a madge differential on third-party repos (see [BENCHMARKS](https://github.com/archora-dev/archora/blob/main/BENCHMARKS.md)).
- **Desktop UI.** Analyzer-first Architecture Workspace with diff against a baseline, file-watcher with incremental re-analyze, GUI editor for `.archora.json` layer overrides, global `Cmd+K` quick-jump search, exports, and a one-click `import` → `import type` auto-fix for cycle-break-via-types.
- **CLI.** `archora analyze`, `check`, `diff`, `report` with JSON / Markdown / JUnit / HTML output. `check` exits non-zero on configurable thresholds — designed to gate PRs.
- **Reports.** Self-contained HTML / JSON, scan history with module + cycle deltas between any two snapshots.
- **Multi-framework.** First-class Vue, React (JSX/TSX) and Nuxt/Next parsers (Svelte is beta — script-only); tsconfig path aliases respected including `extends` chains.
- **License.** BUSL-1.1 source-available license with a 30-day personal evaluation grant; real use requires a commercial license.

## Release-ready in repository

- `@archora/cli@1.0.3` is prepared for npm publication.
- Manual license flow is available through the CLI and local signed keys.
- GitHub Action metadata is available at the repository root for `uses: archora-dev/archora@v1.0.3`, but npm CLI is the recommended buyer CI path.
- Release docs cover desktop signing/notarization credentials, licensing scope and the public demo script.

## External release steps

- Re-test the repository Action from an external public project before documenting it as a primary path.
- Add signing credentials and publish signed/notarized desktop installers.
- Wire checkout/automatic license-key delivery and record the public demo video.

## Versioning

The public CLI starts at `1.0.0`:

- patch versions fix bugs and docs;
- minor versions add compatible CLI/report features;
- major versions may change CLI contracts or report schemas.

Each Release page documents breaking changes in a dedicated section when they happen.
