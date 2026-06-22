import type {
  AsyncLifecycleRiskFinding,
  ConfigDiagnostic,
  ContractViolation,
  Cycle,
  LayerViolation,
  MemoryRiskFinding,
  ModuleId,
  ModuleMetrics,
  TemporalCoupling,
} from '@/core/analyzer/types';
import { moduleLabel } from '@/shared/lib';
import {
  couplingSeverity,
  cycleSeverity,
  errorWarningSeverity,
  hotspotSeverity,
  lowMediumSeverity,
} from './severity';
import { CYCLE_TANGLE_THRESHOLD, type Finding } from './types';

export function cycleToFinding(cycle: Cycle): Finding {
  const location = cycle.modules[0];
  const isTangle = cycle.modules.length > CYCLE_TANGLE_THRESHOLD;
  return {
    id: `cycle:${cycle.id}`,
    type: 'cycle',
    severity: cycleSeverity(cycle),
    title: {
      i18nKey: isTangle ? 'entities.finding.cluster.title' : 'entities.finding.cycle.title',
      params: { count: cycle.modules.length },
    },
    modules: cycle.modules,
    ...(location !== undefined && { location }),
    beta: false,
    inChangeSet: false,
    evidence: { kind: 'cycle', cycle },
  };
}

export function layerViolationToFinding(violation: LayerViolation): Finding {
  return {
    id: `layer-violation:${violation.edgeId}`,
    type: 'layer-violation',
    severity: errorWarningSeverity(violation.severity),
    title: {
      i18nKey: 'entities.finding.layerViolation.title',
      params: { from: violation.fromLayer, to: violation.toLayer },
    },
    modules: [violation.from, violation.to],
    location: violation.from,
    beta: false,
    inChangeSet: false,
    evidence: { kind: 'layer-violation', violation },
  };
}

export function hotspotToFinding(
  moduleId: ModuleId,
  metrics: ModuleMetrics,
  rank: number,
  total: number,
): Finding {
  return {
    id: `hotspot:${moduleId}`,
    type: 'hotspot',
    severity: hotspotSeverity(rank, total),
    title: { i18nKey: 'entities.finding.hotspot.title', params: { module: moduleLabel(moduleId) } },
    modules: [moduleId],
    location: moduleId,
    risk: Math.round(Math.min(100, metrics.hotnessScore)),
    beta: false,
    inChangeSet: false,
    evidence: { kind: 'hotspot', moduleId, metrics, rank },
  };
}

export function contractToFinding(violation: ContractViolation): Finding {
  const isRscLeak = violation.kind === 'rsc-leak';
  const location = violation.modules[0];
  return {
    id: `contract:${violation.id}`,
    type: 'contract',
    severity: errorWarningSeverity(violation.severity),
    title: {
      i18nKey: isRscLeak ? 'entities.finding.rscLeak.title' : 'entities.finding.contract.title',
      params: { rule: violation.ruleName },
    },
    modules: violation.modules,
    ...(location !== undefined && { location }),
    beta: false,
    inChangeSet: false,
    evidence: { kind: 'contract', violation },
  };
}

export function couplingToFinding(coupling: TemporalCoupling): Finding {
  return {
    id: `coupling:${coupling.a} ${coupling.b}`,
    type: 'coupling',
    severity: couplingSeverity(coupling),
    title: {
      i18nKey: 'entities.finding.coupling.title',
      params: { a: moduleLabel(coupling.a), b: moduleLabel(coupling.b) },
    },
    modules: [coupling.a, coupling.b],
    location: coupling.a,
    risk: Math.round(Math.min(100, Math.max(0, coupling.risk * 100))),
    beta: false,
    inChangeSet: false,
    evidence: { kind: 'coupling', coupling },
  };
}

export function memoryToFinding(finding: MemoryRiskFinding): Finding {
  return {
    id: `memory:${finding.id}`,
    type: 'memory',
    severity: lowMediumSeverity(finding.severity),
    title: { i18nKey: 'entities.finding.memory.title', params: { kind: finding.kind } },
    modules: [finding.moduleId],
    location: finding.moduleId,
    beta: true,
    inChangeSet: false,
    evidence: { kind: 'memory', finding },
  };
}

export function asyncLifecycleToFinding(finding: AsyncLifecycleRiskFinding): Finding {
  return {
    id: `async-lifecycle:${finding.id}`,
    type: 'async-lifecycle',
    severity: lowMediumSeverity(finding.severity),
    title: { i18nKey: 'entities.finding.asyncLifecycle.title', params: { kind: finding.kind } },
    modules: [finding.moduleId],
    location: finding.moduleId,
    beta: true,
    inChangeSet: false,
    evidence: { kind: 'async-lifecycle', finding },
  };
}

export function setupToFinding(diagnostic: ConfigDiagnostic, index: number): Finding {
  return {
    id: `setup:${index}:${diagnostic.path}`,
    type: 'setup',
    severity: errorWarningSeverity(diagnostic.severity),
    title: { i18nKey: 'entities.finding.setup.title', params: { field: diagnostic.path } },
    modules: [],
    beta: false,
    inChangeSet: false,
    evidence: { kind: 'setup', diagnostic },
  };
}
