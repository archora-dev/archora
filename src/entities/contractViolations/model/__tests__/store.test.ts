import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useScanStore } from '@/entities/scan';
import { useContractViolationsStore } from '../store';
import type { ContractViolation } from '@/core/analyzer/types';

function v(
  id: string,
  kind: ContractViolation['kind'],
  severity: ContractViolation['severity'],
  modules: string[] = [],
  edge?: ContractViolation['edge'],
): ContractViolation {
  return {
    id,
    kind,
    ruleName: id,
    severity,
    message: `${id} message`,
    modules,
    ...(edge ? { edge } : {}),
  };
}

describe('contractViolations store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('mirrors scan.result.contractViolations', () => {
    const scan = useScanStore();
    // @ts-expect-error: stub
    scan.result = {
      contractViolations: [
        v('a', 'boundary', 'error'),
        v('b', 'rsc-leak', 'error'),
        v('c', 'budget', 'warning'),
      ],
    };
    const cv = useContractViolationsStore();
    expect(cv.all.length).toBe(3);
    expect(cv.counts).toEqual({ total: 3, error: 2, warning: 1 });
    expect(cv.kindsPresent.sort()).toEqual(['boundary', 'budget', 'rsc-leak']);
  });

  it('filters by severity and by kind', () => {
    const scan = useScanStore();
    // @ts-expect-error: stub
    scan.result = {
      contractViolations: [
        v('a', 'boundary', 'error'),
        v('b', 'rsc-leak', 'error'),
        v('c', 'budget', 'warning'),
      ],
    };
    const cv = useContractViolationsStore();
    cv.setSeverityFilter('error');
    expect(cv.filtered.map((x) => x.id)).toEqual(['a', 'b']);
    cv.setSeverityFilter('all');
    cv.setKindFilter('rsc-leak');
    expect(cv.filtered.map((x) => x.id)).toEqual(['b']);
    cv.setKindFilter('all');
    expect(cv.filtered.length).toBe(3);
  });

  it('select() toggles, reset() clears state', () => {
    const scan = useScanStore();
    // @ts-expect-error: stub
    scan.result = { contractViolations: [v('a', 'boundary', 'error')] };
    const cv = useContractViolationsStore();
    cv.select('a');
    expect(cv.selectedId).toBe('a');
    cv.select('a');
    expect(cv.selectedId).toBeNull();
    cv.setSeverityFilter('error');
    cv.setKindFilter('boundary');
    cv.select('a');
    cv.reset();
    expect(cv.selectedId).toBeNull();
    expect(cv.severityFilter).toBe('all');
    expect(cv.kindFilter).toBe('all');
  });
});
