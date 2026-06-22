import type { Cycle, TemporalCoupling } from '@/core/analyzer/types';
import type { FindingSeverity } from './types';

export function cycleSeverity(cycle: Pick<Cycle, 'severity'>): FindingSeverity {
  return cycle.severity === 'direct' ? 'high' : 'medium';
}

export function errorWarningSeverity(severity: 'error' | 'warning'): FindingSeverity {
  return severity === 'error' ? 'high' : 'medium';
}

export function lowMediumSeverity(severity: 'low' | 'medium'): FindingSeverity {
  return severity;
}

/** hotZones is pre-ranked (worst first). Top third are high, the rest medium. */
export function hotspotSeverity(rank: number, total: number): FindingSeverity {
  const cutoff = Math.ceil(Math.max(1, total) / 3);
  return rank < cutoff ? 'high' : 'medium';
}

export function couplingSeverity(coupling: TemporalCoupling): FindingSeverity {
  if (coupling.hidden && coupling.crossBoundary) return 'high';
  if (coupling.hidden) return 'medium';
  return 'low';
}
