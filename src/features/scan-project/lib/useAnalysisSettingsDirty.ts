// Bridges analysis-affecting settings (excluded paths) to the scan lifecycle.
// These settings only take effect on the next scan, so the cockpit and the
// Settings page surface a "re-scan to apply" prompt while the live patterns
// differ from the set the current result was produced with.

import { computed, ref, type ComputedRef } from 'vue';
import { useScanStore } from '@/entities/scan';
import { useSettingsStore } from '@/entities/settings';
import { useProjectStore } from '@/entities/project';
import { reopenProject } from '@/features/open-project';
import { runScanFlow } from './runScan';

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, i) => value === sortedB[i]);
}

export interface AnalysisSettingsDirty {
  /** True when the live excluded paths differ from what the current scan used. */
  dirty: ComputedRef<boolean>;
  /** A re-scan is in flight (button disabled, spinner shown). */
  rescanning: ComputedRef<boolean>;
  /** Re-run the scan for the open project so new patterns take effect. */
  rescan: () => Promise<void>;
}

export function useAnalysisSettingsDirty(): AnalysisSettingsDirty {
  const scan = useScanStore();
  const settings = useSettingsStore();
  const project = useProjectStore();
  const inFlight = ref(false);

  const dirty = computed(() => {
    // Only meaningful once a scan exists; nothing to re-apply otherwise.
    const applied = scan.appliedIgnoreGlobs;
    if (!scan.result || applied === null) return false;
    return !sameSet(settings.settings.analysis.generatedPaths, applied);
  });

  async function rescan(): Promise<void> {
    if (inFlight.value || scan.isRunning) return;
    const current = project.current;
    if (!current) return;
    inFlight.value = true;
    try {
      const picked = await reopenProject(current.id);
      await runScanFlow({ source: picked.source, locator: picked.locator });
    } finally {
      inFlight.value = false;
    }
  }

  return {
    dirty,
    rescanning: computed(() => inFlight.value),
    rescan,
  };
}
