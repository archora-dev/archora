<script setup lang="ts">
import { computed, ref } from 'vue';
import { CYCLE_TANGLE_THRESHOLD, type Finding } from '@/entities/finding';
import { moduleLabel } from '@/shared/lib';

const props = defineProps<{ finding: Finding }>();

const cycle = computed(() =>
  props.finding.evidence.kind === 'cycle' ? props.finding.evidence.cycle : null,
);
// A large cycle is a tangled cluster — a single cut-edge can't break it, so we
// reframe it as "decompose this cluster" and drop the misleading breakpoint.
const isTangle = computed(() => (cycle.value?.modules.length ?? 0) > CYCLE_TANGLE_THRESHOLD);
const breakpoint = computed(() =>
  isTangle.value ? null : (cycle.value?.suggestedBreakpoint ?? null),
);

const copied = ref(false);

async function copyEdge(): Promise<void> {
  const edge = breakpoint.value;
  if (!edge || !navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(`${edge.from} -> ${edge.to}`);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <div v-if="cycle" class="cycle-evidence" data-test="cycle-evidence">
    <!-- Large cluster: decomposition advice, no single cut-edge. -->
    <div v-if="isTangle" class="cycle-tangle" data-test="cycle-tangle">
      <p class="cycle-tangle-title">Tangled cluster</p>
      <p class="cycle-tangle-note">
        {{
          `${cycle.modules.length} modules form one tightly-coupled cluster. No single edge breaks it — decompose it: extract a shared sub-module or split it along responsibilities.`
        }}
      </p>
    </div>

    <!-- Small cycle: the suggested edge to cut is real, actionable advice. -->
    <div v-else-if="breakpoint" class="cycle-break" data-test="cycle-breakpoint">
      <p class="cycle-break-title">Break the cycle here</p>
      <div class="cycle-break-edge">
        <code class="cycle-break-path" :title="breakpoint.from">{{
          moduleLabel(breakpoint.from)
        }}</code>
        <span class="cycle-break-arrow" aria-hidden="true">→</span>
        <code class="cycle-break-path" :title="breakpoint.to">{{
          moduleLabel(breakpoint.to)
        }}</code>
        <button
          type="button"
          class="cycle-break-copy"
          data-test="cycle-breakpoint-copy"
          @click="copyEdge"
        >
          {{ copied ? 'Copied' : 'Copy edge' }}
        </button>
      </div>
    </div>

    <p class="cycle-members-label">
      {{ `Modules in the loop (${cycle.modules.length})` }}
    </p>
    <ol class="cycle-chain">
      <li v-for="m in cycle.modules" :key="m" :title="m">{{ moduleLabel(m) }}</li>
    </ol>
  </div>
</template>

<style scoped>
.cycle-evidence {
  display: flex;
  flex-direction: column;
  gap: var(--arch-space-2, 0.5rem);
  min-width: 0;
}
.cycle-break,
.cycle-tangle {
  padding: var(--arch-space-2, 0.5rem);
  border: 1px solid var(--arch-color-border);
  border-left: 2px solid var(--arch-color-warning);
  border-radius: var(--arch-radius-sm, 0.25rem);
  background: var(--arch-color-surface-2, transparent);
}
.cycle-break-title,
.cycle-tangle-title {
  margin: 0 0 0.375rem;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
}
.cycle-tangle-note {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
}
.cycle-break-edge {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.cycle-break-path {
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 16rem;
}
.cycle-break-arrow {
  color: var(--arch-color-warning);
}
.cycle-break-copy {
  margin-left: auto;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  color: var(--arch-color-fg-muted);
  background: transparent;
  border: 1px solid var(--arch-color-border);
  border-radius: var(--arch-radius-sm, 0.25rem);
  cursor: pointer;
}
.cycle-break-copy:hover {
  color: inherit;
}
.cycle-members-label {
  margin: 0;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
}
/* Bounded + scrollable so a 100-module cluster can't run off the panel; each
   path is truncated to its parent/file with the full path on hover. */
.cycle-chain {
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.8125rem;
  margin: 0;
  padding-left: 1.25rem;
  max-height: 16rem;
  overflow-y: auto;
  overflow-x: hidden;
}
.cycle-chain li {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
