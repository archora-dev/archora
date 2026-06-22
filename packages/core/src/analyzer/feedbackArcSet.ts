import type { DependencyEdge, ModuleId } from './types';

/**
 * Edge identity within a SCC. Format `from\u0001to` is shared with
 * `graph/buildElements.ts` and `graph/index.ts` (`applyDiff` / `highlightPath`)
 * so we can pass feedback edges to the Cytoscape layer without re-keying.
 */
export type EdgeKey = string;

export function edgeKey(from: ModuleId, to: ModuleId): EdgeKey {
  return `${from}\u0001${to}`;
}

export function parseEdgeKey(key: EdgeKey): { from: ModuleId; to: ModuleId } {
  const i = key.indexOf('\u0001');
  return { from: key.slice(0, i), to: key.slice(i + 1) };
}

export interface FeedbackArcSetResult {
  /** Edges to remove to make the SCC acyclic (greedy approximation). */
  feedback: Set<EdgeKey>;
  /** Internal edges of the SCC (excluding type-only and duplicate parallel edges). */
  internal: DependencyEdge[];
  /** Topological order produced by Eades-Lin-Smyth. */
  order: ModuleId[];
}

/**
 * Greedy Feedback Arc Set (Eades-Lin-Smyth 1993) on a single SCC. Type-only
 * edges are excluded; `cycles.ts` already does the same at SCC detection.
 * For a singleton SCC with self-loop the self-edge is the only feedback edge.
 */
export function feedbackArcSet(scc: ModuleId[], allEdges: DependencyEdge[]): FeedbackArcSetResult {
  const inSet = new Set(scc);

  // dedupe parallel edges by (from,to) for the algorithm; keep originals around
  const internalByKey = new Map<EdgeKey, DependencyEdge>();
  for (const e of allEdges) {
    if (e.kind === 'type-only') continue;
    if (!inSet.has(e.from) || !inSet.has(e.to)) continue;
    const k = edgeKey(e.from, e.to);
    if (!internalByKey.has(k)) internalByKey.set(k, e);
  }
  const internal = [...internalByKey.values()];

  if (scc.length === 1) {
    const only = scc[0]!;
    const self = edgeKey(only, only);
    return {
      feedback: internalByKey.has(self) ? new Set([self]) : new Set(),
      internal,
      order: [...scc],
    };
  }

  // adjacency on the SCC subgraph; self-loops handled separately (algorithm
  // can't strip a vertex that points to itself without removing the loop first)
  const out = new Map<ModuleId, Set<ModuleId>>();
  const inn = new Map<ModuleId, Set<ModuleId>>();
  const selfLoops = new Set<ModuleId>();
  for (const m of scc) {
    out.set(m, new Set());
    inn.set(m, new Set());
  }
  for (const e of internal) {
    if (e.from === e.to) {
      selfLoops.add(e.from);
      continue;
    }
    out.get(e.from)!.add(e.to);
    inn.get(e.to)!.add(e.from);
  }

  const remaining = new Set(scc);
  const head: ModuleId[] = [];
  const tail: ModuleId[] = [];

  const removeVertex = (v: ModuleId): void => {
    remaining.delete(v);
    for (const w of out.get(v)!) inn.get(w)!.delete(v);
    for (const w of inn.get(v)!) out.get(w)!.delete(v);
    out.get(v)!.clear();
    inn.get(v)!.clear();
  };

  while (remaining.size > 0) {
    let stripped = true;
    while (stripped) {
      stripped = false;
      // strip sinks (out-degree 0) -> prepend to tail
      for (const v of [...remaining]) {
        if (out.get(v)!.size === 0) {
          tail.unshift(v);
          removeVertex(v);
          stripped = true;
        }
      }
      // strip sources (in-degree 0) -> append to head
      for (const v of [...remaining]) {
        if (inn.get(v)!.size === 0) {
          head.push(v);
          removeVertex(v);
          stripped = true;
        }
      }
    }
    if (remaining.size === 0) break;
    // pick vertex with max delta = outDeg - inDeg, tie-break on id for stability
    let best: ModuleId | null = null;
    let bestDelta = -Infinity;
    for (const v of remaining) {
      const d = out.get(v)!.size - inn.get(v)!.size;
      if (d > bestDelta || (d === bestDelta && best !== null && v < best)) {
        best = v;
        bestDelta = d;
      }
    }
    head.push(best!);
    removeVertex(best!);
  }

  const order = [...head, ...tail];
  const pos = new Map<ModuleId, number>();
  order.forEach((id, i) => pos.set(id, i));

  const feedback = new Set<EdgeKey>();
  for (const e of internal) {
    if (e.from === e.to) {
      feedback.add(edgeKey(e.from, e.to));
      continue;
    }
    const pf = pos.get(e.from);
    const pt = pos.get(e.to);
    if (pf !== undefined && pt !== undefined && pf > pt) {
      feedback.add(edgeKey(e.from, e.to));
    }
  }

  return { feedback, internal, order };
}

