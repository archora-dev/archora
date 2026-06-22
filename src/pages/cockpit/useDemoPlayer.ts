import { onUnmounted, watch } from 'vue';
import { useScanStore } from '@/entities/scan';
import { useProjectStore } from '@/entities/project';
import { useCockpitViewStore } from '@/features/cockpit-view';
import { useDemoStore, type DemoStep } from '@/features/demo-walkthrough';
import { openSampleProject } from '@/features/open-sample-project';

export interface DemoPlayerOptions {
  /** Resolves the id of the cycle finding to focus in the "in context" step. */
  resolveCycleFindingId: () => string | null;
}

/**
 * Drives the self-running demo: loads the sample, then walks the cockpit view
 * through the scripted steps on a timer. Navigation lives here (not in the demo
 * store) because it reaches across the view store and the sample loader — both
 * sibling features the page layer is allowed to compose.
 */
export function useDemoPlayer(options: DemoPlayerOptions): {
  start: () => void;
  exit: () => void;
  next: () => void;
  prev: () => void;
  togglePause: () => void;
} {
  const demo = useDemoStore();
  const view = useCockpitViewStore();
  const scan = useScanStore();
  const project = useProjectStore();

  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function applyStep(step: DemoStep | null): void {
    if (!step) return;
    switch (step.action) {
      case 'grade':
      case 'priorities':
        view.setMode('briefing');
        view.select(null);
        break;
      case 'queue':
        view.setMode('queue');
        view.setLens('everything');
        view.setTypes([]);
        view.select(null);
        break;
      case 'cycle': {
        view.setMode('queue');
        view.setLens('everything');
        view.setTypes(['cycle']);
        const cycleId = options.resolveCycleFindingId();
        if (cycleId) view.select(cycleId);
        break;
      }
      case 'export':
        view.setMode('queue');
        view.setLens('everything');
        view.setTypes([]);
        break;
    }
  }

  function scheduleAdvance(): void {
    clearTimer();
    if (!demo.active || demo.paused || !demo.step) return;
    const duration = demo.step.durationMs;
    timer = setTimeout(() => {
      if (demo.isLast) exit();
      else demo.next();
    }, duration);
  }

  function start(): void {
    openSampleProject();
    demo.start();
    applyStep(demo.step);
    scheduleAdvance();
  }
  function exit(): void {
    clearTimer();
    demo.exit();
    // The demo loaded the sample only to narrate it; drop it on finish/exit so
    // the user lands back on the project-loading screen, not in a stray scan.
    scan.reset();
    project.clear();
    view.reset();
  }
  function next(): void {
    demo.next();
  }
  function prev(): void {
    demo.prev();
  }
  function togglePause(): void {
    demo.setPaused(!demo.paused);
  }

  // Re-apply navigation and reset the timer whenever the step changes (manual or
  // auto), and pause/resume the timer when the user toggles pause.
  watch(
    () => demo.index,
    () => {
      if (!demo.active) return;
      applyStep(demo.step);
      scheduleAdvance();
    },
  );
  watch(
    () => demo.paused,
    () => {
      if (demo.active) scheduleAdvance();
    },
  );

  onUnmounted(clearTimer);

  return { start, exit, next, prev, togglePause };
}
