// Temporal coupling detector.
//
// Two modules are "temporally coupled" when they consistently change in the
// same commit. We compute a symmetric score:
//
//   coupling(a, b) = min( cooccurrences / commits(a),
//                         cooccurrences / commits(b) )
//
// Using `min` instead of `max` (or asymmetric scores) keeps the metric
// conservative: if `a` changes 100 times and `b` only 5 times, and they
// always co-change, the score isn't 100% (which the asymmetric view would
// suggest) — it's 0.05 in the `a` direction. We surface only pairs where
// BOTH directions agree, which is what `min` captures.
//
// We skip mass-edit commits (lockfile bumps, format-everything PRs) because
// every pair in such a commit gets a free co-occurrence which dilutes the
// signal.

import type { GitHistory, TemporalCoupling, TemporalCouplingThresholds } from './types';
import type { DependencyEdge, ModuleNode } from '../analyzer/types';

export interface ComputeTemporalCouplingInput {
  modules: ModuleNode[];
  edges: DependencyEdge[];
  history: GitHistory;
  thresholds?: TemporalCouplingThresholds;
}

const DEFAULTS: Required<TemporalCouplingThresholds> = {
  minCoOccurrences: 3,
  minScore: 0.5,
  maxPairs: 100,
  // Batch PRs (codegen bumps, "touch every composable" passes) co-change dozens
  // of files at once and flood the raw list with same-group noise. A real
  // architectural coupling shows up in small, focused commits, so cap fan-out
  // tighter than a typical batch PR.
  commitFanOutCap: 30,
};

export function computeTemporalCoupling(input: ComputeTemporalCouplingInput): TemporalCoupling[] {
  const t = { ...DEFAULTS, ...(input.thresholds ?? {}) };
  const moduleIds = new Set(input.modules.map((m) => m.id));

  const commitsByModule = new Map<string, number>();
  // Pair key = `${a}\x00${b}` with a < b lexically.
  const coOccurrences = new Map<string, number>();

  for (const commit of input.history.commits) {
    const touched = collectTouchedModules(commit, moduleIds);
    if (touched.length === 0) continue;
    if (touched.length > t.commitFanOutCap) continue;
    for (const m of touched) {
      commitsByModule.set(m, (commitsByModule.get(m) ?? 0) + 1);
    }
    // Pair contribution. `touched` is sorted in `collectTouchedModules`.
    for (let i = 0; i < touched.length; i++) {
      for (let j = i + 1; j < touched.length; j++) {
        const key = `${touched[i]}\x00${touched[j]}`;
        coOccurrences.set(key, (coOccurrences.get(key) ?? 0) + 1);
      }
    }
  }

  const staticPairs = collectStaticPairs(input.edges);
  const out: TemporalCoupling[] = [];
  for (const [key, n] of coOccurrences) {
    if (n < t.minCoOccurrences) continue;
    const sep = key.indexOf('\x00');
    const a = key.slice(0, sep);
    const b = key.slice(sep + 1);
    const ca = commitsByModule.get(a);
    const cb = commitsByModule.get(b);
    if (!ca || !cb) continue;
    const scoreA = n / ca;
    const scoreB = n / cb;
    const score = Math.min(scoreA, scoreB);
    if (score < t.minScore) continue;
    const hidden = !staticPairs.has(key);
    const crossBoundary = topBoundary(a) !== topBoundary(b);
    const risk = couplingRisk(score, n, hidden, crossBoundary);
    out.push({ a, b, coOccurrences: n, scoreA, scoreB, score, hidden, crossBoundary, risk });
  }

  // By risk (encodes hidden + cross-boundary + evidence), then score, then
  // co-occurrences, then alphabetically — stable across runs.
  out.sort((x, y) => {
    if (y.risk !== x.risk) return y.risk - x.risk;
    if (y.score !== x.score) return y.score - x.score;
    if (y.coOccurrences !== x.coOccurrences) return y.coOccurrences - x.coOccurrences;
    return x.a.localeCompare(y.a) || x.b.localeCompare(y.b);
  });

  if (out.length > t.maxPairs) out.length = t.maxPairs;
  return out;
}

function collectTouchedModules(
  commit: GitHistory['commits'][number],
  validIds: Set<string>,
): string[] {
  const touched = new Set<string>();
  for (const change of commit.changes) {
    if (validIds.has(change.path)) touched.add(change.path);
    if (change.renamedFrom && validIds.has(change.renamedFrom)) {
      touched.add(change.renamedFrom);
    }
  }
  return [...touched].sort();
}

// Top-level module group: first path segment after an optional `src/`. Files
// directly under the root share the '' group, so two of them are NOT cross-
// boundary. For FSD this is the layer (features/entities/shared/...).
function topBoundary(id: string): string {
  const p = id.startsWith('src/') ? id.slice(4) : id;
  const i = p.indexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

// Actionability score. Strength (`score`) tempered by evidence volume, boosted
// when the coupling is hidden (the static graph doesn't already reveal it) and
// when it crosses a module boundary (missing-abstraction smell). Capped at 1.
function couplingRisk(
  score: number,
  coOccurrences: number,
  hidden: boolean,
  crossBoundary: boolean,
): number {
  const evidence = Math.min(1, coOccurrences / 10);
  let risk = score * (0.5 + 0.5 * evidence);
  risk *= hidden ? 1.25 : 0.6;
  if (hidden && crossBoundary) risk *= 1.15;
  return Math.min(1, Math.round(risk * 1000) / 1000);
}

function collectStaticPairs(edges: DependencyEdge[]): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    const a = e.from < e.to ? e.from : e.to;
    const b = e.from < e.to ? e.to : e.from;
    out.add(`${a}\x00${b}`);
  }
  return out;
}
