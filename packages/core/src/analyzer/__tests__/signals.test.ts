import { describe, expect, it } from 'vitest';
import {
  applySignalSuppressions,
  buildArchitectureSignals,
  canSignalFailCi,
  projectSignalsToRecommendations,
  reconcileSignalLifecycle,
} from '../signals';
import type { ArchitectureSignal, ParsedFileSummary, Recommendation } from '../types';

function rec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'r1',
    kind: 'contract-violation',
    modules: ['src/a.ts'],
    params: { severity: 'error' },
    weight: 10,
    ...overrides,
  };
}

function parserFact(overrides: Partial<ParsedFileSummary> = {}): ParsedFileSummary {
  return {
    relPath: 'src/a.ts',
    language: 'ts',
    loc: 1,
    imports: [],
    exports: [],
    runtimeFacts: [],
    frameworkFacts: [],
    routeFacts: [],
    stateFacts: [],
    assetFacts: [],
    limitations: [],
    ...overrides,
  };
}

describe('buildArchitectureSignals', () => {
  it('builds stable keys without legacy recommendation ids', () => {
    const a = buildArchitectureSignals({
      recommendations: [rec({ id: 'generated-a', modules: ['src/b.ts', 'src/a.ts'] })],
      warnings: [],
    }).signals[0];
    const b = buildArchitectureSignals({
      recommendations: [rec({ id: 'generated-b', modules: ['src/a.ts', 'src/b.ts'] })],
      warnings: [],
    }).signals[0];

    expect(a?.stableKey).toBe(b?.stableKey);
  });

  it('changes stable keys when evidence modules or facts differ', () => {
    const a = buildArchitectureSignals({
      recommendations: [rec({ modules: ['src/a.ts'] })],
      warnings: [],
    }).signals[0];
    const b = buildArchitectureSignals({
      recommendations: [rec({ modules: ['src/other.ts'] })],
      warnings: [],
    }).signals[0];

    expect(a?.stableKey).not.toBe(b?.stableKey);
  });

  it('keeps heuristic-only legacy signals out of top insights', () => {
    const { signals, insights } = buildArchitectureSignals({
      recommendations: [
        rec({
          id: 'h1',
          kind: 'unused-utility',
          modules: ['src/unused.ts'],
          weight: 100,
        }),
      ],
      warnings: [],
    });

    expect(signals[0]?.confidence).toBe('low');
    expect(signals[0]?.maturity).toBe('experimental');
    expect(insights).toEqual([]);
  });

  it('demotes graph-derived signals when parser facts are approximate', () => {
    const { signals, insights } = buildArchitectureSignals({
      recommendations: [rec({ kind: 'cycle-break-cluster', params: {}, weight: 10 })],
      warnings: [],
      parserFacts: [
        parserFact({
          imports: [
            {
              specifier: './dynamic/',
              kind: 'dynamic',
              resolutionKind: 'prefix',
              confidence: 'low',
              approximate: true,
            },
          ],
        }),
      ],
    });

    expect(signals[0]?.confidence).toBe('medium');
    expect(signals[0]?.limitations[0]).toContain('parser uncertainty');
    expect(insights[0]?.confidence).toBe('medium');
  });

  it('groups related actionable signals into one insight', () => {
    const { insights } = buildArchitectureSignals({
      recommendations: [
        rec({
          id: 'contract',
          kind: 'contract-violation',
          modules: ['src/a.ts'],
          params: { severity: 'error' },
          weight: 10,
        }),
        rec({
          id: 'cycle',
          kind: 'cycle-break-candidate',
          modules: ['src/a.ts', 'src/b.ts'],
          params: {},
          weight: 8,
        }),
      ],
      warnings: [],
    });

    expect(insights).toHaveLength(1);
    expect(insights[0]?.signals).toHaveLength(2);
    expect(insights[0]?.modules).toEqual(['src/a.ts', 'src/b.ts']);
    expect(insights[0]?.title).toContain('related');
  });

  it('applies insight noise controls without dropping raw signals', () => {
    const { signals, insights } = buildArchitectureSignals({
      recommendations: [
        rec({ id: 'stable', kind: 'contract-violation', params: { severity: 'error' } }),
        rec({ id: 'medium', kind: 'cycle-break-candidate', params: {}, modules: ['src/b.ts'] }),
      ],
      warnings: [],
      insightLimit: 1,
      minInsightSeverity: 'high',
      minInsightConfidence: 'high',
    });

    expect(signals).toHaveLength(2);
    expect(insights).toHaveLength(1);
    expect(insights[0]?.severity).toBe('high');
  });

  it('projects resolve warnings as non-CI parser signals', () => {
    const { signals, insights } = buildArchitectureSignals({
      recommendations: [],
      warnings: [
        {
          code: 'resolve-failed',
          message: 'Could not resolve import',
          file: 'src/a.ts',
          detail: './missing',
        },
      ],
    });

    expect(signals[0]?.kind).toBe('warning:resolve-failed');
    expect(signals[0] ? canSignalFailCi(signals[0]) : true).toBe(false);
    expect(insights).toEqual([]);
  });
});

