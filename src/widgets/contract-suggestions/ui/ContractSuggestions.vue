<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, ChevronRight, Copy, Lightbulb } from 'lucide-vue-next';
import { Badge, Button, useToast } from '@/shared/ui';
import { useScanStore } from '@/entities/scan';
import { suggestContracts, type SuggestedReason } from '@/core/analyzer/suggestContracts';
import type { BudgetRule, ContractsConfig } from '@/core/config/frontScopeConfig';

// Auto-suggest contract rules. Runs the same engine as
// `archora suggest contracts` over the current in-memory scan and lets
// the user copy the result straight into `.archora.json`.

const scan = useScanStore();
const toast = useToast();

const open = ref(false);

const suggestions = computed(() => {
  const r = scan.result;
  if (!r) {
    return {
      contracts: {} as ContractsConfig,
      reasons: {} as Record<string, string>,
      reasonKeys: {} as Record<string, SuggestedReason>,
    };
  }
  // Pass the loaded `.archora.json` so already-applied rules disappear
  // from the list after the user copies the suggestion + rescans.
  return suggestContracts({
    modules: r.modules,
    edges: r.edges,
    cycles: r.cycles,
    ...(scan.config?.contracts ? { existing: scan.config.contracts } : {}),
  });
});

function reasonText(name: string): string {
  const k = suggestions.value.reasonKeys[name];
  if (k) return formatReason(k);
  return suggestions.value.reasons[name] ?? '';
}

function formatReason(reason: SuggestedReason): string {
  const { count, fromLayer, toLayer, label } = reason.params;
  switch (reason.key) {
    case 'featuresIsolation':
      return `Found ${count} feature folders under src/features/. The rule forbids sibling-to-sibling imports.`;
    case 'layerDiscipline':
      return `Observed ${count} edge(s) from ${fromLayer} into ${toLayer}; codify the rule to prevent regression after the fix.`;
    case 'noCycles':
      return `${label} currently has 0 cycles — lock it in to catch regressions.`;
    default:
      return '';
  }
}

const boundaries = computed(() => suggestions.value.contracts.boundaries ?? []);
const budgets = computed(() => suggestions.value.contracts.budgets ?? []);
const total = computed(() => boundaries.value.length + budgets.value.length);

const visible = computed(() => scan.status === 'done' && total.value > 0);

const json = computed(() => JSON.stringify({ contracts: suggestions.value.contracts }, null, 2));

function budgetMetric(rule: BudgetRule): string {
  // Show the binding metric verbatim — these are config keys, identical in
  // en/ru. Falls back to an empty string if multiple metrics coexist.
  if (typeof rule.maxCycles === 'number') return `maxCycles=${rule.maxCycles}`;
  if (typeof rule.maxFanIn === 'number') return `maxFanIn=${rule.maxFanIn}`;
  if (typeof rule.maxFanOut === 'number') return `maxFanOut=${rule.maxFanOut}`;
  if (typeof rule.maxLoc === 'number') return `maxLoc=${rule.maxLoc}`;
  return '';
}

async function copyJson(): Promise<void> {
  try {
    await navigator.clipboard.writeText(json.value);
    toast.success('Copied to clipboard');
  } catch (e) {
    toast.danger('Could not copy', e instanceof Error ? e.message : String(e));
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="flex max-h-[60vh] w-96 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-elev-2"
  >
    <Button
      class="shrink-0 items-center justify-between px-3 py-2 text-xs font-medium"
      variant="ghost"
      full-width
      @click="open = !open"
    >
      <span class="flex items-center gap-1.5">
        <Lightbulb class="h-3.5 w-3.5 text-warning" />
        <span>Suggested contracts</span>
        <Badge tone="primary">{{ total }}</Badge>
      </span>
      <component :is="open ? ChevronDown : ChevronRight" class="h-3.5 w-3.5" />
    </Button>

    <div v-if="open" class="min-h-0 flex-1 overflow-hidden">
      <div
        class="flex items-center justify-between gap-2 border-t border-border bg-surface-2/40 px-3 py-2 text-[11px]"
      >
        <span class="text-text-subtle">Codify what the code already implies</span>
        <Button
          type="button"
          class="gap-1 px-1.5 py-0.5 text-xs"
          size="sm"
          variant="secondary"
          @click="copyJson"
        >
          <Copy class="h-3 w-3" />
          Copy as .archora.json
        </Button>
      </div>

      <div
        class="max-h-[calc(60vh-3rem)] overflow-y-auto border-t border-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-strong/50 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
      >
        <div
          v-for="rule in boundaries"
          :key="`b-${rule.name}`"
          class="border-b border-border/60 px-3 py-2 text-xs"
        >
          <div class="mb-1 flex items-center gap-1.5">
            <Badge tone="primary">Boundary</Badge>
            <span class="font-mono text-text">{{ rule.name }}</span>
            <span v-if="rule.severity" class="text-text-subtle">·</span>
            <span v-if="rule.severity" class="text-text-subtle">{{ rule.severity }}</span>
          </div>
          <div class="font-mono text-[11px] leading-snug text-text-muted">
            {{ rule.from }}
            <span class="text-text-subtle">{{ rule.mode === 'must-not' ? '⤳' : '→' }}</span>
            {{ rule.to }}
          </div>
          <div v-if="reasonText(rule.name)" class="mt-1 leading-relaxed text-text-subtle">
            {{ reasonText(rule.name) }}
          </div>
        </div>

        <div
          v-for="rule in budgets"
          :key="`g-${rule.name}`"
          class="border-b border-border/60 px-3 py-2 text-xs"
        >
          <div class="mb-1 flex items-center gap-1.5">
            <Badge tone="info">Budget</Badge>
            <span class="font-mono text-text">{{ rule.name }}</span>
          </div>
          <div class="font-mono text-[11px] leading-snug text-text-muted">
            {{ rule.module }}
            <span class="text-text-subtle">·</span>
            {{ budgetMetric(rule) }}
          </div>
          <div v-if="reasonText(rule.name)" class="mt-1 leading-relaxed text-text-subtle">
            {{ reasonText(rule.name) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
