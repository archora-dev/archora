// Controlled precision/recall for layer violations (plan A3).
//
// Real OSS projects rarely declare FSD layers, so there is no external oracle.
// Instead we measure on a fixture with a KNOWN ground truth: a fixed set of
// legal (top-down / same-layer) edges and a fixed set of injected violations
// (bottom-up imports). The detector must flag exactly the violations.

import { describe, expect, it } from 'vitest';
import { detectLayerViolations } from '../layers';
import type { DependencyEdge, ModuleNode } from '../types';

const mod = (id: string): ModuleNode => ({
  id,
  absPath: `/${id}`,
  kind: 'unknown',
  language: 'ts',
  loc: 1,
  exports: [],
  isInfra: false,
});
const edge = (from: string, to: string): DependencyEdge => ({
  from,
  to,
  kind: 'static',
  specifier: to,
  resolved: true,
});

// One module per FSD layer (low → high: shared < entities < features < widgets < pages < app).
const A = 'src/app/A.ts';
const P = 'src/pages/P.ts';
const W = 'src/widgets/W.ts';
const F = 'src/features/F.ts';
const F2 = 'src/features/F2.ts';
const E = 'src/entities/E.ts';
const S = 'src/shared/S.ts';
const modules = [A, P, W, F, F2, E, S].map(mod);

// Legal: top-down (and same-layer) — must NOT be flagged.
const legal: DependencyEdge[] = [
  edge(A, P),
  edge(A, S),
  edge(P, W),
  edge(W, F),
  edge(F, E),
  edge(E, S),
  edge(F, F2),
];

// Injected violations: bottom-up imports — the ground-truth positives.
const violating: DependencyEdge[] = [
  edge(S, E),
  edge(S, A),
  edge(E, F),
  edge(F, W),
  edge(W, P),
  edge(P, A),
];

describe('layer violations — precision/recall on injected ground truth (A3)', () => {
  it('flags exactly the injected violations: precision = recall = 1.0', () => {
    const known = new Set(violating.map((e) => `${e.from}->${e.to}`));
    const detected = detectLayerViolations(modules, [...legal, ...violating]);
    const detectedPairs = detected.map((v) => `${v.from}->${v.to}`);

    const tp = detectedPairs.filter((p) => known.has(p)).length;
    const fp = detectedPairs.filter((p) => !known.has(p)).length;
    const fn = [...known].filter((p) => !detectedPairs.includes(p)).length;

    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);

    expect(precision).toBe(1); // no legal edge mis-flagged
    expect(recall).toBe(1); // every injected violation caught
    expect(tp).toBe(violating.length);
  });
});
