import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RiskScore from '../RiskScore.vue';

describe('RiskScore', () => {
  it('renders the severity label even without a reason so bare numbers never leak', () => {
    const w = mount(RiskScore, {
      props: { score: 136, severity: 'high' },
    });
    expect(w.text()).toContain('136');
    expect(w.text()).toContain('High');
  });

  it('shows the reason when provided', () => {
    const w = mount(RiskScore, {
      props: {
        score: 117,
        severity: 'critical',
        reason: 'cycle + layer violation',
      },
    });
    expect(w.text()).toContain('Critical');
    expect(w.text()).toContain('cycle + layer violation');
    expect(w.text()).toContain('Why:');
  });

  it('hides the score when no numeric risk is available', () => {
    const w = mount(RiskScore, {
      props: { score: null, severity: 'unknown' },
    });
    // No digits rendered when score is null
    expect(/\d/.test(w.text())).toBe(false);
    expect(w.text()).toContain('Not set');
  });

  it('renders the medium severity label', () => {
    const w = mount(RiskScore, {
      props: { score: 42, severity: 'medium', reason: 'fan-out' },
    });
    expect(w.text()).toContain('Why:');
    expect(w.text()).toContain('Medium');
  });
});
