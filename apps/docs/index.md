---
layout: home

hero:
  name: Archora
  text: See the coupling other tools miss
  tagline: Accurate frontend architecture analysis that finds files which always change together but share no import, surfaces bundle bloat and catches server-only code leaking into the client. Open source, zero-config, your code never leaves the machine.
  actions:
    - theme: brand
      text: Scan your repo
      link: /guide/getting-started
    - theme: alt
      text: First scan
      link: /guide/first-scan
    - theme: alt
      text: View on GitHub
      link: https://github.com/archora-dev/archora

features:
  - icon: 🕸️
    title: Temporal coupling
    details: "Find files that always change together in git history but have no import between them. madge and dependency-cruiser only see import edges — they can't see this hidden coupling at all."
  - icon: 📦
    title: Bundle bloat
    details: "Read your webpack or rollup stats and surface heavy chunks, duplicated modules and solo-hot files that quietly inflate the bundle. Turns a stats blob into a ranked fix list."
  - icon: 🚧
    title: RSC leak detection
    details: "Catch server-only code leaking into client bundles across Next.js, Nuxt and SvelteKit. Archora tracks <code>'server' | 'client' | 'shared'</code> runtime and flags the boundary crossings."
  - icon: 📐
    title: Architectural contracts
    details: "Enforce layer boundaries, budgets and API stability as code in <code>.archora.json</code>. Cycles, hot zones and layer violations gate CI before they reach review."
---

<div style="max-width: 1152px; margin: 4rem auto 0; padding: 0 24px;">

## Ships in seconds, no config

One command. No setup, no graph to read first — Archora scans the working directory and tells you what to fix first, why it matters and where the fix lives.

```bash
npx @archora/cli scan .
```

```text
Archora · your-app
Grade B · score 17/100 · blocking

  384 modules  ·  737 edges  ·  1 cycle  ·  0 layer violations  ·  10 hot zones

Fix this first
  1. Direct dependency cycle
     2 modules close a dependency cycle.
     → Break the import from src/analyzer/index.ts -> src/analyzer/incremental.ts.

  2. features-isolation
     …/apply-fix/ui/ApplyFixDialog.vue must not import …/features/open-project/index.ts
     → Narrow the exported surface or add an explicit policy exception.
```

You get a grade, a blocking/clean verdict and a prioritised repair queue with a concrete next action for each item — not a dependency hairball to interpret.

## Accurate by design

Archora does **not** report phantom type-only cycles. A value-syntax import (`import { Foo }`) used only in type position is erased by the compiler and creates no runtime edge — madge counts these as real cycles, Archora does not. The cycle and bundle numbers are validated against madge on real repositories, so the queue you act on reflects code that actually ships.

## Open core

The analysis engine (`@archora/core`) and the CLI (`@archora/cli`) are open source under Apache-2.0 — every analyzer above runs for free with `npx @archora/cli scan .`. The desktop Architecture Workspace, with the Inspector, live rule editing and shareable briefs, is the paid product. Source code never leaves your machine in either: no telemetry, no uploads, analysis runs locally.

## What you get

After a scan, Archora answers four questions directly:

1. What should I fix first?
2. Why is it risky?
3. Where is the evidence?
4. How do I verify the impact safely?

## How it compares

|                                | Archora                     | madge        | dependency-cruiser |
| ------------------------------ | --------------------------- | ------------ | ------------------ |
| Cycle detection                | ✅                          | ✅           | ✅                 |
| No phantom type-only cycles    | ✅ compiler-aware           | —            | —                  |
| Temporal coupling (git)        | ✅ change-together pairs    | —            | —                  |
| Bundle bloat                   | ✅ chunks / dupes / solos / barrel | —     | —                  |
| RSC leak detection             | ✅ server→client boundary   | —            | —                  |
| Hot zones / risk score         | ✅ fan-in/out + churn       | —            | —                  |
| Layer / boundary rules         | ✅ config-driven contracts  | —            | ✅                 |
| Vue / Svelte SFC support       | ✅ Vue · Svelte beta        | partial      | via plugin         |
| CI integration                 | ✅ exit codes + JUnit/MD    | text only    | ✅                 |

madge and dependency-cruiser are great at what they do. Archora shares the import-graph primitive but adds the signals only git history and bundle stats can give you — plus a workflow built around acting on them. See the [full comparison](/guide/comparison).

</div>
