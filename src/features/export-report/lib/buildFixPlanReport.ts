import { buildFixPlan, type BuildFixPlanOptions } from '@archora/core';
import type { ScanResult } from '@/core/analyzer/types';

export type BuildFixPlanReportOptions = BuildFixPlanOptions;

export function buildFixPlanReport(
  scan: ScanResult,
  options: BuildFixPlanReportOptions = {},
): string {
  return JSON.stringify(buildFixPlan(scan, options), null, 2);
}
