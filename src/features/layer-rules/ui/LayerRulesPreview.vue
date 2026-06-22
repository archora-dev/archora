<script setup lang="ts">
import { computed } from 'vue';
import { Badge } from '@/shared/ui';
import { useScanStore } from '@/entities/scan';
import { useLayerRulesStore } from '@/entities/layerRules';
import { recomputeLayers } from '@/core/analyzer/layers';
import { displayShortId } from '@/core/analyzer/displayId';

const props = defineProps<{ projectId: string }>();

const scan = useScanStore();
const store = useLayerRulesStore();

const recomputed = computed(() => {
  const r = scan.result;
  if (!r) return null;
  const overrides = store.draftOverrides(props.projectId);
  return recomputeLayers({ modules: r.modules, edges: r.edges, overrides });
});

const violations = computed(() => recomputed.value?.violations ?? []);
const baseline = computed(() => scan.result?.layerViolations ?? []);

const baselineKeys = computed(() => new Set(baseline.value.map((v) => v.edgeId)));
const draftKeys = computed(() => new Set(violations.value.map((v) => v.edgeId)));

const summary = computed(() => {
  const total = violations.value.length;
  let added = 0;
  let removed = 0;
  for (const v of violations.value) {
    if (!baselineKeys.value.has(v.edgeId)) added++;
  }
  for (const v of baseline.value) {
    if (!draftKeys.value.has(v.edgeId)) removed++;
  }
  return { total, added, removed };
});

function rowDelta(edgeId: string): 'new' | 'kept' {
  return baselineKeys.value.has(edgeId) ? 'kept' : 'new';
}

const shortId = displayShortId;
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <header class="flex items-center justify-between">
      <h2 class="text-md font-medium text-text">Violations (live)</h2>
      <div v-if="recomputed" class="flex items-center gap-1.5 text-xs">
        <Badge :tone="summary.total > 0 ? 'warning' : 'neutral'">
          Violations: {{ summary.total }}
        </Badge>
        <Badge v-if="summary.added > 0" tone="danger">+{{ summary.added }}</Badge>
        <Badge v-if="summary.removed > 0" tone="primary">-{{ summary.removed }}</Badge>
      </div>
    </header>

    <p v-if="!scan.result" class="text-sm text-text-muted">Scan the project first.</p>

    <div
      v-else-if="violations.length === 0"
      class="rounded-md border border-border bg-success/10 p-4 text-sm text-text"
    >
      No layer violations — all imports flow top-down.
    </div>

    <ul v-else class="flex min-h-0 flex-col gap-1 overflow-auto pr-1">
      <li
        v-for="v in violations"
        :key="v.edgeId"
        class="flex items-start gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
        :class="rowDelta(v.edgeId) === 'new' ? 'border-danger/40' : ''"
      >
        <Badge :tone="v.severity === 'error' ? 'danger' : 'warning'">{{ v.severity }}</Badge>
        <div class="min-w-0 flex-1 font-mono leading-snug">
          <div class="break-all text-text">
            {{ shortId(v.from) }} <span class="text-text-subtle">→</span> {{ shortId(v.to) }}
          </div>
          <div class="text-text-muted">
            {{ v.fromLayer }} <span class="text-text-subtle">→</span> {{ v.toLayer }}
          </div>
        </div>
        <span
          v-if="rowDelta(v.edgeId) === 'new'"
          class="shrink-0 text-[10px] uppercase tracking-wide text-danger"
        >
          new
        </span>
      </li>
    </ul>
  </div>
</template>
