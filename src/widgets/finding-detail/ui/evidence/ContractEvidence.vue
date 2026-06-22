<script setup lang="ts">
import { computed } from 'vue';
import type { Finding } from '@/entities/finding';
const props = defineProps<{ finding: Finding }>();
const violation = computed(() =>
  props.finding.evidence.kind === 'contract' ? props.finding.evidence.violation : null,
);
const isRscLeak = computed(() => violation.value?.kind === 'rsc-leak');
</script>
<template>
  <div v-if="violation" class="contract-evidence" data-test="contract-evidence">
    <p class="contract-kind">
      {{ isRscLeak ? 'Server/client boundary leak' : 'Contract violation' }}
    </p>
    <p class="contract-message">{{ violation.message }}</p>
    <p v-if="violation.edge" class="contract-edge">
      {{ violation.edge.from }} → {{ violation.edge.to }}
    </p>
  </div>
</template>
<style scoped>
.contract-kind {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--arch-color-fg-muted);
}
.contract-message {
  font-size: 0.875rem;
}
.contract-edge {
  font-family: var(--arch-font-mono, monospace);
  font-size: 0.8125rem;
}
</style>
