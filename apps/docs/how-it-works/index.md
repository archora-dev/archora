# How it works

Every insight Archora shows you is computed from the dependency graph by a documented, deterministic algorithm. No heuristics that say "here be dragons" without explaining why.

This section is the reference. Each page describes one insight: what it means, exactly how it's computed, and what to do about it.

## Pipeline

```
discoverFiles → parseFiles → resolveImports → buildGraph
                                                    ↓
              recommendations ← layer rules ← metrics ← cycles (Tarjan SCC)
                      ↓
                hot zones (composite score)
```

All steps are pure functions of the file source. There is no incremental cache and no daemon — every scan reads the project from scratch. The full pipeline runs in 2 seconds on ~1000 modules and ~10 seconds on ~5000 modules.

## Reference pages

- [Cycle detection](./cycles) — Tarjan SCC, cycle patterns, severity.
- [Feedback Arc Set](./feedback-arc-set) — picking the *one or two* edges that actually break a cycle.
- [Hot zones](./hot-zones) — the composite score behind the warm-colored nodes.
- [Layered architecture](./layers) — declared layers, layer violations, layer-aware recommendations.
- [Recommendations](./recommendations) — full catalog: split-god-module, unused-utility, type-only-candidate, misplaced-by-layer, isolated-cluster, cycle-break-candidate, cycle-break-cluster.

## A note on terminology

Throughout these pages:

- **module** — any file the analyzer parsed. `.ts`, `.tsx`, `.js`, `.jsx`, `.vue`, `.svelte`.
- **edge** — an `import` (static, dynamic via `import()` / `React.lazy` / `next/dynamic`, or type-only) that resolved to another project module. Framework auto-imports also count: Vue/Nuxt component tags used only in `<template>`, and Nuxt `composables/` called without an explicit import. These are marked `auto-import` with medium confidence.
- **fan-in** — number of modules importing this one. **fan-out** — number of modules this one imports.
- **cycle** — a strongly connected component in the import graph with ≥ 2 modules.
- **layer** — a named bucket of modules from `archora.config`.
