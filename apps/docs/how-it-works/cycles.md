# Cycle detection

A **cycle** is a group of modules that import each other in a loop, directly or through a chain. Cycles are the most common cause of "I touched one file and three other features broke" — module load order becomes load-bearing, type errors propagate in surprising directions, and tests start failing depending on the order they run in.

## Algorithm

Archora runs **Tarjan's strongly-connected-components** on the import graph. Type-only edges are excluded from this graph by default, because TypeScript erases them at build time and they don't participate in runtime cycles.

Each SCC with ≥ 2 modules is a cycle. Self-imports (length-1 SCCs) are surfaced separately as a `self-import` warning, not as a cycle.

Time complexity is `O(V + E)` — linear in modules + imports. On a 5000-module codebase this is single-digit milliseconds.

## Cycle patterns

After detecting cycles, Archora runs a second pass that classifies each one by typical shape:

| Pattern         | Looks like                                                                  | Typical fix                                              |
| --------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `mutual-pair`   | Exactly 2 modules importing each other.                                     | Extract a shared module, or invert one direction.        |
| `barrel-cycle`  | A folder's `index.ts` imports a sibling that imports back through the barrel. | Bypass the barrel from inside the folder.                |
| `hub-feedback`  | Many modules point at one shared "hub", which points back at one or more.   | Split the hub, or invert the back-edge.                  |
| `long-chain`    | A long path closed by 1–2 edges.                                            | Convert one closing edge to `import type` if applicable. |
| `no-shape`      | Couldn't classify confidently.                                              | Use the [feedback-arc-set](./feedback-arc-set) hint.     |

Pattern recognition is purely descriptive — it doesn't change the cycle, it just gives you a vocabulary to talk about it and pick the right fix.

## Severity

| Severity   | Meaning                                                  |
| ---------- | -------------------------------------------------------- |
| `direct`   | Length 2 — two modules importing each other.             |
| `indirect` | Length ≥ 3 — at least one intermediate hop.              |

The desktop app shows direct cycles in red and indirect ones in orange. The CLI reports both equally — counting them in `--fail-on cycles:N`.

## What about type-only cycles?

If the only thing closing the cycle is a `type` import, that import is erased at build time and the cycle effectively doesn't exist at runtime. Archora spots these as a [type-only candidate](./recommendations#type-only-candidate) recommendation: change `import` to `import type`, save the file, the cycle disappears.

## Limitations

- We don't model `import.meta.glob` or custom dynamic loaders by default. Configure them in `archora.config` if your codebase uses them — otherwise some "real" runtime edges will be missing from the graph.
- Cyclic *type* graphs (a `type Foo = { bar: Bar }` and vice versa) are not reported. TypeScript handles them just fine and they're not architectural debt.

## See also

- [Feedback Arc Set](./feedback-arc-set) — which edge to break.
- [Recommendations](./recommendations#cycle-break-candidate) — what Archora suggests.
