<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { AlertTriangle, X } from 'lucide-vue-next';
import { IconButton } from '@/shared/ui';
import { plural } from '@/shared/lib';
import { useLicenseStore } from '@/entities/license';

const router = useRouter();
const license = useLicenseStore();

// Dismissed for the current session only; the reminder returns on next launch
// while the license is still inside the warning window.
const dismissed = ref(false);

function openSettings(): void {
  void router.push('/settings');
}
</script>

<template>
  <div
    v-if="license.expiresSoon && !dismissed && license.daysLeft !== null"
    class="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning"
    data-test="license-expiry-banner"
  >
    <AlertTriangle class="size-4 shrink-0" />
    <span class="min-w-0 flex-1">
      {{
        plural(
          license.daysLeft ?? 0,
          `Your license expires in ${license.daysLeft ?? 0} day`,
          `Your license expires in ${license.daysLeft ?? 0} days`,
        )
      }}
    </span>
    <button
      type="button"
      class="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
      @click="openSettings"
    >
      Open settings
    </button>
    <IconButton :icon="X" size="sm" variant="ghost" label="Dismiss" @click="dismissed = true" />
  </div>
</template>
