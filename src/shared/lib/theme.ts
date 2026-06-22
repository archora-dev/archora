import { ref } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'fs:theme';

// Dark is the first-run default; `system` stays selectable and follows the OS.
const DEFAULT_MODE: ThemeMode = 'dark';

function resolveEffective(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function getStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* noop */
  }
  return DEFAULT_MODE;
}

export function applyTheme(mode: ThemeMode): void {
  const effective = resolveEffective(mode);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = effective;
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* noop */
  }
}

export function applyInitialTheme(): void {
  applyTheme(getStoredMode());
}

// Module-level reactive source so the shell control and the Settings page stay
// in sync without depending on a store from an upper FSD layer.
const mode = ref<ThemeMode>(getStoredMode());

export function useTheme(): {
  mode: typeof mode;
  setMode: (next: ThemeMode) => void;
} {
  function setMode(next: ThemeMode): void {
    mode.value = next;
    applyTheme(next);
  }
  return { mode, setMode };
}
