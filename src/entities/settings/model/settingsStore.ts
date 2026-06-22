import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { endStartupSpan, markStartup, startStartupSpan } from '@/shared/lib/startupTiming';

export interface UserSettings {
  analysis: {
    generatedPaths: string[];
  };
  watcher: {
    /** Auto re-scan when files change. Tauri-only; ignored in browser. */
    autoRescan: boolean;
  };
  editor: {
    /** CLI command that opens a file (e.g. `code`, `cursor`, `subl`, `webstorm`). */
    command: string;
  };
}

export const DEFAULT_SETTINGS: UserSettings = {
  analysis: {
    generatedPaths: [],
  },
  watcher: {
    autoRescan: true,
  },
  editor: {
    command: 'code',
  },
};

const STORAGE_KEY = 'fs:settings';

function clone(s: UserSettings): UserSettings {
  return JSON.parse(JSON.stringify(s)) as UserSettings;
}

function sanitizeAnalysis(
  input: Partial<UserSettings['analysis']> | undefined,
): UserSettings['analysis'] {
  if (!input || !Array.isArray(input.generatedPaths)) {
    return { ...DEFAULT_SETTINGS.analysis };
  }

  return {
    generatedPaths: input.generatedPaths.filter(
      (path): path is string => typeof path === 'string' && path.trim().length > 0,
    ),
  };
}

function sanitizeEditor(
  input: Partial<UserSettings['editor']> | undefined,
): UserSettings['editor'] {
  const command = typeof input?.command === 'string' ? input.command.trim() : '';
  return { command: command.length > 0 ? command : DEFAULT_SETTINGS.editor.command };
}

function load(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    // Shallow merge per section so adding new settings keeps existing prefs valid.
    return {
      analysis: sanitizeAnalysis(parsed.analysis),
      watcher: { ...DEFAULT_SETTINGS.watcher, ...(parsed.watcher ?? {}) },
      editor: sanitizeEditor(parsed.editor),
    };
  } catch {
    return clone(DEFAULT_SETTINGS);
  }
}

function persist(s: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* noop - private mode / quota */
  }
}

export const useSettingsStore = defineStore('settings', () => {
  startStartupSpan('settings store load');
  const settings = ref<UserSettings>(load());
  endStartupSpan('settings store load', `autoRescan=${settings.value.watcher.autoRescan}`);

  // sync flush so a setter call is durable before the next tick;
  // payload is small (< 1KB) so we don't worry about thrash.
  watch(
    settings,
    (s) => {
      markStartup('settings store persist');
      persist(s);
    },
    { deep: true, flush: 'sync' },
  );

  function setWatcher<K extends keyof UserSettings['watcher']>(
    key: K,
    value: UserSettings['watcher'][K],
  ): void {
    settings.value.watcher[key] = value;
  }

  function setAnalysis<K extends keyof UserSettings['analysis']>(
    key: K,
    value: UserSettings['analysis'][K],
  ): void {
    settings.value.analysis[key] = value;
  }

  function setEditor<K extends keyof UserSettings['editor']>(
    key: K,
    value: UserSettings['editor'][K],
  ): void {
    settings.value.editor[key] = value;
  }

  function reset(): void {
    settings.value = clone(DEFAULT_SETTINGS);
  }

  return { settings, setAnalysis, setWatcher, setEditor, reset };
});
