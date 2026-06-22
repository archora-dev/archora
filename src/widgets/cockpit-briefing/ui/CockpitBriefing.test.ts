import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { CockpitBriefing as CockpitBriefingModel } from '../model/buildBriefing';
import CockpitBriefing from './CockpitBriefing.vue';

function briefing(over: Partial<CockpitBriefingModel> = {}): CockpitBriefingModel {
  return {
    grade: 'C',
    assessment: {
      i18nKey: 'cockpit.briefing.assessment.C',
      params: { cycles: 2, layerViolations: 1, hotZones: 3 },
    },
    totals: { findings: 9, cycles: 2, layerViolations: 1, hotZones: 3 },
    gradeDrivers: [],
    priorities: [
      {
        id: 'cycle:c1',
        kind: 'cycle',
        severity: 'error',
        targetId: 'c1',
        affectedModules: 3,
        why: { i18nKey: 'cockpit.briefing.why.cycle', params: {} },
        fix: { i18nKey: 'cockpit.briefing.fix.cycle', params: {} },
      },
    ],
    baselineDelta: null,
    ...over,
  };
}

function mountBriefing(model: CockpitBriefingModel) {
  return mount(CockpitBriefing, {
    props: { briefing: model },
    global: { stubs: { Tooltip: { template: '<span><slot /></span>' } } },
  });
}

describe('CockpitBriefing', () => {
  it('renders the assessment and ranked priorities', () => {
    const w = mountBriefing(briefing());
    expect(w.find('[data-test="briefing-assessment"]').exists()).toBe(true);
    expect(w.find('[data-test="priority-cycle"]').exists()).toBe(true);
  });

  it('emits see-all with the queue count on the primary action', async () => {
    const w = mountBriefing(briefing());
    await w.find('[data-test="briefing-see-all"]').trigger('click');
    expect(w.emitted('see-all')).toHaveLength(1);
    expect(w.find('[data-test="briefing-see-all"]').text()).toContain('9');
  });

  it('emits open-priority with the anchor target', async () => {
    const w = mountBriefing(briefing());
    await w.find('[data-test="open-priority-cycle"]').trigger('click');
    expect(w.emitted('open-priority')?.[0]).toEqual(['c1']);
  });

  it('prompts to set a baseline when none exists', () => {
    const w = mountBriefing(briefing({ baselineDelta: null }));
    expect(w.find('[data-test="briefing-set-baseline"]').exists()).toBe(true);
  });

  it('shows signed deltas when a baseline exists', () => {
    const w = mountBriefing(
      briefing({
        baselineDelta: { cycles: 2, layerViolations: -1, hotZones: 0, unchanged: false },
      }),
    );
    const delta = w.find('[data-test="briefing-delta"]');
    expect(delta.exists()).toBe(true);
    expect(delta.text()).toContain('2');
  });

  it('reports a clean baseline when nothing moved', () => {
    const w = mountBriefing(
      briefing({ baselineDelta: { cycles: 0, layerViolations: 0, hotZones: 0, unchanged: true } }),
    );
    expect(w.find('[data-test="briefing-delta-clean"]').exists()).toBe(true);
  });

  it('shows a clean message when there are no priorities', () => {
    const w = mountBriefing(briefing({ priorities: [] }));
    expect(w.find('[data-test="briefing-no-priorities"]').exists()).toBe(true);
  });
});
