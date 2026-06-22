# FAQ

## Does Archora upload my code anywhere?

**No.** Everything runs locally — the desktop app, the CLI, the analyzer. There is no telemetry, no analytics ping, no auto-update server. See [Privacy](./privacy) for the exhaustive list of what does and doesn't leave your machine.

## Why BUSL-1.1, not MIT?

[Business Source License 1.1](https://github.com/archora-dev/archora/blob/main/LICENSE) is source-available with a commercial-use restriction that auto-converts to OSS after the change date. It lets us publish the source for inspection and evaluation while keeping real product use behind a paid commercial license.

Practically, for almost everyone reading this:

- **You can read, audit and build the source.**
- **You can clone or download it for personal evaluation for up to 30 days.**
- **Any real use beyond that evaluation window needs a paid commercial license.**

After 4 years each released version flips to Apache 2.0. We picked BUSL because we'd rather be honest about the boundary than pretend MIT solves all licensing problems.

## Does Vue 2 work?

**Partially.** The Vue parser handles `<script>` and `<script setup>` blocks of any Vue version that uses single-file components — Vue 2.7+ with composition API mostly works. Older Vue 2 codebases with Options API still parse, but file classification (`composable` / `store`) is tuned for Composition API patterns, so heuristics will be less precise.

If your project is on Vue 2 and the results look off, please open an issue with a reproducer. Vue 2 isn't a first-class target but we'd rather know what's broken.

## Monorepo with multiple `tsconfig.json`?

Supported. Point Archora at any directory containing a `package.json` — typically a workspace package. The analyzer:

- Walks `extends` chains in `tsconfig.json` (any depth).
- Resolves path aliases from the *closest* `tsconfig.json` to each file.
- Scans only the directory you point at, not the whole monorepo.

For a per-workspace dashboard, run the CLI per package and aggregate the JSON outputs yourself. Built-in multi-package reporting is planned, with no fixed date yet.

## Does it work on React / JSX / TSX?

Yes. JSX and TSX are first-class. `*.jsx` and `*.tsx` parse through the TypeScript compiler API, same as `*.ts`/`*.js`.

RSC server/client boundaries are detected automatically. A module's runtime is inferred from `'use client'` / `'use server'` directives, the `server-only` / `client-only` packages (Next's own poison-package enforcement), and framework folder conventions (Next `app/`, `pages/api/`, Nuxt `server/`, SvelteKit `+server.ts` / `*.server.ts`). Archora then flags `client → server` imports — both direct, and transitive leaks where a client component pulls server-only code through a chain of shared modules (the classic barrel/re-export leak that breaks the Next build). For your own conventions beyond RSC, use the [layered architecture](/how-it-works/layers) feature — define `server` and `client` as layers in `archora.config`.

## What about Svelte?

**Beta.** `.svelte` files are parsed, but script-block only and via regex extraction rather than the Svelte compiler — `<script>` and `<script context="module">` blocks are pulled out and analyzed as TypeScript/JavaScript, so static and dynamic `import()` edges are captured. Templates aren't parsed (Svelte resolves component imports through the script anyway). First-class targets are Vue, React, Nuxt and Next; Svelte is supported but not at the same depth.

## Will it slow down my CI?

For a 1000-module project the scan takes ~2 seconds. For 5000 modules — about 10 seconds. The bottleneck in CI is almost always the `npm ci` install step, not Archora.

If your job is timing out, suspect package install caching first.

## How does Archora compare to madge / dependency-cruiser?

Both are great tools. Archora adds:

- An analyzer-first Architecture Workspace with Overview, Explorer, Matrix, Cycles, Hotspots, Impact and Rules.
- Cycle-break edge detection via [feedback arc set](/how-it-works/feedback-arc-set), not just "here's the SCC."
- Composite [hot zone](/how-it-works/hot-zones) ranking.
- Shareable reports: readable HTML brief, full analyzer JSON and evidence-backed fix-plan JSON.
- Layer-aware [recommendations](/how-it-works/recommendations) (misplaced-by-layer, top-violator).

If you only need a CLI-only "list cycles in JSON" tool, both alternatives are fine. If you want guided architectural triage, Archora's design is built around it.

## What's the smallest project this is useful for?

Below ~50 modules the dependency structure is often small enough to hold in your head — Archora is *honest about this* and won't fabricate insights. You'll get an accurate scan and probably zero recommendations. That's a feature, not a bug.

The product really starts paying off around 200+ modules and gets more useful the larger the project gets. Around 5000+ we hit the current scaling target.

## Is there a configuration file?

Optional `archora.config.{ts,js,json,mjs,cjs}` at the project root. See [Configuration](/guide/configuration) for the full schema. No config = sensible defaults (no layer rules, full-tree scan, default include/exclude).

## How do I report a bug?

[GitHub Issues](https://github.com/archora-dev/archora/issues) with a reproducer. A scan over a public repo plus the resulting JSON envelope (`archora analyze . > scan.json`) is the most actionable kind of report.
