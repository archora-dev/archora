import { buildReviewRiskView, diffScans, type ReviewRiskView } from '@archora/core';
import type { ScanResult } from '@/core/analyzer/types';

// Feed the diff only when a baseline exists, so the view gains regression tracking.
export function buildChangeRisk(scan: ScanResult, baseline: ScanResult | null): ReviewRiskView {
  return baseline
    ? buildReviewRiskView(scan, { baseline, diff: diffScans(baseline, scan) })
    : buildReviewRiskView(scan, {});
}
