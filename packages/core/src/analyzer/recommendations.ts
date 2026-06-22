import type {
  Cycle,
  CycleFeedbackEdge,
  DependencyEdge,
  LayerViolation,
  ModuleId,
  ModuleMetrics,
  ModuleNode,
  Recommendation,
} from './types';
import { detectLayer } from './layers';
import { countBrokenCycles, feedbackArcSet, parseEdgeKey } from './feedbackArcSet';
import { classifyCyclePattern, type CyclePattern } from './cyclePatterns';
import type { TypeOnlyCandidate } from './typeOnlyCandidates';
import type { ContractViolation } from './contracts';
import type { BundleBloat } from './bundle/types';
import type { TemporalCoupling } from '../git/types';
import { displayShortId } from './displayId';

// heuristic recommendations. structured output (kind + params); UI does the i18n.
const MEMBERS_PREVIEW = 8;

export function computeRecommendations(inputs: {
  modules: ModuleNode[];
  edges: DependencyEdge[];
  metrics: Record<ModuleId, ModuleMetrics>;
  cycles: Cycle[];
  layerViolations: LayerViolation[];
  hotZones: ModuleId[];
  /** entry-point ids; clusters containing any entry are skipped */
  entries?: ModuleId[];
  /** Optional type-only candidates produced post-FAS by `findTypeOnlyCandidates`. */
  typeOnlyCandidates?: TypeOnlyCandidate[];
  /**
   * Architectural contract violations from the configured `contracts` block.
   * One `'contract-violation'` recommendation is emitted per violation,
   * weighted by severity. Optional - when omitted no contract recs surface.
   */
  contractViolations?: ContractViolation[];
  /**
   * Bundle bloat issues. One `bundle-bloat` recommendation per
   * issue, weighted by severity.
   */
  bundleBloat?: BundleBloat[];
  /**
   * Temporal couplings (already risk-sorted by the detector). We narrow to
   * pairs that are BOTH hidden (no static edge — visible ones duplicate the
   * dependency graph) AND cross-boundary (different top-level groups), the only
   * intersection worth a recommendation. Same-group co-change is batch-PR noise.
   */
  temporalCoupling?: TemporalCoupling[];
}): Recommendation[] {
  const { modules, edges, metrics, cycles, layerViolations, hotZones } = inputs;
  const entries = new Set(inputs.entries ?? []);
  const out: Recommendation[] = [];
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const hot = new Set(hotZones);

  // 1. split god-modules: top 5% fan-in AND >300 LOC
  const fanInValues = modules.map((m) => metrics[m.id]?.fanIn ?? 0).sort((a, b) => a - b);
  const fanInP95 = fanInValues[Math.floor(fanInValues.length * 0.95)] ?? 0;
  for (const m of modules) {
    if (m.isInfra) continue;
    const mt = metrics[m.id];
    if (!mt) continue;
    if (mt.fanIn >= fanInP95 && mt.fanIn >= 8 && m.loc >= 300) {
      out.push({
        id: `god:${m.id}`,
        kind: 'split-god-module',
        modules: [m.id],
        params: {
          name: shortId(m.id),
          fanIn: mt.fanIn,
          loc: m.loc,
        },
        weight: Math.min(1, mt.fanIn / 30 + m.loc / 1000),
      });
    }
  }

  // 2. unused utilities: kind=util with fanIn==0 (skip entries/integration)
  for (const m of modules) {
    if (m.isInfra) continue;
    if (m.kind !== 'util') continue;
    if (entries.has(m.id)) continue;
    const mt = metrics[m.id];
    if (!mt) continue;
    if (mt.fanIn !== 0) continue;
    out.push({
      id: `unused:${m.id}`,
      kind: 'unused-utility',
      modules: [m.id],
      params: { name: shortId(m.id) },
      weight: 0.4,
    });
  }

  // 3. cycle-break-cluster: FAS + pattern + counterfactual per SCC.
  //    Replaces the old single-edge `cycle-break-candidate` heuristic, which
  //    on dense SCCs with a barrel-like hub picks an arbitrary outgoing edge
  //    that breaks 1 of N parallel cycles - misleading on real codebases.
  for (const c of cycles) {
    const fas = feedbackArcSet(c.modules, edges);
    if (fas.feedback.size === 0) continue;
    const pattern = classifyCyclePattern({
      scc: c.modules,
      internalEdges: fas.internal,
      feedback: fas.feedback,
    });
    const broken = countBrokenCycles(c.modules, fas.internal, fas.feedback);
    const feedbackEdges: CycleFeedbackEdge[] = [...fas.feedback]
      .map((k) => {
        const { from, to } = parseEdgeKey(k);
        const stats = broken.byEdge.get(k);
        return {
          from,
          to,
          broken: stats?.broken ?? 0,
          partial: stats?.partial ?? broken.totalPartial,
        };
      })
      .sort((a, b) => b.broken - a.broken || a.from.localeCompare(b.from));

    // cycle.id already has the `cycle:` prefix; do not double it here.
    out.push({
      id: c.id.startsWith('cycle:') ? c.id : `cycle:${c.id}`,
      kind: 'cycle-break-cluster',
      modules: [...c.modules],
      params: cyclePatternParams(pattern, c, feedbackEdges, broken.totalCycles),
      weight: cycleWeight(pattern, c, feedbackEdges.length),
    });
  }

  // 3b. type-only candidates surface separately so they can outrank the
  //     architectural advice (cheapest possible fix - a single import edit).
  for (const tc of inputs.typeOnlyCandidates ?? []) {
    out.push({
      id: `typeonly:${tc.from}\u0001${tc.to}`,
      kind: 'type-only-candidate',
      modules: [tc.from, tc.to],
      params: {
        from: shortId(tc.from),
        to: shortId(tc.to),
        specifier: tc.specifier,
        bindings: tc.bindings.join(', '),
      },
      weight: 0.7,
    });
  }

  // 4. misplaced-by-layer: 70%+ of dependents live in a different layer
  const dependents = new Map<ModuleId, ModuleId[]>();
  for (const e of edges) {
    if (e.kind === 'type-only') continue;
    if (!dependents.has(e.to)) dependents.set(e.to, []);
    dependents.get(e.to)!.push(e.from);
  }
  for (const m of modules) {
    if (m.isInfra) continue;
    const layer = detectLayer(m.id);
    if (layer === 'unknown') continue;
    const incoming = dependents.get(m.id) ?? [];
    if (incoming.length < 5) continue;
    const layerCounts = new Map<string, number>();
    for (const id of incoming) {
      const l = detectLayer(id);
      layerCounts.set(l, (layerCounts.get(l) ?? 0) + 1);
    }
    let majorityLayer: string | null = null;
    let majorityCount = 0;
    for (const [l, n] of layerCounts) {
      if (l === 'unknown') continue;
      if (n > majorityCount) {
        majorityCount = n;
        majorityLayer = l;
      }
    }
    if (majorityLayer && majorityLayer !== layer && majorityCount >= incoming.length * 0.7) {
      out.push({
        id: `layer:${m.id}`,
        kind: 'misplaced-by-layer',
        modules: [m.id],
        params: {
          name: shortId(m.id),
          currentLayer: layer,
          targetLayer: majorityLayer,
          majority: majorityCount,
          total: incoming.length,
        },
        weight: 0.5 + 0.3 * (majorityCount / incoming.length),
      });
    }
  }

  // 5. isolated clusters: 5+ modules disconnected from rest (skip if has entry)
  const clusters = findIsolatedClusters(modules, edges);
  for (const cluster of clusters) {
    if (cluster.length < 5) continue;
    if (cluster.some((id) => moduleById.get(id)?.isInfra)) continue;
    if (cluster.some((id) => entries.has(id))) continue;
    if (cluster.length > modules.length * 0.5) continue;
    const sample = cluster.slice(0, 3).map(shortId).join(', ');
    out.push({
      id: `isolated:${cluster[0]!}`,
      kind: 'isolated-cluster',
      modules: cluster,
      params: { count: cluster.length, sample },
      weight: 0.45,
    });
  }

  // top 1-3 modules causing the most layer violations
  const violationByModule = new Map<ModuleId, number>();
  for (const v of layerViolations) {
    violationByModule.set(
      v.from,
      (violationByModule.get(v.from) ?? 0) + (v.severity === 'error' ? 2 : 1),
    );
  }
  const topViolators = [...violationByModule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [id, count] of topViolators) {
    if (count < 2) continue;
    out.push({
      id: `vhot:${id}`,
      kind: 'misplaced-by-layer',
      modules: [id],
      params: { name: shortId(id), count, asViolator: 1 },
      weight: 0.6 + Math.min(0.3, count / 20),
    });
  }

  // 6. contract violations: one rec per violation, weighted by severity. We
  // don't aggregate per-rule on purpose - each violation points at a concrete
  // edge or module that the user can act on; merging would lose the
  // drill-down value. Cap per-rule emission at 20 to keep huge bulk-imports
  // from drowning the recommendations list.
  if (inputs.contractViolations && inputs.contractViolations.length > 0) {
    const perRuleCount = new Map<string, number>();
    for (const v of inputs.contractViolations) {
      const seen = perRuleCount.get(v.ruleName) ?? 0;
      if (seen >= 20) continue;
      perRuleCount.set(v.ruleName, seen + 1);
      out.push({
        id: `contract:${v.id}`,
        kind: 'contract-violation',
        modules: v.modules,
        params: contractParams(v),
        weight: v.severity === 'error' ? 0.9 : 0.5,
      });
    }
  }

  // 8. temporal coupling: only the couplings that are BOTH hidden (no static
  // edge — the dependency graph already shows the rest) AND cross-boundary
  // (the two modules live in different top-level groups). That intersection is
  // the actionable "missing abstraction / leaky boundary" smell; everything
  // else is same-folder co-change a batch PR produces by the dozen. The raw
  // list is risk-sorted, so the filter keeps the highest-risk pairs first.
  // Cap at 10 to keep the panel readable on big histories.
  if (inputs.temporalCoupling && inputs.temporalCoupling.length > 0) {
    const couplings = inputs.temporalCoupling
      .filter((c) => c.hidden && c.crossBoundary)
      .slice(0, 10);
    for (const c of couplings) {
      out.push({
        id: `temporal:${c.a}\x00${c.b}`,
        kind: 'temporal-coupling',
        modules: [c.a, c.b],
        params: {
          a: c.a,
          b: c.b,
          aShort: displayShortId(c.a),
          bShort: displayShortId(c.b),
          coOccurrences: c.coOccurrences,
          // Round to 2 decimals so i18n templates render `0.83` not `0.8333…`.
          score: Math.round(c.score * 100) / 100,
        },
        // 0.5 .. 0.9 — driven by risk (strength + evidence + hidden + cross-boundary),
        // so a cross-boundary missing-abstraction outranks a same-folder pair.
        weight: 0.5 + Math.min(0.4, c.risk * 0.45),
      });
    }
  }

  // 7. bundle bloat: one rec per issue. Weighted so high-sev
  //    duplicates / heavy chunks outrank most heuristic recs.
  if (inputs.bundleBloat && inputs.bundleBloat.length > 0) {
    for (const b of inputs.bundleBloat) {
      out.push({
        id: `bundle:${b.id}`,
        kind: 'bundle-bloat',
        modules: b.modules,
        params: bundleParams(b),
        weight: bundleWeight(b),
      });
    }
  }

  const byId = new Map<string, Recommendation>();
  for (const r of out) byId.set(r.id, r);
  const final = [...byId.values()].sort((a, b) => b.weight - a.weight);

  // hot-zone amplifier
  for (const r of final) {
    if (r.modules.some((id) => hot.has(id))) r.weight = Math.min(1, r.weight + 0.1);
  }
  final.sort((a, b) => b.weight - a.weight);

  return final.slice(0, 20);
}

