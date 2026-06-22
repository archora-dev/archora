import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDemoStore } from './demoStore';
import { DEMO_STEPS } from './demoSteps';

describe('useDemoStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts inactive at the first step', () => {
    const demo = useDemoStore();
    expect(demo.active).toBe(false);
    expect(demo.index).toBe(0);
    expect(demo.isFirst).toBe(true);
    expect(demo.step).toEqual(DEMO_STEPS[0]);
  });

  it('walks forward and back without running past the bounds', () => {
    const demo = useDemoStore();
    demo.start();
    expect(demo.active).toBe(true);

    demo.prev();
    expect(demo.index).toBe(0);

    for (let i = 0; i < DEMO_STEPS.length + 2; i += 1) demo.next();
    expect(demo.index).toBe(DEMO_STEPS.length - 1);
    expect(demo.isLast).toBe(true);

    demo.prev();
    expect(demo.index).toBe(DEMO_STEPS.length - 2);
  });

  it('resets to the start on exit', () => {
    const demo = useDemoStore();
    demo.start();
    demo.next();
    demo.setPaused(true);

    demo.exit();
    expect(demo.active).toBe(false);
    expect(demo.paused).toBe(false);
    expect(demo.index).toBe(0);
  });
});
