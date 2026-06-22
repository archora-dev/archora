import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { DEMO_STEPS, type DemoStep } from './demoSteps';

/**
 * Pure playback state for the self-running tour: which step is showing and
 * whether it is paused. The timer and the navigation side effects live in the
 * page-level player (useDemoPlayer) so this store stays free of routing and
 * other feature stores.
 */
export const useDemoStore = defineStore('demo', () => {
  const active = ref(false);
  const index = ref(0);
  const paused = ref(false);

  const step = computed<DemoStep | null>(() => DEMO_STEPS[index.value] ?? null);
  const isFirst = computed(() => index.value === 0);
  const isLast = computed(() => index.value === DEMO_STEPS.length - 1);

  function start(): void {
    active.value = true;
    paused.value = false;
    index.value = 0;
  }
  function exit(): void {
    active.value = false;
    paused.value = false;
    index.value = 0;
  }
  function next(): void {
    if (index.value < DEMO_STEPS.length - 1) index.value += 1;
  }
  function prev(): void {
    if (index.value > 0) index.value -= 1;
  }
  function setPaused(value: boolean): void {
    paused.value = value;
  }

  return { active, index, paused, step, isFirst, isLast, start, exit, next, prev, setPaused };
});
