# Recommendations

A **recommendation** is a single, actionable observation: a specific module to split, a specific import to convert, a specific cycle to break. Each carries the data that produced it (so you can verify), an explanation, and — when meaningful — a counterfactual ("removes 7 of 12 cycles in this group").

The catalog is small on purpose. We'd rather miss a borderline call than give you 200 noisy "consider reviewing X" cards.

## How recommendations are scored

Every recommendation gets a `severity` (`info` / `low` / `medium` / `high`) computed from the underlying signal. The desktop app sorts by severity then by impact (cycles broken, modules affected). The CLI exposes the same data in the `recommendations[]` field of the JSON envelope.

`--fail-on recommendations:N` in [`check`](/cli/check) trips when total recommendations > N — useful as a "any new advice at all" gate, but in most projects you'll prefer the more specific `cycles:0` or `layer-violations:0` gates.

## Catalog

### `split-god-module`

A module is in the project's top 5% by fan-in, has fan-in ≥ 8, **and** is at least 300 lines long.

All three thresholds matter. Fan-in alone over-flags small heavily-used utilities. Lines alone over-flags long but isolated files. Together they identify the "this file does too much and everyone depends on it" pattern.

**Typical fix:** identify cohesive groups of exports, extract them to sibling files, update the imports. Often a single file becomes 3–4 of half the size each.

### `unused-utility`

A file classified as `util` (path matches `utils|lib|helpers`) with fan-in 0. Fan-in counts static imports, dynamic imports (including template-literal `import()` and `import.meta.glob`), entry-point references, and integration files (loaders, plugins, registries) — these are excluded from "unused."

**Typical fix:** delete the file. This is one of the few recommendations where the action is unambiguous.

### `cycle-break-candidate`

For each cycle, the highest-scored internal edge from the [feedback-arc-set heuristic](./feedback-arc-set). Comes with the `removes N of M cycles in this group` counterfactual.

**Typical fix:** break the edge — by deletion, inversion, or moving the type.

### `cycle-break-cluster`

Groups parallel cycles that run through the same back-edges into a single recommendation. Useful when an SCC contains multiple cycles sharing one or two "closing" imports.

For each back-edge in the cluster you get an exact (small clusters) or estimated (large ones) count of distinct cycles passing through it. Pick the highest count first.

### `type-only-candidate`

A file imports a name from another file but **all** uses of that name are type positions (`x: SomeType`, `extends SomeInterface`, `as SomeType`). Changing `import` to `import type` is safe and erases the import at build time — and any cycle it was part of disappears with it.

A single value usage (`SomeType()`, `typeof SomeType`) disqualifies. We never flag a candidate when even one usage is a runtime value.

**Typical fix:** add the `type` modifier to the existing import. One-line change.

This is also the only recommendation kind with a built-in **auto-fix** in the desktop app. A wand-shaped button next to the `?` opens a side-by-side diff and offers *Apply* / *Apply and re-scan* / *Copy patch*. The patch is generated from the AST (`ts.createSourceFile`) — `import { A, B } from 'x'` becomes `import type { A, B } from 'x'`; if only some bindings are type-only, the import is split (`import { runtime } from 'x'; import type { Foo } from 'x';`) so the value side keeps working. Backups go to `.archora/backups/`. See [Working with the graph](/guide/working-with-graph#type-only-auto-fix).

### `misplaced-by-layer`

A module sits in layer X but ≥ 70% of its dependents are in a single different layer Y, with at least 5 dependents total.

**Typical fix:** move the file to layer Y. Removes the majority of cross-layer hops at once.

### `top-violator`

A single module is the source of multiple layer violations. The recommendation summarizes the count and the target layers.

**Typical fix:** review the imports of that one module. Often the underlying cause is mixed responsibilities — splitting the file (or moving it) eliminates several violations in one PR.

### `isolated-cluster`

A connected component of the undirected import graph (ignoring type-only edges) with ≥ 5 modules that:

- has no entry point inside it,
- contains no infrastructure files,
- isn't more than half the codebase (so we don't flag the *main* component as "isolated").

**Typical fix:** investigate. Likely dead code, a removed feature that didn't fully clean up, or a vendored copy that never got wired in. After confirming, delete or wire up.

Reachable runtime code (MFE loaders, `import.meta.glob`, custom dynamic loaders configured in `archora.config`) is wired up *before* this rule runs, so we don't false-positive lazy-loaded routes.

## Why no other recommendations?

We deliberately don't surface:

- "Function X is too long." Files yes, function-level metrics no — we'd need a different parser depth and the signal is too noisy.
- "Module X has too many imports." High fan-out alone isn't a problem worth a card; if it matters, it'll surface as part of a hot zone or a god-module.
- "Module X has been changed often." Git churn is a real signal but it's outside the architecture model — we'd rather keep the analyzer pure-of-graph and let other tools cover that.

## See also

- [Feedback Arc Set](./feedback-arc-set) — algorithm behind cycle-break recommendations.
- [Hot zones](./hot-zones) — how `split-god-module` graduates from a hot-zone signal.
- [Layered architecture](./layers) — `misplaced-by-layer` and `top-violator`.
