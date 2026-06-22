import type { ArchDebt, ScanResult } from '@/core/analyzer/types';
import { diffScans } from '@/core/diff';
import {
  countBySeverity,
  countByType,
  filterFindings,
  gradeOf,
  partitionChangeSet,
  toFindings,
  type Finding,
  type FindingFilter,
  type FindingSeverity,
  type FindingType,
} from '@/entities/finding';
import type { TriageState } from '@/entities/finding-triage';

/** Resolves a finding's triage state; defaults to 'active' when absent. */
export type TriageLookup = (findingId: string) => TriageState;

export interface CockpitFindingsInput {
  scan: ScanResult;
  baselineScan: ScanResult | null;
  lens: 'everything' | 'changed';
  filter: FindingFilter;
  /** Triage state per finding; omitted in contexts without a project. */
  triage?: TriageLookup;
  /** When true, snoozed/wont-fix findings stay visible (muted) instead of hidden. */
  showTriaged?: boolean;
}

export interface CockpitFindingsResult {
  findings: Finding[];
  total: number;
  countsByType: Record<FindingType, number>;
  countsBySeverity: Record<FindingSeverity, number>;
  grade: ArchDebt['grade'];
  hasBaseline: boolean;
  /** Snoozed/wont-fix findings dropped by the triage stage (0 when shown). */
  hiddenByTriage: number;
}

export function deriveCockpitFindings(input: CockpitFindingsInput): CockpitFindingsResult {
  const hasBaseline = input.baselineScan !== null;
  let findings = toFindings(input.scan);

  if (input.lens === 'changed' && input.baselineScan) {
    const diff = diffScans(input.baselineScan, input.scan);
    findings = partitionChangeSet(findings, diff).filter((f) => f.inChangeSet);
  }

  const filtered = filterFindings(findings, input.filter);

  // Triage stage runs after lens/filter so it only ever narrows the already
  // visible set. Snoozed and won't-fix drop out by default; acknowledged stays
  // (rendered muted by the queue). The toggle reveals the dropped ones.
  let hiddenByTriage = 0;
  const triage = input.triage;
  const visible =
    triage && !input.showTriaged
      ? filtered.filter((f) => {
          const state = triage(f.id);
          const hidden = state === 'snoozed' || state === 'wont-fix';
          if (hidden) hiddenByTriage += 1;
          return !hidden;
        })
      : filtered;

  return {
    findings: visible,
    total: visible.length,
    countsByType: countByType(visible),
    countsBySeverity: countBySeverity(visible),
    grade: gradeOf(input.scan),
    hasBaseline,
    hiddenByTriage,
  };
}
