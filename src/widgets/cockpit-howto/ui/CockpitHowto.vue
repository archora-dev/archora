<script setup lang="ts">
import { ref } from 'vue';
import { Button } from '@/shared/ui';

const STORAGE_KEY = 'archora.cockpit.howto.dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const dismissed = ref(readDismissed());

function dismiss(): void {
  dismissed.value = true;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private mode or storage disabled: hide for this session only.
  }
}
</script>

<template>
  <aside v-if="!dismissed" class="howto" data-test="cockpit-howto">
    <div class="howto-body">
      <h2>How to read this</h2>
      <p>
        Left rail filters by type and severity. The center column is the findings queue. The right
        panel explains the selected finding and links into context.
      </p>
      <p>
        The loop is read → pick → act → export: scan the briefing, open the priority that matters,
        apply the fix, then export a report for the PR.
      </p>
    </div>
    <Button variant="ghost" size="sm" data-test="howto-dismiss" @click="dismiss"> Got it </Button>
  </aside>
</template>

<style scoped>
.howto {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--arch-space-4, 1rem);
  padding: var(--arch-space-3, 0.75rem) var(--arch-space-4, 1rem);
  border-bottom: 1px solid var(--arch-color-border);
  background: var(--arch-color-surface-2);
}
.howto-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.howto-body h2 {
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--arch-color-fg-muted);
}
.howto-body p {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: inherit;
}
</style>
