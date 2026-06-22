import type { Component } from 'vue';
import type { FindingEvidence } from '@/entities/finding';
import CycleEvidence from '../ui/evidence/CycleEvidence.vue';
import ContractEvidence from '../ui/evidence/ContractEvidence.vue';
import GenericEvidence from '../ui/evidence/GenericEvidence.vue';

const REGISTRY: Partial<Record<FindingEvidence['kind'], Component>> = {
  cycle: CycleEvidence,
  contract: ContractEvidence,
};

export function evidenceRenderer(kind: FindingEvidence['kind']): Component {
  return REGISTRY[kind] ?? GenericEvidence;
}
