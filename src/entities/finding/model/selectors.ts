import type { ArchDebt, ScanResult } from '@/core/analyzer/types';
import type { ScanDiff } from '@/core/diff';
import { FINDING_TYPES, type Finding, type FindingSeverity, type FindingType } from './types';

export interface FindingFilter {
  types?: FindingType[];
  severities?: FindingSeverity[];
  includeBeta?: boolean;
}

export function countByType(findings: Finding[]): Record<FindingType, number> {
  const counts = Object.fromEntries(FINDING_TYPES.map((t) => [t, 0])) as Record<
    FindingType,
    number
  >;
  for (const f of findings) counts[f.type] += 1;
  return counts;
}

const SEVERITIES: FindingSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];

export function countBySeverity(findings: Finding[]): Record<FindingSeverity, number> {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<
    FindingSeverity,
    number
  >;
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function gradeOf(scan: ScanResult): ArchDebt['grade'] {
  return scan.archDebt.grade;
}

export function filterFindings(findings: Finding[], filter: FindingFilter): Finding[] {
  const types = filter.types ? new Set(filter.types) : null;
  const severities = filter.severities ? new Set(filter.severities) : null;
  return findings.filter((f) => {
    if (types && !types.has(f.type)) return false;
    if (severities && !severities.has(f.severity)) return false;
    if (filter.includeBeta === false && f.beta) return false;
    return true;
  });
}

export function partitionChangeSet(findings: Finding[], diff: ScanDiff): Finding[] {
  const newCycleIds = new Set(diff.newCycles.map((c) => c.id));
  const touched = new Set<string>([
    ...diff.addedModules.map((m) => m.id),
    ...diff.changedModules.map((m) => m.id),
  ]);
  return findings.map((f) => {
    const inChangeSet =
      f.type === 'cycle' && f.evidence.kind === 'cycle'
        ? newCycleIds.has(f.evidence.cycle.id)
        : f.location != null && touched.has(f.location);
    return inChangeSet === f.inChangeSet ? f : { ...f, inChangeSet };
  });
}
