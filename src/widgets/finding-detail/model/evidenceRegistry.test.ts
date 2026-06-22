import { describe, expect, it } from 'vitest';
import { evidenceRenderer } from './evidenceRegistry';
import CycleEvidence from '../ui/evidence/CycleEvidence.vue';
import ContractEvidence from '../ui/evidence/ContractEvidence.vue';
import GenericEvidence from '../ui/evidence/GenericEvidence.vue';

describe('evidenceRegistry', () => {
  it('maps cycle and contract to their renderers', () => {
    expect(evidenceRenderer('cycle')).toBe(CycleEvidence);
    expect(evidenceRenderer('contract')).toBe(ContractEvidence);
  });

  it('falls back to GenericEvidence for unmapped kinds', () => {
    expect(evidenceRenderer('hotspot')).toBe(GenericEvidence);
    expect(evidenceRenderer('memory')).toBe(GenericEvidence);
  });
});