function contractParams(v: ContractViolation): Recommendation['params'] {
  const p: Record<string, string | number> = {
    kind: v.kind,
    rule: v.ruleName,
    severity: v.severity,
    message: v.message,
  };
  if (v.description) p['description'] = v.description;
  if (v.detail) {
    p['metric'] = v.detail.metric;
    p['value'] = v.detail.value;
    p['limit'] = v.detail.limit;
  }
  if (v.edge) {
    p['from'] = v.edge.from;
    p['to'] = v.edge.to;
    p['specifier'] = v.edge.specifier;
  }
  return p;
}

function cyclePatternParams(
  pattern: CyclePattern,
  cycle: Cycle,
  feedbackEdges: readonly CycleFeedbackEdge[],
  totalCycles: number,
): Recommendation['params'] {
  const base: Recommendation['params'] = {
    pattern: pattern.kind,
    severity: cycle.severity,
    sccLength: cycle.length,
    feedbackCount: feedbackEdges.length,
    totalCycles, // -1 = partial
    feedbackEdges,
    // preview for the title — full SCC is in `modules[]` on the recommendation
    members: cycle.modules.slice(0, MEMBERS_PREVIEW).map(shortId).join(', '),
  };
  switch (pattern.kind) {
    case 'mutual-pair':
      return { ...base, a: shortId(pattern.a), b: shortId(pattern.b) };
    case 'barrel-cycle':
      return {
        ...base,
        barrel: shortId(pattern.barrel),
        sibling: shortId(pattern.sibling),
      };
    case 'hub-feedback':
      return {
        ...base,
        hub: shortId(pattern.hub),
        incomingCount: pattern.incomingCount,
        valueImports: pattern.valueImports,
      };
    case 'long-chain': {
      const { from, to } = parseEdgeKey(pattern.bridge);
      return {
        ...base,
        chainLength: pattern.length,
        bridgeFrom: shortId(from),
        bridgeTo: shortId(to),
      };
    }
    case 'mixed':
      return base;
  }
}

