<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { KeyRound } from 'lucide-vue-next';
import { Button, Input, Panel, Spinner } from '@/shared/ui';
import { useLicenseStore } from '@/entities/license';

const license = useLicenseStore();

const errorMessages: Record<string, string> = {
  expired: 'This license has expired.',
  invalid: 'The license code is not valid.',
  clockRollback: 'The system clock is earlier than the last app run.',
  missingPublicKey: 'This build does not include a license public key.',
  checking: 'Checking license.',
};
const licenseKey = ref('');
const submitting = ref(false);
const submitted = ref(false);
const visualSmokeAccess = computed(() => {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get('archoraVisualSmoke') === '1';
});

const expiresAt = computed(() => {
  if (!license.payload?.expiresAt) return '';
  return new Intl.DateTimeFormat('en').format(new Date(license.payload.expiresAt));
});

const showError = computed(() => {
  return submitted.value && license.status !== 'active' && license.message.length > 0;
});

onMounted(() => {
  if (visualSmokeAccess.value) return;
  void license.initialize();
});

async function activate(): Promise<void> {
  submitted.value = true;
  submitting.value = true;
  try {
    await license.activate(licenseKey.value);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <slot v-if="license.isActive || visualSmokeAccess" />

  <div v-else class="license-screen">
    <Panel class="license-panel">
      <div v-if="license.status === 'checking'" class="license-checking">
        <Spinner />
        <span>Checking license…</span>
      </div>

      <form v-else class="license-form" @submit.prevent="activate">
        <div class="license-mark">
          <KeyRound :size="22" />
        </div>
        <div class="license-copy">
          <p class="license-eyebrow">Offline activation</p>
          <h1>Activate Archora</h1>
          <p>
            Enter the trial or commercial license code you received from the product owner. The
            check runs locally and does not send project data anywhere.
          </p>
        </div>

        <label class="license-field">
          <span>License code</span>
          <Input
            v-model="licenseKey"
            placeholder="ARCHORA-…"
            :invalid="showError"
            autocomplete="off"
          />
        </label>

        <p v-if="showError" class="license-error">
          {{ errorMessages[license.status] ?? '' }}
        </p>

        <p v-if="license.payload && license.status === 'expired'" class="license-expiry">
          {{ `Expired on ${expiresAt}.` }}
        </p>

        <Button type="submit" variant="primary" :loading="submitting" full-width> Activate </Button>
      </form>
    </Panel>
  </div>
</template>

<style scoped>
.license-screen {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 2rem;
  background: var(--color-bg);
}

.license-panel {
  width: min(100%, 30rem);
}

.license-checking,
.license-form {
  display: grid;
  gap: 1rem;
}

.license-checking {
  min-height: 9rem;
  place-items: center;
  color: var(--color-muted);
}

.license-mark {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-accent);
  background: var(--color-surface-muted);
}

.license-copy {
  display: grid;
  gap: 0.35rem;
}

.license-copy h1,
.license-copy p {
  margin: 0;
}

.license-copy h1 {
  font-size: 1.25rem;
  font-weight: 650;
}

.license-copy p {
  color: var(--color-muted);
  line-height: 1.5;
}

.license-eyebrow {
  font-size: 0.75rem;
  font-weight: 650;
  text-transform: uppercase;
}

.license-field {
  display: grid;
  gap: 0.45rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.license-error,
.license-expiry {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
}

.license-error {
  color: var(--color-danger);
}

.license-expiry {
  color: var(--color-muted);
}
</style>
