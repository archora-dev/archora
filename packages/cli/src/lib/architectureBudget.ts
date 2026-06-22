import { canSignalFailCi, type ArchoraConfig, type ScanResult } from '@archora/core';
import type { FailOnContext } from './failOn';

export interface ArchitectureBudgetResult {
  failed: boolean;
  reasons: ArchitectureBudgetReason[];
}

export interface ArchitectureBudgetReason {
  key: string;
  actual: number;
  limit: number;
  message: string;
}

export function evaluateArchitectureBudget(
  config: ArchoraConfig,
  scan: ScanResult,
  context: FailOnContext | null,
): ArchitectureBudgetResult {
  const budget = config.architectureBudget;
  if (!budget) return { failed: false, reasons: [] };

  const reasons: ArchitectureBudgetReason[] = [];
  addLimit(reasons, 'maxDebtScore', scan.archDebt.score, budget.maxDebtScore, 'debt score');
  addLimit(reasons, 'maxCycles', scan.cycles.length, budget.maxCycles, 'cycles');
  addLimit(
    reasons,
    'maxCriticalSignals',
    (scan.signals ?? []).filter(
      (signal) => signal.severity === 'critical' && canSignalFailCi(signal),
    ).length,
    budget.maxCriticalSignals,
    'CI-safe critical signals',
  );
  addLimit(
    reasons,
    'maxContractErrors',
    scan.contractViolations.filter((violation) => violation.severity === 'error').length,
    budget.maxContractErrors,
    'contract errors',
  );
  addLimit(
    reasons,
    'maxHotspotGrowth',
    hotspotGrowth(scan, context),
    budget.maxHotspotGrowth,
    'new or changed hotspots',
  );

  return { failed: reasons.length > 0, reasons };
}

export function describeArchitectureBudget(result: ArchitectureBudgetResult): string {
  return result.reasons
    .map((reason) => `${reason.key}: ${reason.message}=${reason.actual} > budget ${reason.limit}`)
    .join('; ');
}

function addLimit(
  reasons: ArchitectureBudgetReason[],
  key: string,
  actual: number,
  limit: number | undefined,
  label: string,
): void {
  if (limit === undefined || actual <= limit) return;
  reasons.push({ key, actual, limit, message: label });
}

function hotspotGrowth(scan: ScanResult, context: FailOnContext | null): number {
  const baselineHotspots = new Set(context?.baseline?.hotZones ?? []);
  const changed = new Set(context?.diff?.changedModules.map((module) => module.id) ?? []);
  return scan.hotZones.filter((id) => !baselineHotspots.has(id) || changed.has(id)).length;
}
