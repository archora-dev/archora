import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { DEFAULT_SETTINGS, useSettingsStore } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('seeds with defaults when storage is empty', () => {
    const s = useSettingsStore();
    expect(s.settings.analysis.generatedPaths).toEqual(DEFAULT_SETTINGS.analysis.generatedPaths);
    expect(s.settings.watcher.autoRescan).toBe(DEFAULT_SETTINGS.watcher.autoRescan);
  });

  it('persists changes to localStorage', () => {
    const s = useSettingsStore();
    s.setAnalysis('generatedPaths', ['src/generated/**']);
    s.setWatcher('autoRescan', false);
    const raw = localStorage.getItem('fs:settings');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.analysis.generatedPaths).toEqual(['src/generated/**']);
    expect(parsed.watcher.autoRescan).toBe(false);
  });

  it('reset() restores all sections to defaults', () => {
    const s = useSettingsStore();
    s.setAnalysis('generatedPaths', ['src/generated/**']);
    s.setWatcher('autoRescan', false);
    s.reset();
    expect(s.settings.analysis.generatedPaths).toEqual(DEFAULT_SETTINGS.analysis.generatedPaths);
    expect(s.settings.watcher.autoRescan).toBe(DEFAULT_SETTINGS.watcher.autoRescan);
  });

  it('keeps user prefs when a new field is added (shallow merge)', () => {
    localStorage.setItem(
      'fs:settings',
      JSON.stringify({ analysis: { generatedPaths: ['src/openapi/**'] } }),
    );
    const s = useSettingsStore();
    expect(s.settings.analysis.generatedPaths).toEqual(['src/openapi/**']);
    expect(s.settings.watcher.autoRescan).toBe(DEFAULT_SETTINGS.watcher.autoRescan);
  });

  it('drops the legacy graph field but keeps the editor command', () => {
    localStorage.setItem(
      'fs:settings',
      JSON.stringify({
        graph: { colorMode: 'fanIn', focusDepth: 3 },
        editor: { command: 'cursor' },
        watcher: { autoRescan: false },
      }),
    );
    const s = useSettingsStore();
    expect(s.settings.watcher.autoRescan).toBe(false);
    expect(s.settings.editor.command).toBe('cursor');
    expect((s.settings as Record<string, unknown>).graph).toBeUndefined();
  });

  it('falls back to the default editor command when blank or missing', () => {
    localStorage.setItem('fs:settings', JSON.stringify({ editor: { command: '   ' } }));
    expect(useSettingsStore().settings.editor.command).toBe('code');
  });
});
