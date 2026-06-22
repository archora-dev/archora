import type { ArchDebt, ScanResult } from '@/core/analyzer/types';

export interface ScanInfo {
  grade: ArchDebt['grade'];
  debtScore: number;
  durationMs: number;
  warningCount: number;
  moduleCount: number;
  edgeCount: number;
  insightCount: number;
  breakdown: ArchDebt['breakdown'];
  configState: 'not-configured' | 'loaded' | 'invalid';
  signalCount: number;
  recommendationCount: number;
}

export function buildScanInfo(scan: ScanResult): ScanInfo {
  return {
    grade: scan.archDebt.grade,
    debtScore: scan.archDebt.score,
    durationMs: scan.durationMs,
    warningCount: scan.warnings.length,
    moduleCount: scan.modules.length,
    edgeCount: scan.edges.length,
    insightCount: scan.insights?.length ?? 0,
    breakdown: scan.archDebt.breakdown,
    configState: scan.configStatus?.state ?? 'not-configured',
    signalCount: scan.signals?.length ?? 0,
    recommendationCount: scan.recommendations.length,
  };
}