/**
 * Distinct elementary cycles broken by removing each feedback edge. Exact via
 * Johnson 1975 for SCC up to `exactLimit`; otherwise an estimate capped at
 * `pathCap` simple paths to→from with `partial: true` (the ranking by broken
 * count stays meaningful in both modes).
 *
 * Both enumerations are super-polynomial in the worst case: a dense SCC has
 * factorially many elementary cycles and simple paths, so an uncapped run never
 * returns on a real-world barrel-shaped cluster (the whole reason a scan could
 * hang). These results only RANK feedback edges for a suggested breakpoint, so
 * a bounded estimate is sufficient. `cycleCap` bounds Johnson's output and
 * `stepCap` bounds the simple-path DFS *work* (not just the paths found —
 * `pathCap` alone leaves the dead-end exploration unbounded). Anything past a
 * cap is reported via `partial` / `totalPartial`.
 */
export interface BrokenCyclesResult {
  byEdge: Map<EdgeKey, { broken: number; partial: boolean }>;
  totalCycles: number;
  totalPartial: boolean;
}

const DEFAULT_EXACT_LIMIT = 20;
const DEFAULT_PATH_CAP = 200;
/** Max elementary cycles Johnson enumerates before reporting a partial result. */
const DEFAULT_CYCLE_CAP = 100_000;
/** Max DFS node-visits per simple-path count before reporting a partial result. */
const DEFAULT_PATH_STEP_CAP = 200_000;

export function countBrokenCycles(
  scc: ModuleId[],
  internalEdges: DependencyEdge[],
  feedback: Set<EdgeKey>,
  opts: { exactLimit?: number; pathCap?: number; cycleCap?: number; stepCap?: number } = {},
): BrokenCyclesResult {
  const exactLimit = opts.exactLimit ?? DEFAULT_EXACT_LIMIT;
  const pathCap = opts.pathCap ?? DEFAULT_PATH_CAP;
  const cycleCap = opts.cycleCap ?? DEFAULT_CYCLE_CAP;
  const stepCap = opts.stepCap ?? DEFAULT_PATH_STEP_CAP;

  // adjacency on internal edges (deduped)
  const adj = new Map<ModuleId, Set<ModuleId>>();
  for (const m of scc) adj.set(m, new Set());
  for (const e of internalEdges) adj.get(e.from)?.add(e.to);

  if (scc.length <= exactLimit) {
    const { cycles, capped } = enumerateElementaryCycles(scc, adj, cycleCap);
    const byEdge = new Map<EdgeKey, { broken: number; partial: boolean }>();
    for (const k of feedback) byEdge.set(k, { broken: 0, partial: capped });
    for (const cyc of cycles) {
      for (let i = 0; i < cyc.length; i++) {
        const a = cyc[i]!;
        const b = cyc[(i + 1) % cyc.length]!;
        const k = edgeKey(a, b);
        if (feedback.has(k)) {
          const cur = byEdge.get(k)!;
          cur.broken++;
        }
      }
    }
    // When enumeration was capped the counts are lower bounds, so the total is
    // unknown (-1, matching the large-SCC convention) and the result partial.
    return { byEdge, totalCycles: capped ? -1 : cycles.length, totalPartial: capped };
  }

  // estimate via simple-path enumeration with cap; for each feedback edge a→b
  // count distinct simple paths b→a in the SCC (each = one elementary cycle
  // through that edge). Total cycle count is undefined for large SCC.
  const byEdge = new Map<EdgeKey, { broken: number; partial: boolean }>();
  for (const k of feedback) {
    const { from, to } = parseEdgeKey(k);
    const { count, capped } = countSimplePaths(to, from, adj, pathCap, stepCap);
    byEdge.set(k, { broken: count, partial: capped });
  }
  return { byEdge, totalCycles: -1, totalPartial: true };
}