describe('canSignalFailCi', () => {
  it('allows stable high-confidence high severity signals to fail CI', () => {
    const { signals } = buildArchitectureSignals({
      recommendations: [rec()],
      warnings: [],
    });

    expect(signals[0] ? canSignalFailCi(signals[0]) : false).toBe(true);
  });

  it('does not let beta or experimental signals fail CI by default', () => {
    const { signals } = buildArchitectureSignals({
      recommendations: [
        rec({
          id: 'b1',
          kind: 'bundle-bloat',
          params: { severity: 'high' },
          weight: 10,
        }),
        rec({
          id: 'h1',
          kind: 'unused-utility',
          modules: ['src/unused.ts'],
          weight: 100,
        }),
      ],
      warnings: [],
    });

    expect(signals.map((signal) => signal.maturity)).toEqual(['beta', 'experimental']);
    expect(signals.some((signal) => canSignalFailCi(signal))).toBe(false);
  });

  it('does not fail CI for suppressed or resolved signals', () => {
    const signal = buildArchitectureSignals({ recommendations: [rec()], warnings: [] }).signals[0];
    expect(signal).toBeDefined();
    expect(canSignalFailCi({ ...signal!, suppressed: true })).toBe(false);
    expect(canSignalFailCi({ ...signal!, status: 'resolved' })).toBe(false);
  });
});

describe('projectSignalsToRecommendations', () => {
  it('projects signal-only compatible findings for legacy consumers', () => {
    const signal = buildArchitectureSignals({ recommendations: [rec()], warnings: [] }).signals[0]!;
    const signalOnly = { ...signal };
    delete signalOnly.legacyRecommendationId;
    const projected = projectSignalsToRecommendations([{ ...signalOnly, id: 'signal-only' }]);

    expect(projected[0]).toMatchObject({
      id: `signal:${signal.stableKey}`,
      kind: 'contract-violation',
      modules: ['src/a.ts'],
      params: {
        stableKey: signal.stableKey,
        severity: 'high',
      },
    });
  });
});

describe('reconcileSignalLifecycle', () => {
  it('marks matching signals existing and missing baseline signals resolved', () => {
    const current = buildArchitectureSignals({ recommendations: [rec()], warnings: [] })
      .signals[0]!;
    const baseline: ArchitectureSignal = { ...current, id: 'baseline-signal' };

    const result = reconcileSignalLifecycle([baseline], [current]);

    expect(result.current[0]?.status).toBe('existing');
    expect(result.resolved).toEqual([]);
  });

  it('marks severity or confidence increases as regressed', () => {
    const current = buildArchitectureSignals({ recommendations: [rec()], warnings: [] })
      .signals[0]!;
    const baseline: ArchitectureSignal = { ...current, severity: 'medium', confidence: 'medium' };

    const result = reconcileSignalLifecycle([baseline], [current]);

    expect(result.current[0]?.status).toBe('regressed');
  });

  it('returns resolved signals that disappeared from current scan', () => {
    const baseline = buildArchitectureSignals({ recommendations: [rec()], warnings: [] })
      .signals[0]!;

    const result = reconcileSignalLifecycle([baseline], []);

    expect(result.current).toEqual([]);
    expect(result.resolved[0]?.status).toBe('resolved');
    expect(result.resolved[0]?.stableKey).toBe(baseline.stableKey);
  });
});

describe('applySignalSuppressions', () => {
  it('marks active matching suppressions without removing signals', () => {
    const signal = buildArchitectureSignals({ recommendations: [rec()], warnings: [] }).signals[0]!;

    const result = applySignalSuppressions(
      [signal],
      [
        {
          stableKey: signal.stableKey,
          reason: 'accepted debt',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      { now: '2026-02-01T00:00:00.000Z' },
    );

    expect(result.signals[0]?.suppressed).toBe(true);
    expect(result.signals[0]?.suppressionReason).toBe('accepted debt');
  });

  it('ignores expired suppressions and reports stale suppressions', () => {
    const signal = buildArchitectureSignals({ recommendations: [rec()], warnings: [] }).signals[0]!;

    const result = applySignalSuppressions(
      [signal],
      [
        {
          stableKey: signal.stableKey,
          reason: 'expired',
          createdAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-01-15T00:00:00.000Z',
        },
        {
          stableKey: 'missing',
          reason: 'old',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      { now: '2026-02-01T00:00:00.000Z' },
    );

    expect(result.signals[0]?.suppressed).toBeUndefined();
    expect(result.staleSuppressions).toEqual([
      {
        stableKey: 'missing',
        reason: 'old',
        createdAt: '2026-01-01T00:00:00.000Z',
        status: 'stale',
      },
    ]);
  });
});
