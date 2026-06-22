import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type DrilldownSurface =
  | 'explorer'
  | 'impact'
  | 'rules'
  | 'scan-info'
  | 'change-risk'
  | 'dead-code'
  | 'ownership';

interface DrilldownEntry {
  surface: DrilldownSurface;
  moduleId: string | null;
}

export const useDrilldownStore = defineStore('drilldown', () => {
  const surface = ref<DrilldownSurface | null>(null);
  const focusedModule = ref<string | null>(null);
  // Trail of surfaces we drilled through, so a drill-in (e.g. Change risk →
  // Impact) can step back to where it came from.
  const stack = ref<DrilldownEntry[]>([]);

  // Fresh top-level navigation (command palette, finding context): no back trail.
  function open(next: DrilldownSurface, moduleId?: string): void {
    stack.value = [];
    surface.value = next;
    focusedModule.value = moduleId ?? null;
  }

  // Drill deeper from the current surface, remembering it so we can return.
  function drillTo(next: DrilldownSurface, moduleId?: string): void {
    if (surface.value) {
      stack.value.push({ surface: surface.value, moduleId: focusedModule.value });
    }
    surface.value = next;
    focusedModule.value = moduleId ?? null;
  }

  function back(): void {
    const prev = stack.value.pop();
    if (!prev) return;
    surface.value = prev.surface;
    focusedModule.value = prev.moduleId;
  }

  function close(): void {
    surface.value = null;
    focusedModule.value = null;
    stack.value = [];
  }

  const canGoBack = computed(() => stack.value.length > 0);

  return { surface, focusedModule, canGoBack, open, drillTo, back, close };
});
