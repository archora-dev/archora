import { describe, expect, it } from 'vitest';
import { cycleToFinding, hotspotToFinding } from '@/entities/finding';
import type { ModuleMetrics } from '@/core/analyzer/types';
import { resolveOpenInContext } from './resolveOpenInContext';

const metrics: ModuleMetrics = {
  fanIn: 1,
  fanOut: 1,
  instability: 0.5,
  depth: 1,
  inCycle: false,
  couplingScore: 0,
  hotnessScore: 80,
};

describe('resolveOpenInContext', () => {
  it('opens Impact on the real module anchor for a hotspot', () => {
    const finding = hotspotToFinding('src/a.ts', metrics, 0, 1);
    const target = resolveOpenInContext(finding, new Set(['src/a.ts']));
    expect(target).toEqual({ kind: 'drilldown', surface: 'impact', moduleId: 'src/a.ts' });
  });

  it('never targets a cycle: id — it anchors Impact on a real module in the cycle', () => {
    const finding = cycleToFinding({
      id: '842bc89',
      modules: ['src/a.ts', 'src/b.ts'],
      length: 2,
      severity: 'direct',
    });
    const target = resolveOpenInContext(finding, new Set(['src/a.ts', 'src/b.ts']));
    expect(target).toEqual({ kind: 'drilldown', surface: 'impact', moduleId: 'src/a.ts' });
    if (target.kind === 'drilldown') {
      expect(target.moduleId.startsWith('cycle:')).toBe(false);
    }
  });

  it('falls back to selecting the finding when the anchor is not a real module', () => {
    const finding = cycleToFinding({
      id: '842bc89',
      modules: ['src/ghost.ts'],
      length: 1,
      severity: 'direct',
    });
    // The module set does not contain the anchor, so Impact would be empty.
    const target = resolveOpenInContext(finding, new Set(['src/a.ts']));
    expect(target).toEqual({ kind: 'select' });
  });
});
