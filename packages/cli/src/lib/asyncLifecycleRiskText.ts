import type { AsyncLifecycleRiskFinding, AsyncLifecycleRiskKind } from '@archora/core';

const KIND_LABELS: Record<AsyncLifecycleRiskKind, string> = {
  'async-effect-cleanup': 'Async lifecycle work',
};

const EVIDENCE_TEXT: Record<AsyncLifecycleRiskKind, string> = {
  'async-effect-cleanup': 'Async lifecycle work has no visible abort, stale guard, or cleanup.',
};

const REMEDIATION_TEXT: Record<AsyncLifecycleRiskKind, string> = {
  'async-effect-cleanup':
    'Add AbortController, a stale-result guard, or lifecycle cleanup before updating state.',
};

export function asyncLifecycleRiskKindLabel(kind: AsyncLifecycleRiskKind): string {
  return KIND_LABELS[kind];
}

export function asyncLifecycleRiskEvidenceText(risk: AsyncLifecycleRiskFinding): string {
  return EVIDENCE_TEXT[risk.kind] ?? risk.evidence[0]?.message ?? '-';
}

export function asyncLifecycleRiskRemediationText(risk: AsyncLifecycleRiskFinding): string {
  return REMEDIATION_TEXT[risk.kind] ?? risk.remediation;
}

export function asyncLifecycleRiskSource(risk: AsyncLifecycleRiskFinding): string {
  const line = risk.evidence[0]?.line;
  return line ? `${risk.moduleId}:${line}` : risk.moduleId;
}
