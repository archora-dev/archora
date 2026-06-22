# Analyzer-first CLI views

These commands expose the analyzer-first workspace from the CLI. Use them when
you need a focused review artifact instead of a full report.

## Synopsis

```
archora matrix [path] [--input scan.json] [--group-by area|layer|folder|package] [--format json|md]
archora impact [path] --module <module-id-or-substring> [--input scan.json] [--format json|md]
archora explain [path] [--module <id> | --cycle <id> | --signal <stable-key>] [--input scan.json] [--base baseline.json] [--format json|md]
archora review [path] [--input scan.json] [--base baseline.json] [--format json|md] [--pr-comment] [--changed-files a.ts,b.ts]
archora ownership [path] [--input scan.json] [--format json|md] [--top N]
archora semantic [path] [--input scan.json] [--format json|md] [--top N]
archora hygiene [path] [--input scan.json] [--format json|md] [--top N]
archora trend [path] --base baseline.json [--input scan.json] [--format json|md]
```

`path` defaults to the current directory. When `--input` is present, the command
reads an existing `archora analyze` output and does not scan the repository.

## Commands

### `matrix`

Builds a dependency matrix grouped by area, layer, folder or package. The
default `area` mode is framework-agnostic and keeps non-FSD projects readable:
`src/mfes/orders` becomes `mfes/orders`, `src/utils/date.ts` becomes `utils`,
and app entry files become `app`. Markdown output starts with a compact summary
and then lists the riskiest cells first: violations, cycle edges and import
count.

JSON output includes each cell's concrete `edges` list with source module,
target module, import kind, specifier and `violation` / `cycleEdge` flags.
Markdown output adds a `Cell imports` section for the same drilldown so a PR
review can jump from an aggregate area relation to the exact imports to
inspect.

Useful filters:

| Option | Meaning |
| --- | --- |
| `--group-by area|layer|folder|package` | Matrix grouping. Default: `area`. |
| `--only-violations` | Show only cells with layer violations. |
| `--only-cycles` | Show only cells touching cycle edges. |
| `--top N` | Cap JSON/Markdown output to the first N ranked cells. |

### `impact`

Explains what depends on a module and what could change if that module moves.
The target can be an exact module id or a substring. Markdown includes direct
imports, direct importers, transitive affected modules, affected areas/folders,
touched cycles, related signals and core metrics.

### `explain`

Explains one target:

- `--signal <stable-key>` — evidence and next steps for a signal.
- `--cycle <id>` — cycle members, affected areas/folders/layers, path edges
  and suggested break point.
- `--module <id-or-substring>` — fan-in/fan-out, affected modules and next action.
- no target — project summary.

With `--base baseline.json`, the output includes signal baseline counts:
new, regressed and resolved.

### `review`

Builds a compact release/PR risk brief: risk score, risk level, main reasons,
affected areas and the modules to inspect first. It is meant for quick
pre-merge checks when a full report is too large.

The Markdown output includes a guided review plan: concrete steps such as
breaking a cycle boundary, fixing a layer rule, checking a CI-safe signal,
assigning lifecycle ownership or opening hotspot impact before editing a module.
Each step includes a verification hint so the reviewer can confirm the change
improved the architecture instead of only moving the risk.

With `--base baseline.json`, the brief also shows added/changed modules, new
cycles, resolved cycles and signal lifecycle changes.

Use `--pr-comment` when the output will be posted back to a pull request. This
mode keeps the brief short, adds stable `<!-- archora:review:start -->` /
`<!-- archora:review:end -->` markers for update-in-place comments, and points
readers to the full report command instead of expanding every checklist item.

Add `--changed-files` with a comma-separated list from the PR diff when you want
the brief to call out cycles, layer violations, hotspots and affected
areas/owners touched by those files.

### `ownership`

Groups modules by area and ranks areas by risk. The output highlights drift
candidates: areas where a large share of modules carry findings, plus hotspots
that do not fall into a clear project area.

### `semantic`

Shows semantic surface risks: broad public modules, exported modules with no
incoming usage and type/schema clusters. This works for non-FSD projects too:
roles come from path and parser facts, with `module` as the generic project
fallback instead of an "unknown" bucket.

### `hygiene`

Finds lifecycle cleanup candidates: detached modules, modules that look like
entry points but are not classified as entries, and generated modules with high
dependency pressure. When static memory or async lifecycle findings exist, the
view also reports side-effect ownership: which module owns browser side effects,
which architecture area it belongs to, and whether the boundary should be
reviewed. It is a review aid, not an automatic deletion list.

### `trend`

Compares the current scan against `--base` and summarizes whether architecture
debt improved, regressed or stayed stable. It combines debt score delta,
cycle lifecycle and signal lifecycle in one compact artifact.

## Examples

```bash
archora analyze . -o scan.json --quiet

archora matrix --input scan.json --group-by area --only-violations --format md
archora impact --input scan.json --module src/entities/order/model/orderStore.ts --format md
archora explain --input scan.json --signal contract:entities-widgets --format json
archora explain --input scan.json --base baseline.json --format md
archora review --input scan.json --format md
archora review --input scan.json --base baseline.json --format md
archora review --input scan.json --base baseline.json --pr-comment --changed-files src/features/auth/model/session.ts
archora ownership --input scan.json --format md
archora semantic --input scan.json --format md
archora hygiene --input scan.json --format md
archora trend --input scan.json --base baseline.json --format md
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | View built successfully. |
| `2` | Bad invocation, invalid format/grouping, or target not found. |