function cycleWeight(pattern: CyclePattern, cycle: Cycle, feedbackCount: number): number {
  // direct cycles (2-cycle) are easier to fix and more obvious; weight them
  // higher. hub-feedback over a sizable scc indicates a real architectural
  // smell, also worth surfacing.
  const base = cycle.severity === 'direct' ? 0.85 : 0.6;
  if (pattern.kind === 'hub-feedback' && feedbackCount >= 3) return Math.min(0.95, base + 0.1);
  if (pattern.kind === 'barrel-cycle') return Math.min(0.9, base + 0.05);
  return base;
}

const shortId = displayShortId;

function bundleParams(b: BundleBloat): Recommendation['params'] {
  const p: Record<string, string | number> = {
    subkind: b.kind,
    severity: b.severity,
    message: b.message,
    chunks: b.chunks.join(', '),
  };
  if (b.detail?.sizeBytes !== undefined) p['sizeBytes'] = b.detail.sizeBytes;
  if (b.detail?.chunkCount !== undefined) p['chunkCount'] = b.detail.chunkCount;
  if (b.detail?.sharePercent !== undefined) p['sharePercent'] = b.detail.sharePercent;
  if (b.detail?.moduleCount !== undefined) p['moduleCount'] = b.detail.moduleCount;
  return p;
}

