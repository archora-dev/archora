import { describe, it, expect } from 'vitest';
import { parseFailOn } from '../lib/failOn';
import type { ScanResult, ScanDiff } from '@archora/core';

function makeScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/', detectedFramework: 'unknown' },
    modules: [],
    edges: [],
    cycles: [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 0,
    warnings: [],
    ...overrides,
  };
}

describe('parseFailOn', () => {
  it('grade:D fails for grades D and F, passes for A/B/C', () => {
    const rule = parseFailOn('grade:D');
    expect(
      rule.evaluate(makeScan({ archDebt: { ...makeScan().archDebt, grade: 'A' } }), null),
    ).toBe(false);
    expect(
      rule.evaluate(makeScan({ archDebt: { ...makeScan().archDebt, grade: 'C' } }), null),
    ).toBe(false);
    expect(
      rule.evaluate(makeScan({ archDebt: { ...makeScan().archDebt, grade: 'D' } }), null),
    ).toBe(true);
    expect(
      rule.evaluate(makeScan({ archDebt: { ...makeScan().archDebt, grade: 'F' } }), null),
    ).toBe(true);
  });

  it('cycles:N strictly greater', () => {
    const rule = parseFailOn('cycles:2');
    const cycle = { id: 'c', modules: ['a'], length: 1, severity: 'direct' as const };
    expect(rule.evaluate(makeScan({ cycles: [cycle, cycle] }), null)).toBe(false);
    expect(rule.evaluate(makeScan({ cycles: [cycle, cycle, cycle] }), null)).toBe(true);
  });

  it('new-cycles requires diff to evaluate', () => {
    const rule = parseFailOn('new-cycles:0');
    expect(rule.evaluate(makeScan(), null)).toBe(false);
    // Only the `newCycles` length matters for the rule; partial cast is
    // safer than constructing a fully-formed ScanDiff for one assertion.
    const diff = {
      newCycles: [{ id: 'c', modules: [], length: 0, severity: 'direct' }],
    } as unknown as ScanDiff;
    expect(rule.evaluate(makeScan(), diff)).toBe(true);
  });

  it('contract-violations:N fails on > N violations', () => {
    const rule = parseFailOn('contract-violations:0');
    const violation = {
      id: 'v',
      kind: 'boundary' as const,
      ruleName: 'r',
      severity: 'error' as const,
      message: '',
      modules: [],
    };
    expect(rule.evaluate(makeScan(), null)).toBe(false);
    expect(rule.evaluate(makeScan({ contractViolations: [violation] }), null)).toBe(true);
  });

  it('contract-errors:N counts only error severity', () => {
    const rule = parseFailOn('contract-errors:0');
    const warning = {
      id: 'w',
      kind: 'boundary' as const,
      ruleName: 'r',
      severity: 'warning' as const,
      message: '',
      modules: [],
    };
    const error = { ...warning, id: 'e', severity: 'error' as const };
    expect(rule.evaluate(makeScan({ contractViolations: [warning] }), null)).toBe(false);
    expect(rule.evaluate(makeScan({ contractViolations: [error, warning] }), null)).toBe(true);
  });

  it('signals:severity only fails on CI-safe signals', () => {
    const rule = parseFailOn('signals:high');
    expect(
      rule.evaluate(
        makeScan({
          signals: [
            {
              id: 's1',
              stableKey: 'bundle:a',
              kind: 'bundle-bloat',
              title: 'bundle',
              severity: 'high',
              confidence: 'high',
              actionability: 'manual',
              status: 'new',
              maturity: 'beta',
              modules: ['src/a.ts'],
              evidence: [
                {
                  kind: 'bundle',
                  message: 'bundle issue',
                  confidence: 'high',
                },
              ],
              limitations: [],
              ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
            },
            {
              id: 's3',
              stableKey: 'contract:suppressed',
              kind: 'contract-violation',
              title: 'contract suppressed',
              severity: 'critical',
              confidence: 'high',
              actionability: 'manual',
              status: 'new',
              maturity: 'stable',
              modules: ['src/b.ts'],
              evidence: [
                {
                  kind: 'contract',
                  message: 'suppressed issue',
                  confidence: 'high',
                },
              ],
              limitations: [],
              ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
              suppressed: true,
            },
            {
              id: 's4',
              stableKey: 'contract:resolved',
              kind: 'contract-violation',
              title: 'contract resolved',
              severity: 'critical',
              confidence: 'high',
              actionability: 'manual',
              status: 'resolved',
              maturity: 'stable',
              modules: ['src/c.ts'],
              evidence: [
                {
                  kind: 'contract',
                  message: 'resolved issue',
                  confidence: 'high',
                },
              ],
              limitations: [],
              ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
            },
          ],
        }),
        null,
      ),
    ).toBe(false);
    expect(
      rule.evaluate(
        makeScan({
          signals: [
            {
              id: 's2',
              stableKey: 'contract:a',
              kind: 'contract-violation',
              title: 'contract',
              severity: 'high',
              confidence: 'high',
              actionability: 'manual',
              status: 'new',
              maturity: 'stable',
              modules: ['src/a.ts'],
              evidence: [
                {
                  kind: 'contract',
                  message: 'contract issue',
                  confidence: 'high',
                },
              ],
              limitations: [],
              ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
            },
          ],
        }),
        null,
      ),
    ).toBe(true);
    expect(
      rule.evaluate(
        makeScan({
          signals: [
            {
              id: 's3',
              stableKey: 'contract:suppressed',
              kind: 'contract-violation',
              title: 'contract suppressed',
              severity: 'critical',
              confidence: 'high',
              actionability: 'manual',
              status: 'new',
              maturity: 'stable',
              modules: ['src/b.ts'],
              evidence: [
                {
                  kind: 'contract',
                  message: 'suppressed issue',
                  confidence: 'high',
                },
              ],
              limitations: [],
              ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
              suppressed: true,
            },
            {
              id: 's4',
              stableKey: 'contract:resolved',
              kind: 'contract-violation',
              title: 'contract resolved',
              severity: 'critical',
              confidence: 'high',
              actionability: 'manual',
              status: 'resolved',
              maturity: 'stable',
              modules: ['src/c.ts'],
              evidence: [
                {
                  kind: 'contract',
                  message: 'resolved issue',
                  confidence: 'high',
                },
              ],
              limitations: [],
              ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
            },
          ],
        }),
        null,
      ),
    ).toBe(false);
  });

  it('new-signals and regressed-signals compare against baseline', () => {
    const newRule = parseFailOn('new-signals:high');
    const regressedRule = parseFailOn('regressed-signals:high');
    const baseline = makeScan({
      signals: [signal({ stableKey: 'contract:a', severity: 'medium' })],
    });
    const current = makeScan({
      signals: [
        signal({ stableKey: 'contract:a', severity: 'high' }),
        signal({ stableKey: 'contract:b', severity: 'high' }),
      ],
    });
    const context = { baseline, diff: null };

    expect(newRule.evaluate(current, context)).toBe(true);
    expect(regressedRule.evaluate(current, context)).toBe(true);
    expect(newRule.describe(current, context)).toContain('new CI-safe signals');
    expect(regressedRule.describe(current, context)).toContain('regressed CI-safe signals');
    expect(newRule.evaluate(current, null)).toBe(false);
  });

  it('new-layer-violations trips on diff with new violations, no-ops without baseline', () => {
    const rule = parseFailOn('new-layer-violations:0');
    expect(rule.evaluate(makeScan(), null)).toBe(false);
    const diff = {
      newLayerViolations: [
        {
          edgeId: 'edge:a→b',
          from: 'src/a.ts',
          to: 'src/b.ts',
          fromLayer: 'features',
          toLayer: 'app',
          severity: 'error',
        },
      ],
    } as unknown as ScanDiff;
    expect(rule.evaluate(makeScan(), diff)).toBe(true);
    expect(rule.describe(makeScan(), null)).toContain('no baseline supplied');
    expect(rule.describe(makeScan(), diff)).toContain('new layer violations=1');
  });

  it('new-contract-violations trips on diff with new violations, no-ops without baseline', () => {
    const rule = parseFailOn('new-contract-violations:0');
    expect(rule.evaluate(makeScan(), null)).toBe(false);
    const diff = {
      newContractViolations: [
        {
          id: 'boundary:auth:0',
          kind: 'boundary',
          ruleName: 'no-cross-layer',
          severity: 'error',
          message: 'violation',
          modules: ['src/a.ts'],
        },
      ],
    } as unknown as ScanDiff;
    expect(rule.evaluate(makeScan(), diff)).toBe(true);
    expect(rule.describe(makeScan(), null)).toContain('no baseline supplied');
    expect(rule.describe(makeScan(), diff)).toContain('new contract violations=1');
  });

  it('rejects malformed rules', () => {
    expect(() => parseFailOn('garbage')).toThrow();
    expect(() => parseFailOn('grade:Q')).toThrow();
    expect(() => parseFailOn('cycles:abc')).toThrow();
    expect(() => parseFailOn('unknown:1')).toThrow();
    expect(() => parseFailOn('signals:nope')).toThrow();
  });
});

function signal(
  overrides: Partial<NonNullable<ScanResult['signals']>[number]> = {},
): NonNullable<ScanResult['signals']>[number] {
  return {
    id: overrides.stableKey ?? 'signal:contract',
    stableKey: 'contract:default',
    kind: 'contract-violation',
    title: 'contract',
    severity: 'high',
    confidence: 'high',
    actionability: 'manual',
    status: 'new',
    maturity: 'stable',
    modules: ['src/a.ts'],
    evidence: [
      {
        kind: 'contract',
        message: 'contract issue',
        confidence: 'high',
      },
    ],
    limitations: [],
    ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
    ...overrides,
  };
}
