import type { MemoryRiskFinding, MemoryRiskKind } from '@archora/core';

const KIND_LABELS: Record<MemoryRiskKind, string> = {
  'event-listener-cleanup': 'Event listener',
  'timer-cleanup': 'Timer',
  'observer-cleanup': 'Observer',
  'object-url-cleanup': 'Object URL',
  'subscription-cleanup': 'Subscription',
};

const EVIDENCE_TEXT: Record<MemoryRiskKind, string> = {
  'event-listener-cleanup': 'addEventListener has no visible removeEventListener cleanup.',
  'timer-cleanup': 'Timer handle has no visible clearInterval/clearTimeout cleanup.',
  'observer-cleanup': 'Observer instance has no visible disconnect cleanup.',
  'object-url-cleanup': 'Object URL has no visible revokeObjectURL cleanup.',
  'subscription-cleanup': 'Subscription has no visible unsubscribe/stop cleanup.',
};

const REMEDIATION_TEXT: Record<MemoryRiskKind, string> = {
  'event-listener-cleanup': 'Remove the listener from the matching component teardown lifecycle.',
  'timer-cleanup': 'Keep the timer handle and clear it during teardown.',
  'observer-cleanup': 'Disconnect the observer during teardown.',
  'object-url-cleanup':
    'Revoke created object URLs after the preview or download is no longer needed.',
  'subscription-cleanup': 'Store the unsubscribe handle and call it during teardown.',
};

export function memoryRiskKindLabel(kind: MemoryRiskKind): string {
  return KIND_LABELS[kind];
}

export function memoryRiskEvidenceText(risk: MemoryRiskFinding): string {
  return EVIDENCE_TEXT[risk.kind] ?? risk.evidence[0]?.message ?? '-';
}

export function memoryRiskRemediationText(risk: MemoryRiskFinding): string {
  return REMEDIATION_TEXT[risk.kind] ?? risk.remediation;
}

export function memoryRiskSource(risk: MemoryRiskFinding): string {
  const line = risk.evidence[0]?.line;
  return line ? `${risk.moduleId}:${line}` : risk.moduleId;
}