function bundleWeight(b: BundleBloat): number {
  // duplicates feel more actionable than just-large chunks; weight them up.
  // barrel-leak is a concrete, fixable tree-shaking miss - rank near duplicates.
  const base =
    b.kind === 'duplicate'
      ? 0.85
      : b.kind === 'barrel-leak'
        ? 0.8
        : b.kind === 'heavy-chunk'
          ? 0.7
          : 0.6;
  const bump = b.severity === 'high' ? 0.1 : b.severity === 'medium' ? 0.05 : 0;
  return Math.min(0.95, base + bump);
}

function findIsolatedClusters(modules: ModuleNode[], edges: DependencyEdge[]): ModuleId[][] {
  const adj = new Map<ModuleId, Set<ModuleId>>();
  for (const m of modules) adj.set(m.id, new Set());
  for (const e of edges) {
    if (e.kind === 'type-only') continue;
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }
  const visited = new Set<ModuleId>();
  const clusters: ModuleId[][] = [];
  for (const m of modules) {
    if (visited.has(m.id)) continue;
    const cluster: ModuleId[] = [];
    const stack = [m.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      cluster.push(id);
      const neighbors = adj.get(id);
      if (!neighbors) continue;
      for (const n of neighbors) if (!visited.has(n)) stack.push(n);
    }
    clusters.push(cluster);
  }
  return clusters.sort((a, b) => a.length - b.length);
}
