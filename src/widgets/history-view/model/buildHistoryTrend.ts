import type { ArchDebt } from '@/core/analyzer/types';
import type { Snapshot } from '@/entities/history';
import { countByType, toFindings } from '@/entities/finding';

export interface TrendPoint {
  scannedAt: string;
  grade: ArchDebt['grade'];
  debtScore: number;
  findingCount: number;
  cycleCount: number;
}

export function buildHistoryTrend(snapshots: Snapshot[]): TrendPoint[] {
  return [...snapshots]
    .sort((a, b) => Date.parse(a.scannedAt) - Date.parse(b.scannedAt))
    .map((s) => {
      const findings = toFindings(s.scan);
      return {
        scannedAt: s.scannedAt,
        grade: s.scan.archDebt.grade,
        debtScore: s.scan.archDebt.score,
        findingCount: findings.length,
        cycleCount: countByType(findings).cycle,
      };
    });
}
