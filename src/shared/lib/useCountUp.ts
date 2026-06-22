import { ref, watch, isRef, getCurrentInstance, onUnmounted } from 'vue';
import type { Ref } from 'vue';

export interface CountUpOptions {
  /** Animation duration in ms. Default: 500. */
  duration?: number;
  /** Easing function mapping [0..1] to [0..1]. Default: ease-out cubic. */
  easing?: (t: number) => number;
}

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animates a number from its previous value to a new target using rAF.
 * Under prefers-reduced-motion the displayed value snaps instantly to target.
 *
 * Safe to call outside a component instance (e.g. in unit tests): lifecycle
 * hooks are only registered when an active instance is present.
 *
 * @param source - A Ref<number> or a getter returning a number.
 * @param opts   - Optional duration (ms) and easing overrides.
 * @returns A readonly Ref<number> that eases toward the current target.
 */
export function useCountUp(
  source: Ref<number> | (() => number),
  opts: CountUpOptions = {},
): Ref<number> {
  const { duration = 500, easing = easeOutCubic } = opts;

  const getTarget = isRef(source) ? () => source.value : source;

  const displayed = ref(getTarget());

  let rafId: number | null = null;
  let startTs: number | null = null;
  let from = displayed.value;
  let to = displayed.value;

  function tick(ts: number): void {
    if (startTs === null) startTs = ts;
    const elapsed = ts - startTs;
    const t = Math.min(elapsed / duration, 1);
    displayed.value = Math.round(from + (to - from) * easing(t));
    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      displayed.value = to;
      rafId = null;
    }
  }

  function animateTo(target: number): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (reducedMotion()) {
      displayed.value = target;
      from = target;
      to = target;
      return;
    }
    from = displayed.value;
    to = target;
    startTs = null;
    rafId = requestAnimationFrame(tick);
  }

  watch(getTarget, (next) => {
    animateTo(next);
  });

  // Only hook into the component lifecycle when called inside a setup().
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    });
  }

  return displayed;
}
