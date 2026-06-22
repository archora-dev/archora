import { describe, expect, it } from 'vitest';
import type { Cycle, TemporalCoupling } from '@/core/analyzer/types';
import {
  couplingSeverity,
  cycleSeverity,
  errorWarningSeverity,
  hotspotSeverity,
  lowMediumSeverity,
} from './severity';

const coupling = (over: Partial<TemporalCoupling>): TemporalCoupling => ({
  a: 'a',
  b: 'b',
  coOccurrences: 5,
  scoreA: 0.6,
  scoreB: 0.6,
  score: 0.6,
  hidden: false,
  crossBoundary: false,
  risk: 0.4,
  ...over,
});

describe('finding severity normalizers', () => {
  it('maps cycle severity', () => {
    expect(cycleSeverity({ severity: 'direct' } as Cycle)).toBe('high');
    expect(cycleSeverity({ severity: 'indirect' } as Cycle)).toBe('medium');
  });

  it('maps error/warning', () => {
    expect(errorWarningSeverity('error')).toBe('high');
    expect(errorWarningSeverity('warning')).toBe('medium');
  });

  it('passes through low/medium', () => {
    expect(lowMediumSeverity('low')).toBe('low');
    expect(lowMediumSeverity('medium')).toBe('medium');
  });

  it('ranks hotspots: top third high, rest medium', () => {
    expect(hotspotSeverity(0, 9)).toBe('high');
    expect(hotspotSeverity(2, 9)).toBe('high');
    expect(hotspotSeverity(3, 9)).toBe('medium');
  });

  it('grades coupling by hidden + cross-boundary', () => {
    expect(couplingSeverity(coupling({ hidden: true, crossBoundary: true }))).toBe('high');
    expect(couplingSeverity(coupling({ hidden: true, crossBoundary: false }))).toBe('medium');
    expect(couplingSeverity(coupling({ hidden: false }))).toBe('low');
  });
});