// Johnson 1975: enumerate elementary cycles in a digraph. Used only for SCC up
// to ~20 nodes; in the worst case (complete digraph K_20) that's astronomically
// many cycles, so enumeration stops once `cap` cycles are found and reports
// `capped` — real SCCs are far sparser and finish well under the cap.
function enumerateElementaryCycles(
  vertices: ModuleId[],
  adj: Map<ModuleId, Set<ModuleId>>,
  cap: number,
): { cycles: ModuleId[][]; capped: boolean } {
  const cycles: ModuleId[][] = [];
  let capped = false;
  const blocked = new Set<ModuleId>();
  const blockMap = new Map<ModuleId, Set<ModuleId>>();
  const stack: ModuleId[] = [];

  const unblock = (u: ModuleId): void => {
    blocked.delete(u);
    const set = blockMap.get(u);
    if (!set) return;
    for (const w of [...set]) {
      set.delete(w);
      if (blocked.has(w)) unblock(w);
    }
  };

  // sort vertices for stable output; Johnson works on any ordering
  const sorted = [...vertices].sort();
  for (let i = 0; i < sorted.length; i++) {
    if (capped) break;
    const start = sorted[i]!;
    // restrict to subgraph induced by sorted[i..]
    const sub = new Set(sorted.slice(i));
    blocked.clear();
    blockMap.clear();
    for (const v of sub) blockMap.set(v, new Set());

    const circuit = (v: ModuleId): boolean => {
      if (cycles.length >= cap) {
        capped = true;
        return false;
      }
      let found = false;
      stack.push(v);
      blocked.add(v);
      for (const w of adj.get(v) ?? []) {
        if (capped) break;
        if (!sub.has(w)) continue;
        if (w === start) {
          if (cycles.length >= cap) {
            capped = true;
            break;
          }
          cycles.push([...stack]);
          found = true;
        } else if (!blocked.has(w)) {
          if (circuit(w)) found = true;
        }
      }
      if (found) {
        unblock(v);
      } else {
        for (const w of adj.get(v) ?? []) {
          if (!sub.has(w)) continue;
          blockMap.get(w)?.add(v);
        }
      }
      stack.pop();
      return found;
    };

    circuit(start);
  }
  return { cycles, capped };
}

// Count simple paths source→target, bounded on TWO axes: `cap` limits the paths
// counted, and `stepCap` limits total DFS node-visits. The step budget is the
// load-bearing one — counting simple paths is #P-complete, so a path cap alone
// leaves the exponential dead-end exploration unbounded and a dense SCC hangs.
function countSimplePaths(
  source: ModuleId,
  target: ModuleId,
  adj: Map<ModuleId, Set<ModuleId>>,
  cap: number,
  stepCap: number,
): { count: number; capped: boolean } {
  let count = 0;
  let capped = false;
  let steps = 0;
  const visited = new Set<ModuleId>();
  const dfs = (v: ModuleId): void => {
    if (count >= cap || steps >= stepCap) {
      capped = true;
      return;
    }
    steps++;
    if (v === target) {
      count++;
      return;
    }
    visited.add(v);
    for (const w of adj.get(v) ?? []) {
      if (count >= cap || steps >= stepCap) {
        capped = true;
        break;
      }
      if (visited.has(w)) continue;
      dfs(w);
    }
    visited.delete(v);
  };
  if (source === target) return { count: 1, capped: false };
  dfs(source);
  return { count, capped };
}
