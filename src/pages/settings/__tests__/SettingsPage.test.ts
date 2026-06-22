import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../SettingsPage.vue';
import { useToast } from '@/shared/ui';
import { useSettingsStore } from '@/entities/settings';
import { useScanStore } from '@/entities/scan';
import type { ScanResult } from '@/core/analyzer/types';

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/project/:id/layer-rules', component: { template: '<div />' } },
    ],
  });
}

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('focuses settings on analyzer workflow controls', () => {
    const wrapper = mount(SettingsPage, {
      global: {
        plugins: [makeRouter()],
        stubs: {
          Modal: true,
        },
      },
    });

    const text = wrapper.text();

    expect(text).toContain('Analysis hygiene');
    expect(text).toContain('**/openapi/**');
    expect(text).toContain('classifyAsGenerated');
    expect(text).toContain('File watcher');
  });

  it('lets the user manage generated path patterns locally', async () => {
    const wrapper = mount(SettingsPage, {
      global: {
        plugins: [makeRouter()],
        stubs: {
          Modal: true,
        },
      },
    });
    const settings = useSettingsStore();

    expect(wrapper.get('[data-test="generated-path-empty"]').text()).toContain(
      'No patterns added yet',
    );

    await wrapper.get('[data-test="generated-path-input"]').setValue('src//recruit/openapi/**');
    await wrapper.get('[data-test="generated-path-form"]').trigger('submit');

    expect(settings.settings.analysis.generatedPaths).toEqual(['src/recruit/openapi/**']);
    expect(wrapper.get('[data-test="generated-path-item"]').text()).toContain(
      'src/recruit/openapi/**',
    );
    expect(wrapper.text()).toContain('"paths": [');
    expect(wrapper.text()).toContain('"src/recruit/openapi/**"');

    await wrapper.get('[data-test="generated-path-remove"]').trigger('click');

    expect(settings.settings.analysis.generatedPaths).toEqual([]);
    expect(wrapper.get('[data-test="generated-path-empty"]').text()).toContain(
      'No patterns added yet',
    );
  });

  it('previews matched module count and warns on broad patterns once a scan exists', async () => {
    const scan = useScanStore();
    const moduleIds = [
      ...Array.from({ length: 4 }, (_, i) => `src/recruit/openapi/api-${i}.ts`),
      ...Array.from({ length: 16 }, (_, i) => `src/features/feature-${i}.ts`),
    ];
    scan.complete({
      ...minimalScan(),
      modules: moduleIds.map((id) => ({
        id,
        absPath: `/p/${id}`,
        kind: 'unknown',
        language: 'ts',
        loc: 1,
        exports: [],
        isInfra: false,
      })),
    });

    const settings = useSettingsStore();
    // Narrow pattern (4/20 = 20%) and broad pattern (20/20 = 100%).
    settings.setAnalysis('generatedPaths', ['src/recruit/openapi/**', 'src/**']);

    const wrapper = mount(SettingsPage, {
      global: { plugins: [makeRouter()], stubs: { Modal: true } },
    });

    const previews = wrapper.findAll('[data-test="generated-path-preview"]');
    expect(previews).toHaveLength(2);
    expect(previews[0]!.text()).toContain('4 modules');
    expect(previews[1]!.text()).toContain('20 modules');

    const warnings = wrapper.findAll('[data-test="generated-path-warning"]');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.text()).toContain('50%');
  });

  it('confirms an editor command edit with a toast once typing settles', async () => {
    vi.useFakeTimers();
    try {
      const toast = useToast();
      toast.toasts.value.forEach((t) => toast.dismiss(t.id));

      const wrapper = mount(SettingsPage, {
        global: { plugins: [makeRouter()], stubs: { Modal: true } },
      });
      const settings = useSettingsStore();

      await wrapper.get('[data-test="editor-command"]').setValue('webstorm');

      // Stored right away, but not announced until the user pauses typing.
      expect(settings.settings.editor.command).toBe('webstorm');
      expect(toast.toasts.value.some((t) => t.title === 'Editor command saved')).toBe(false);

      vi.advanceTimersByTime(600);

      expect(toast.toasts.value.some((t) => t.title === 'Editor command saved')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the settings page scrollable so it fits short desktop windows', () => {
    const wrapper = mount(SettingsPage, {
      global: { plugins: [makeRouter()], stubs: { Modal: true } },
    });
    expect(wrapper.get('.settings-page').classes()).toContain('overflow-y-auto');
  });
});

function minimalScan(): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/p', detectedFramework: 'vue' },
    modules: [],
    edges: [],
    cycles: [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: '2026-05-12T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
  };
}
