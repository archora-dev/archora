import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { validateLicenseKey, type LicensePayload, type LicenseValidation } from './licenseKeys';

export interface StoredLicense {
  key: string;
  payload: LicensePayload;
  activatedAt: string;
  lastSeenAt: string;
}

const STORAGE_KEY = 'archora:license';

// How many days before expiry the UI starts warning the user.
const EXPIRY_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const useLicenseStore = defineStore('license', () => {
  const status = ref<LicenseValidation['status'] | 'checking'>('checking');
  const payload = ref<LicensePayload | null>(null);
  const message = ref('');

  const isActive = computed(() => status.value === 'active');

  // Whole days left until expiry (rounded up), or null when there is no payload
  // or its date is unparseable. Negative once the license is past its end date.
  const daysLeft = computed(() => {
    if (!payload.value) return null;
    const expiresAt = Date.parse(payload.value.expiresAt);
    if (!Number.isFinite(expiresAt)) return null;
    return Math.ceil((expiresAt - Date.now()) / DAY_MS);
  });

  // True while the license is still active but approaching its end date.
  const expiresSoon = computed(
    () =>
      status.value === 'active' && daysLeft.value !== null && daysLeft.value <= EXPIRY_WARNING_DAYS,
  );

  async function initialize(now = new Date()): Promise<void> {
    const stored = loadStoredLicense();
    if (!stored) {
      status.value = 'invalid';
      payload.value = null;
      message.value = '';
      return;
    }

    const validation = await validateLicenseKey(stored.key, {
      now,
      lastSeenAt: stored.lastSeenAt,
    });
    applyValidation(validation);

    if (validation.status === 'active' && validation.payload) {
      persistStoredLicense({
        ...stored,
        payload: validation.payload,
        lastSeenAt: now.toISOString(),
      });
    }
  }

  async function activate(licenseKey: string, now = new Date()): Promise<boolean> {
    const validation = await validateLicenseKey(licenseKey, { now });
    applyValidation(validation);

    if (validation.status !== 'active' || !validation.payload) {
      return false;
    }

    persistStoredLicense({
      key: licenseKey.trim(),
      payload: validation.payload,
      activatedAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    });
    return true;
  }

  function clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    status.value = 'invalid';
    payload.value = null;
    message.value = '';
  }

  function applyValidation(validation: LicenseValidation): void {
    status.value = validation.status;
    payload.value = validation.payload;
    message.value = validation.message;
  }

  return {
    status,
    payload,
    message,
    isActive,
    daysLeft,
    expiresSoon,
    initialize,
    activate,
    clear,
  };
});

function loadStoredLicense(): StoredLicense | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLicense>;
    if (
      typeof parsed.key !== 'string' ||
      typeof parsed.activatedAt !== 'string' ||
      typeof parsed.lastSeenAt !== 'string' ||
      !parsed.payload
    ) {
      return null;
    }
    return parsed as StoredLicense;
  } catch {
    return null;
  }
}

function persistStoredLicense(license: StoredLicense): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
}
