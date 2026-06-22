<script setup lang="ts">
import { ref, watch } from 'vue';
import { RefreshCcw, X } from 'lucide-vue-next';
import { Button, IconButton, Spinner } from '@/shared/ui';
import { useAnalysisSettingsDirty } from '@/features/scan-project';

const { dirty, rescanning, rescan } = useAnalysisSettingsDirty();

// Dismissed for the current session; re-arms whenever the excluded paths drift
// away from the scanned set again.
const dismissed = ref(false);
watch(dirty, (value) => {
  if (value) dismissed.value = false;
});

function onRescan(): void {
  void rescan();
}
</script>

<template>
  <div
    v-if="dirty && !dismissed"
    class="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning"
    data-test="analysis-settings-banner"
  >
    <RefreshCcw class="size-4 shrink-0" />
    <div class="min-w-0 flex-1">
      <p class="font-medium text-text">Analysis settings changed</p>
      <p class="text-xs text-text-muted">
        Excluded paths were edited since the last scan. Re-scan to apply them to findings.
      </p>
    </div>
    <Button
      size="sm"
      variant="primary"
      :disabled="rescanning"
      data-test="analysis-settings-rescan"
      @click="onRescan"
    >
      <Spinner v-if="rescanning" class="size-3.5" />
      <RefreshCcw v-else class="size-3.5" />
      Re-scan now
    </Button>
    <IconButton :icon="X" size="sm" variant="ghost" label="Dismiss" @click="dismissed = true" />
  </div>
</template>
