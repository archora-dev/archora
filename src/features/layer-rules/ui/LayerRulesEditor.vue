<script setup lang="ts">
import { computed } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import { Button, IconButton, Input, Select } from '@/shared/ui';
import { useLayerRulesStore, type LayerRuleRow } from '@/entities/layerRules';
import {
  LAYER_ORDER,
  validateLayerOverride,
  type LayerOverrideError,
} from '@/core/analyzer/layers';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ change: [] }>();

const store = useLayerRulesStore();

const rows = computed<LayerRuleRow[]>(() => store.draftRows(props.projectId));

const layerOptions = LAYER_ORDER.map((l) => ({ value: l, label: l }));

const overrideErrors: Record<LayerOverrideError, string> = {
  empty: 'Empty pattern',
  'invalid-glob': 'Invalid glob',
  'unknown-layer': 'Unsupported layer',
};

function rowError(row: LayerRuleRow): string | null {
  const code = validateLayerOverride(row.pattern, row.layer);
  if (!code) return null;
  return overrideErrors[code] ?? code;
}

function add(): void {
  store.addRow(props.projectId);
  emit('change');
}

function remove(rowId: string): void {
  store.removeRow(props.projectId, rowId);
  emit('change');
}

function onPattern(rowId: string, value: string): void {
  store.updateRow(props.projectId, rowId, { pattern: value });
  emit('change');
}

function onLayer(rowId: string, value: string): void {
  store.updateRow(props.projectId, rowId, { layer: value });
  emit('change');
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <header class="flex items-center justify-between">
      <h2 class="text-md font-medium text-text">Overrides</h2>
      <Button size="sm" variant="ghost" @click="add"> <Plus :size="14" /> Add rule </Button>
    </header>

    <p
      v-if="rows.length === 0"
      class="rounded-md border border-border bg-surface-2/40 p-4 text-sm text-text-muted"
    >
      No overrides yet. Layers are inferred from path segments (src/[layer]/...).
    </p>

    <ul v-else class="flex min-h-0 flex-col gap-2 overflow-auto pr-1">
      <li
        v-for="row in rows"
        :key="row.rowId"
        class="flex items-start gap-2 rounded-md border border-border bg-surface p-2"
      >
        <div class="min-w-0 flex-1">
          <Input
            :model-value="row.pattern"
            placeholder="e.g. src/lib/adapters/**"
            class="font-mono text-xs"
            spellcheck="false"
            @update:model-value="(v: string) => onPattern(row.rowId, v)"
          />
          <p v-if="rowError(row)" class="mt-1 text-xs text-danger">{{ rowError(row) }}</p>
        </div>
        <Select
          :model-value="row.layer"
          :options="layerOptions"
          class="w-32 shrink-0"
          @update:model-value="(v: string) => onLayer(row.rowId, v)"
        />
        <IconButton :icon="Trash2" size="sm" label="Remove rule" @click="remove(row.rowId)" />
      </li>
    </ul>
  </div>
</template>
