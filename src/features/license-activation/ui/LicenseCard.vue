<script setup lang="ts">
import { computed, ref } from 'vue';
import { ShieldCheck, KeyRound, AlertTriangle, X } from 'lucide-vue-next';
import { Button, Input } from '@/shared/ui';
import { plural } from '@/shared/lib';
import { useLicenseStore, validateLicenseKey } from '@/entities/license';

const license = useLicenseStore();

const errorMessages: Record<string, string> = {
  expired: 'This license has expired.',
  invalid: 'The license code is not valid.',
  clockRollback: 'The system clock is earlier than the last app run.',
  missingPublicKey: 'This build does not include a license public key.',
  checking: 'Checking license.',
};

const changing = ref(false);
const newKey = ref('');
const submitting = ref(false);
const localError = ref('');

const expiresAtLabel = computed(() => {
  if (!license.payload?.expiresAt) return '';
  return new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(
    new Date(license.payload.expiresAt),
  );
});

const daysLeft = computed(() => license.daysLeft);

function startChange(): void {
  changing.value = true;
  newKey.value = '';
  localError.value = '';
}

function cancelChange(): void {
  changing.value = false;
  newKey.value = '';
  localError.value = '';
}

// Validate the new code before committing it. We deliberately avoid
// `license.activate` for an unverified key, because activating an invalid code
// would flip the global store out of the `active` state and bounce the whole
// app to the license gate. Only a verified-active code is committed.
async function changeKey(): Promise<void> {
  const key = newKey.value.trim();
  if (!key) {
    localError.value = 'Enter a license code.';
    return;
  }
  submitting.value = true;
  try {
    const validation = await validateLicenseKey(key);
    if (validation.status !== 'active') {
      localError.value = errorMessages[validation.status] ?? '';
      return;
    }
    await license.activate(key);
    changing.value = false;
    newKey.value = '';
    localError.value = '';
  } finally {
    submitting.value = false;
  }
}

function deactivate(): void {
  license.clear();
}
</script>

<template>
  <section class="rounded-lg border border-border bg-surface/80 p-5" data-test="license-card">
    <div class="flex items-start gap-3">
      <div class="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
        <ShieldCheck class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtle">License</h2>
        <p class="mt-1 text-sm text-text-muted">
          Your active license, expiry date and key management.
        </p>
      </div>
    </div>

    <dl class="mt-5 grid gap-3">
      <div class="flex items-center justify-between gap-3">
        <dt class="text-xs font-semibold uppercase tracking-wide text-text-subtle">Plan</dt>
        <dd
          class="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium capitalize text-primary"
          data-test="license-plan"
        >
          {{ license.payload?.plan ?? '—' }}
        </dd>
      </div>

      <div v-if="license.payload?.customer" class="flex items-center justify-between gap-3">
        <dt class="text-xs font-semibold uppercase tracking-wide text-text-subtle">Licensed to</dt>
        <dd class="min-w-0 truncate text-sm text-text">{{ license.payload.customer }}</dd>
      </div>

      <div class="flex items-center justify-between gap-3">
        <dt class="text-xs font-semibold uppercase tracking-wide text-text-subtle">Expires</dt>
        <dd class="text-sm text-text" data-test="license-expires">{{ expiresAtLabel }}</dd>
      </div>
    </dl>

    <p
      v-if="license.expiresSoon && daysLeft !== null"
      class="mt-3 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
      data-test="license-expiry-warning"
    >
      <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
      <span>{{
        plural(daysLeft ?? 0, `Expires in ${daysLeft ?? 0} day`, `Expires in ${daysLeft ?? 0} days`)
      }}</span>
    </p>

    <form
      v-if="changing"
      class="mt-4 grid gap-2"
      data-test="license-change-form"
      @submit.prevent="changeKey"
    >
      <label class="sr-only" for="license-change-input">License code</label>
      <Input
        id="license-change-input"
        v-model="newKey"
        placeholder="ARCHORA-…"
        :invalid="Boolean(localError)"
        autocomplete="off"
      />
      <p v-if="localError" class="text-xs text-danger" data-test="license-change-error">
        {{ localError }}
      </p>
      <div class="flex gap-2">
        <Button type="submit" variant="primary" :loading="submitting">
          <KeyRound class="size-3.5" />
          Apply key
        </Button>
        <Button type="button" variant="ghost" @click="cancelChange">
          <X class="size-3.5" />
          Cancel
        </Button>
      </div>
    </form>

    <div v-else class="mt-4 flex flex-wrap gap-2">
      <Button variant="secondary" data-test="license-change" @click="startChange">
        <KeyRound class="size-3.5" />
        Change key
      </Button>
      <Button variant="ghost" data-test="license-deactivate" @click="deactivate">Deactivate</Button>
    </div>
  </section>
</template>
