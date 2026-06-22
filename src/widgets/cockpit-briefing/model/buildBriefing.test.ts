import { describe, expect, it } from 'vitest';
import type { ArchitectureOverview, ArchitecturePriorityIssue } from '@/entities/architecture';
import { buildBriefing } from './buildBriefing';

function priorityIssue(over: Partial<ArchitecturePriorityIssue> = {}): ArchitecturePriorityIssue {
  return {
    id: 'cycle:c1',
    kind: 'cycle',
    severity: 'error',
    targetId: 'c1',
    affectedModules: 3,
    recommendation: {
      kind: 'cycle',
      severity: 'high',
      i18nKey: 'x',
      params: {},
      evidence: [],
    },
    ...over,
  };
}

function overview(over: Partial<ArchitectureOverview> = {}): ArchitectureOverview {
  return {
    totals: {
      modules: 20,
      dependencies: 40,
      domains: 3,
      cycles: 2,
      layerViolations: 1,
      hotZones: 4,
      orphanModules: 0,
    },
    topHotspots: [],
    topCycles: [],
    layerViolations: [],
    orphanModules: [],
    priorityIssues: [],
    areaRisks: [],
    folderRisks: [],
    layerRisks: [],
    suggestedActions: [],
    health: { debtScore: 12, grade: 'C' },
    ...over,
  };
}

describe('buildBriefing', () => {
  it('keys the assessment off the grade with totals as params', () => {
    const briefing = buildBriefing({
      overview: overview(),
      baselineOverview: null,
      findingsTotal: 7,
    });
    expect(briefing.grade).toBe('C');
    expect(briefing.assessment.i18nKey).toBe('cockpit.briefing.assessment.C');
    expect(briefing.assessment.params).toMatchObject({
      cycles: 2,
      layerViolations: 1,
      hotZones: 4,
    });
    expect(briefing.totals.findings).toBe(7);
  });

  it('ranks grade drivers by weighted share and drops zero contributors', () => {
    const briefing = buildBriefing({
      overview: overview(),
      baselineOverview: null,
      findingsTotal: 7,
      breakdown: { cycles: 30, layerViolations: 10, hotZones: 10, coupling: 0 },
    });
    expect(briefing.gradeDrivers.map((d) => d.label)).toEqual([
      'Cycles',
      'Layer violations',
      'Hot zones',
    ]);
    expect(briefing.gradeDrivers[0]?.share).toBeCloseTo(0.6);
    expect(briefing.gradeDrivers.some((d) => d.label === 'Coupling')).toBe(false);
    // Each driver maps to a finding type and carries the concrete count behind it.
    expect(briefing.gradeDrivers.map((d) => [d.kind, d.count])).toEqual([
      ['cycle', 2],
      ['layer-violation', 1],
      ['hotspot', 4],
    ]);
  });

  it('has no grade drivers when no breakdown is supplied', () => {
    const briefing = buildBriefing({
      overview: overview(),
      baselineOverview: null,
      findingsTotal: 0,
    });
    expect(briefing.gradeDrivers).toEqual([]);
  });

  it('takes at most the top three priorities with why/fix keys per kind', () => {
    const briefing = buildBriefing({
      overview: overview({
        priorityIssues: [
          priorityIssue({ id: 'a', kind: 'cycle', targetId: 'c1' }),
          priorityIssue({ id: 'b', kind: 'layer-violation', targetId: 'e1', severity: 'warning' }),
          priorityIssue({ id: 'c', kind: 'high-fan-out', targetId: 'm1', severity: 'warning' }),
          priorityIssue({ id: 'd', kind: 'orphan', targetId: 'orphan', severity: 'info' }),
        ],
      }),
      baselineOverview: null,
      findingsTotal: 4,
    });
    expect(briefing.priorities).toHaveLength(3);
    expect(briefing.priorities[0]).toMatchObject({
      id: 'a',
      why: { i18nKey: 'cockpit.briefing.why.cycle' },
      fix: { i18nKey: 'cockpit.briefing.fix.cycle' },
    });
    expect(briefing.priorities[1]?.why.i18nKey).toBe('cockpit.briefing.why.layer-violation');
  });

  it('caps same-kind priorities so "Start here" shows variety', () => {
    const briefing = buildBriefing({
      overview: overview({
        priorityIssues: [
          priorityIssue({ id: 'h1', kind: 'high-fan-out', targetId: 'm1', severity: 'warning' }),
          priorityIssue({ id: 'h2', kind: 'high-fan-in', targetId: 'm2', severity: 'warning' }),
          priorityIssue({ id: 'h3', kind: 'unstable-module', targetId: 'm3', severity: 'warning' }),
          priorityIssue({ id: 'c1', kind: 'cycle', targetId: 'c1' }),
        ],
      }),
      baselineOverview: null,
      findingsTotal: 4,
    });
    // high-fan-out, high-fan-in and unstable-module all read as "hotspot":
    // at most two of them, then the cycle fills the third slot.
    expect(briefing.priorities.map((p) => p.id)).toEqual(['h1', 'h2', 'c1']);
  });

  it('omits the baseline delta when no baseline overview is given', () => {
    const briefing = buildBriefing({
      overview: overview(),
      baselineOverview: null,
      findingsTotal: 0,
    });
    expect(briefing.baselineDelta).toBeNull();
  });

  it('computes signed deltas against a baseline overview', () => {
    const briefing = buildBriefing({
      overview: overview({
        totals: {
          modules: 20,
          dependencies: 40,
          domains: 3,
          cycles: 4,
          layerViolations: 0,
          hotZones: 4,
          orphanModules: 0,
        },
      }),
      baselineOverview: overview({
        totals: {
          modules: 20,
          dependencies: 40,
          domains: 3,
          cycles: 2,
          layerViolations: 1,
          hotZones: 4,
          orphanModules: 0,
        },
      }),
      findingsTotal: 4,
    });
    expect(briefing.baselineDelta).toEqual({
      cycles: 2,
      layerViolations: -1,
      hotZones: 0,
      unchanged: false,
    });
  });

  it('flags an unchanged baseline when every tracked metric is flat', () => {
    const briefing = buildBriefing({
      overview: overview(),
      baselineOverview: overview(),
      findingsTotal: 7,
    });
    expect(briefing.baselineDelta?.unchanged).toBe(true);
  });
});
