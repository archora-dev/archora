import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useCountUp } from '../useCountUp';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReducedMotion(value: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? value : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

// A minimal rAF scheduler that lets tests drive frames synchronously.
let pendingFrames: FrameRequestCallback[] = [];

function installFakeRaf() {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    pendingFrames.push(cb);
    return pendingFrames.length;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {
    /* intentional no-op */
  });
}

function flushAllFrames(maxIter = 40, tsStep = 50) {
  let ts = 0;
  let iter = 0;
  while (pendingFrames.length > 0 && iter < maxIter) {
    ts += tsStep;
    const batch = pendingFrames.splice(0);
    batch.forEach((cb) => cb(ts));
    iter++;
  }
}

/**
 * Run a composable inside a minimal component setup() so that Vue's
 * reactivity scheduler and lifecycle hooks work correctly in tests.
 */
function withSetup<T>(setup: () => T): T {
  let result!: T;
  mount(
    {
      setup() {
        result = setup();
        return {};
      },
      template: '<div/>',
    },
    { attachTo: document.body },
  );
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCountUp', () => {
  beforeEach(() => {
    pendingFrames = [];
    mockReducedMotion(false);
    installFakeRaf();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('eases to the target value over time', async () => {
    const target = ref(100);
    const displayed = withSetup(() => useCountUp(target, { duration: 200 }));

    // Initial value matches source before any change.
    expect(displayed.value).toBe(100);

    // Trigger animation: watch fires after Vue flushes the scheduler.
    target.value = 300;
    await flushPromises();

    // The rAF loop should have started — drive frames until duration is exceeded.
    flushAllFrames(20, 50); // 20 * 50ms = 1000ms >> 200ms duration
    expect(displayed.value).toBe(300);
  });

  it('snaps instantly to target under prefers-reduced-motion', async () => {
    mockReducedMotion(true);

    const target = ref(0);
    const displayed = withSetup(() => useCountUp(target, { duration: 400 }));

    target.value = 200;
    await flushPromises();

    // Value must be 200 immediately — no rAF frames should have been queued.
    expect(displayed.value).toBe(200);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});
