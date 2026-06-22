import type { ArchDebt, Cycle, LayerViolation, ModuleMetrics, ModuleNode } from './types';

interface Inputs {
  modules: ModuleNode[];
  cycles: Cycle[];
  layerViolations: LayerViolation[];
  metrics: Record<string, ModuleMetrics>;
  hotZoneCount: number;
}

// Composite **heuristic summary** arch-debt 0..100 (higher = worse). Not a
// measurement but a weighted index of four proven components. Weights are ordered
// by structural severity and cost-to-fix (not data-calibrated — that needs a
// labeled corpus, see block A of the plan):
//   - cycles 0.35   — heaviest and most expensive to fix, breaks isolation.
//   - layers 0.30   — architectural erosion, but more local than a cycle.
//   - coupling 0.20 — a continuous soft signal (instability), not a bug per se.
//   - hotZones 0.15 — derived signal, partly overlaps coupling → lowest.
// Sum = 1.0. Each component saturates, normalized to project size. Surfaced in
// UI/reports as a "grade summary", not as a precise metric.
const DEBT_WEIGHTS = { cycles: 0.35, layers: 0.3, coupling: 0.2, hotZones: 0.15 } as const;

// Saturation divisors: the share of project modules at which a component nears
// saturation. cycles: ~5% of modules in cycles is already "bad"; layers stricter (~3%).
const CYCLE_SATURATION_RATIO = 0.05;
const LAYER_SATURATION_RATIO = 0.03;

// Letter-grade thresholds (score → grade). Ordinal cut-offs of the heuristic
// summary: <15 A (healthy) … ≥70 F (systemic debt).
const GRADE_THRESHOLDS = { A: 15, B: 30, C: 50, D: 70 } as const;

export function computeArchDebt(inputs: Inputs): ArchDebt {
  const realModules = inputs.modules.filter((m) => !m.isInfra);
  const moduleCount = Math.max(1, realModules.length);

  const cycleWeight = inputs.cycles.reduce((acc, c) => acc + (c.severity === 'direct' ? 2 : 1), 0);
  const cycleScore = saturate(cycleWeight / Math.max(1, moduleCount * CYCLE_SATURATION_RATIO));

  const violationWeight = inputs.layerViolations.reduce(
    (acc, v) => acc + (v.severity === 'error' ? 3 : 1),
    0,
  );
  const layerScore = saturate(violationWeight / Math.max(1, moduleCount * LAYER_SATURATION_RATIO));

  const hotScore = saturate((inputs.hotZoneCount * 10) / moduleCount);

  let instSum = 0;
  let instCount = 0;
  for (const m of realModules) {
    const metrics = inputs.metrics[m.id];
    if (!metrics) continue;
    instSum += metrics.instability;
    instCount++;
  }
  const couplingScore = instCount > 0 ? instSum / instCount : 0;

  const score = clamp(
    100 *
      (cycleScore * DEBT_WEIGHTS.cycles +
        layerScore * DEBT_WEIGHTS.layers +
        hotScore * DEBT_WEIGHTS.hotZones +
        couplingScore * DEBT_WEIGHTS.coupling),
  );

  return {
    score: Math.round(score),
    grade: gradeOf(score),
    breakdown: {
      cycles: Math.round(cycleScore * 100),
      layerViolations: Math.round(layerScore * 100),
      hotZones: Math.round(hotScore * 100),
      coupling: Math.round(couplingScore * 100),
    },
  };
}

function saturate(x: number): number {
  return 1 - 1 / (1 + Math.max(0, x));
}

function clamp(x: number): number {
  return Math.max(0, Math.min(100, x));
}

function gradeOf(score: number): ArchDebt['grade'] {
  if (score < GRADE_THRESHOLDS.A) return 'A';
  if (score < GRADE_THRESHOLDS.B) return 'B';
  if (score < GRADE_THRESHOLDS.C) return 'C';
  if (score < GRADE_THRESHOLDS.D) return 'D';
  return 'F';
}
