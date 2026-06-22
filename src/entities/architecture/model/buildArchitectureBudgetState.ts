import { canSignalFailCi } from '@/core';
import type { ScanResult } from '@/core/analyzer/types';
import type { ArchoraConfig } from '@/core/config/frontScopeConfig';

export interface ArchitectureBudgetState {
  status: 'not-configured' | 'passed' | 'failed';
  reasons: ArchitectureBudgetReason[];
  nextAction: 'configure' | 'keep' | 'fix';
}

export interface ArchitectureBudgetReason {
  key: string;
  actual: number;
  limit: number;
}

export function buildArchitectureBudgetState(
  scan: ScanResult | null,
  config: ArchoraConfig | null,
): ArchitectureBudgetState {
  const budget = config?.architectureBudget;
  if (!scan || !budget) return { status: 'not-configured', reasons: [], nextAction: 'configure' };

  const reasons: ArchitectureBudgetReason[] = [];
  addLimit(reasons, 'maxDebtScore', scan.archDebt.score, budget.maxDebtScore);
  addLimit(reasons, 'maxCycles', scan.cycles.length, budget.maxCycles);
  addLimit(
    reasons,
    'maxCriticalSignals',
    (scan.signals ?? []).filter(
      (signal) => signal.severity === 'critical' && canSignalFailCi(signal),
    ).length,
    budget.maxCriticalSignals,
  );
  addLimit(
    reasons,
    'maxContractErrors',
    scan.contractViolations.filter((violation) => violation.severity === 'error').length,
    budget.maxContractErrors,
  );
  addLimit(reasons, 'maxHotspotGrowth', scan.hotZones.length, budget.maxHotspotGrowth);

  return {
    status: reasons.length > 0 ? 'failed' : 'passed',
    reasons,
    nextAction: reasons.length > 0 ? 'fix' : 'keep',
  };
}

function addLimit(
  reasons: ArchitectureBudgetReason[],
  key: string,
  actual: number,
  limit: number | undefined,
): void {
  if (limit === undefined || actual <= limit) return;
  reasons.push({ key, actual, limit });
}
