# Layered architecture

Most large frontend codebases settle on some kind of layering: app → pages → widgets → features → entities → shared (FSD), or domain → application → infrastructure (clean architecture), or some custom variant. The promise is the same: you can change a feature without touching the layer below it.

Archora checks that promise.

## Declaring layers

In `archora.config`:

```ts
layers: [
  { name: 'app',      patterns: ['src/app/**'] },
  { name: 'pages',    patterns: ['src/pages/**'] },
  { name: 'widgets',  patterns: ['src/widgets/**'] },
  { name: 'features', patterns: ['src/features/**'] },
  { name: 'entities', patterns: ['src/entities/**'] },
  { name: 'shared',   patterns: ['src/shared/**'] },
]
```

The order matters. **Earlier layers may import later ones, never the other way around.** That's the entire rule. No additional configuration, no per-pair allowlists.

If a module's path matches multiple patterns, the first match wins. Modules that match no pattern are unlayered — they don't participate in layer checks.

## Layer violation

A **layer violation** is an import from a *later* layer to an *earlier* one. Example: `src/shared/lib/foo.ts` importing from `src/features/bar/index.ts` is a violation, because `shared` should not know about `features`.

Each violation is a single edge: `from`, `to`, `fromLayer`, `toLayer`. They show up:

- In the Insights panel of the desktop app.
- As a `<testcase failure>` in JUnit reports.
- In `--fail-on layer-violations:N` for CI gates.

## Layer-aware recommendations

Beyond raw violation counting, Archora adds two layer-aware insights:

- [`misplaced-by-layer`](./recommendations#misplaced-by-layer) — a module's path puts it in layer X, but ≥ 70% of its dependents live in a *single different* layer Y. Re-homing it removes a lot of cross-layer noise.
- [`top-violator`](./recommendations#top-violator) — a single module is the source of a disproportionate number of layer violations. Often the cheapest single-file fix in the entire scan.

## Without layer config

Without `layers` in your config, layer checking is silently disabled — no violations, no layer recommendations. This is intentional: layered architecture is opinionated, and we don't want to invent rules you didn't ask for.

## Limitations

- Layer membership is path-only. A `*.vue` file in `src/shared/ui/` is treated as `shared` regardless of whether its `<script>` imports something from `features`. We're never going to infer "this should really be a widget" from code shape alone.
- The "may import" rule is one-directional. If you want bidirectional rules (e.g. "entities and shared may not import from each other") they'd need to live in two same-rank layers — currently not supported. Open an issue if you need this.

## See also

- [Recommendations](./recommendations) — full catalog including layer-aware ones.
