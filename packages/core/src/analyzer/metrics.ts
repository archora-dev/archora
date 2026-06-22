import type { Cycle, DependencyEdge, ModuleId, ModuleMetrics, ModuleNode } from './types';

// Hotness premium for cycle membership: a module in an SCC is riskier than an
// equally-coupled module outside one (changes ripple both ways). 1.5 = a modest
// +50%: cycle membership lifts the score but does not override coupling itself.
// Heuristic default, justified ordinally (cycle > non-cycle), not data-calibrated.
const CYCLE_HOTNESS_MULTIPLIER = 1.5;

export interface ComputeMetricsInput {
  modules: ModuleNode[];
  edges: DependencyEdge[];
  cycles: Cycle[];
  entries: ModuleId[];
}

export function computeMetrics(input: ComputeMetricsInput): Record<ModuleId, ModuleMetrics> {
  const { modules, edges, cycles, entries } = input;

  const graphEdges = edges.filter((e) => e.kind !== 'type-only');
  const ids = modules.map((m) => m.id);

  const fanIn = new Map<ModuleId, number>();
  const fanOut = new Map<ModuleId, number>();
  for (const id of ids) {
    fanIn.set(id, 0);
    fanOut.set(id, 0);
  }
  for (const e of graphEdges) {
    fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
    fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  }

  const inCycle = new Set<ModuleId>();
  for (const c of cycles) {
    if (c.length > 1 || c.severity === 'direct') {
      for (const id of c.modules) inCycle.add(id);
    }
  }

  const depths = computeDepths(ids, graphEdges, cycles, entries);

  const result: Record<ModuleId, ModuleMetrics> = {};

  let maxCoupling = 0;
  const rawCoupling = new Map<ModuleId, number>();
  for (const id of ids) {
    const fi = fanIn.get(id) ?? 0;
    const fo = fanOut.get(id) ?? 0;
    const c = Math.log2(fi + 1) * Math.log2(fo + 1);
    rawCoupling.set(id, c);
    if (c > maxCoupling) maxCoupling = c;
  }

  let maxLoc = 0;
  for (const m of modules) if (m.loc > maxLoc) maxLoc = m.loc;

  for (const m of modules) {
    const id = m.id;
    const fi = fanIn.get(id) ?? 0;
    const fo = fanOut.get(id) ?? 0;
    const sum = fi + fo;
    const instability = sum === 0 ? 0 : fo / sum;
    const cycle = inCycle.has(id);
    const coupling = maxCoupling === 0 ? 0 : (rawCoupling.get(id) ?? 0) / maxCoupling;
    // sizeFactor ∈ [1, 2]: size, log2-normalized against the largest file. log
    // (not linear) so one giant file doesn't dominate; the upper bound of 2 caps
    // the size contribution at a doubling.
    const sizeFactor = maxLoc === 0 ? 1 : 1 + Math.log2(1 + m.loc) / Math.log2(1 + maxLoc);
    const hotness = coupling * (cycle ? CYCLE_HOTNESS_MULTIPLIER : 1) * sizeFactor;
    result[id] = {
      fanIn: fi,
      fanOut: fo,
      instability: round(instability),
      depth: depths.get(id) ?? 0,
      inCycle: cycle,
      couplingScore: round(coupling),
      hotnessScore: round(hotness),
    };
  }

  return result;
}

function computeDepths(
  ids: ModuleId[],
  edges: DependencyEdge[],
  cycles: Cycle[],
  entries: ModuleId[],
): Map<ModuleId, number> {
  const compOf = new Map<ModuleId, number>();
  let nextComp = 0;
  for (const c of cycles) {
    if (c.length > 1) {
      for (const id of c.modules) compOf.set(id, nextComp);
      nextComp++;
    }
  }
  for (const id of ids) {
    if (!compOf.has(id)) {
      compOf.set(id, nextComp++);
    }
  }

  const compEdges = new Map<number, Set<number>>();
  for (let i = 0; i < nextComp; i++) compEdges.set(i, new Set());
  for (const e of edges) {
    const a = compOf.get(e.from);
    const b = compOf.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    compEdges.get(a)?.add(b);
  }

  const indeg = new Map<number, number>();
  for (let i = 0; i < nextComp; i++) indeg.set(i, 0);
  for (const [, outs] of compEdges) for (const o of outs) indeg.set(o, (indeg.get(o) ?? 0) + 1);

  const order: number[] = [];
  const queue: number[] = [];
  for (const [c, d] of indeg) if (d === 0) queue.push(c);
  while (queue.length) {
    const c = queue.shift();
    if (c === undefined) break;
    order.push(c);
    for (const o of compEdges.get(c) ?? []) {
      const d = (indeg.get(o) ?? 0) - 1;
      indeg.set(o, d);
      if (d === 0) queue.push(o);
    }
  }

  const dist = new Map<number, number>();
  const entryComps = new Set<number>();
  for (const id of entries) {
    const c = compOf.get(id);
    if (c !== undefined) entryComps.add(c);
  }
  if (entryComps.size === 0) {
    for (let i = 0; i < nextComp; i++) if ((indeg.get(i) ?? 0) === 0) entryComps.add(i);
  }
  for (const c of entryComps) dist.set(c, 0);

  for (const c of order) {
    if (!dist.has(c)) continue;
    const d = dist.get(c) ?? 0;
    for (const o of compEdges.get(c) ?? []) {
      const cur = dist.get(o);
      if (cur === undefined || cur < d + 1) dist.set(o, d + 1);
    }
  }

  const depthByModule = new Map<ModuleId, number>();
  for (const id of ids) {
    const c = compOf.get(id);
    if (c === undefined) {
      depthByModule.set(id, 0);
      continue;
    }
    depthByModule.set(id, dist.get(c) ?? 0);
  }
  return depthByModule;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
