# Feedback Arc Set

The Feedback Arc Set (FAS) is the **set of edges to remove** to make a cycle disappear. For a clump of mutually-importing modules, knowing the SCC isn't enough — you want to know *which one or two imports are actually closing the loop*.

## The problem

Tarjan's SCC tells you "these 50 modules are in a cycle." That's true and unhelpful. You can't fix 50 modules at once. You want: "these 2 imports, if you remove or invert them, break every cycle in this group."

For arbitrary directed graphs, computing the *minimum* feedback arc set is NP-hard. We don't need optimum — we need a small, sensible set, fast.

## The heuristic

For each SCC of size ≥ 2:

1. **Score every internal edge** by a weighted combination of:
   - source module's fan-out (more imports out → more entangled),
   - source module's coupling score (composite of fan-in × fan-out),
   - whether the edge is dynamic (`() => import(...)`) — slightly preferred to break, since they're often already lazy.

   Coupling dominates. The intuition: removing an edge from a heavily-coupled module is more likely to expose a real architectural mistake (and pays better when fixed).

2. **Greedily pick edges** — highest score first — until no cycles remain inside the SCC. We re-run SCC detection after each removal to know when to stop. For typical SCCs (≤ 20 modules) this terminates in well under a millisecond.

3. **Bound the search.** For very large SCCs, we cap the candidate set so the heuristic stays fast. The desktop app shows a "search hit the limit — count is an estimate" hint when this happens; the count of cycles broken is then a lower bound.

## What you see in the UI

Every cycle gets a **"Imports that close the cycle"** section listing 1–2 specific edges. Clicking one jumps to the import line in your editor. The recommendation panel shows:

> Removes 7 of 12 cycles in this group.

This is the per-edge counterfactual: "if you delete (or invert) this single import, here's how many cycles in this group disappear." For small groups the count is exact; for large groups it's a lower bound (search depth was capped).

## Why not just say "delete edge X"?

Sometimes the right fix isn't deletion. It's:

- **Invert the import direction** — pull the dependency the other way.
- **Move the type to a shared module** — if both sides import a common type from each other, the type is the real shared dependency.
- **Convert to `import type`** — if all uses are types, this is the cheapest fix possible and Archora flags it as a separate [type-only candidate](./recommendations#type-only-candidate).

Archora only points at the edge. Choosing how to remove it is your call.

## See also

- [Cycle detection](./cycles) — how cycles are found in the first place.
- [Recommendations](./recommendations) — full catalog including `cycle-break-candidate` and `cycle-break-cluster`.
