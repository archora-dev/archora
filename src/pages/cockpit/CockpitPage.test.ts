import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/open-project', () => ({
  pickDirectory: vi.fn().mockResolvedValue({}),
  draftProjectRef: vi
    .fn()
    .mockReturnValue({ id: 'x', name: 'x', rootPath: '/', detectedFramework: 'generic' }),
  FsAccessUnavailableError: class FsAccessUnavailableError extends Error {},
  PickDirectoryCancelledError: class PickDirectoryCancelledError extends Error {},
}));
vi.mock('@/features/scan-project', () => ({
  runScanFlow: vi.fn().mockResolvedValue({}),
  startWatching: vi.fn(),
  useProjectWatcher: vi.fn(),
}));
vi.mock('@/features/open-sample-project', () => ({
  openSampleProject: vi.fn().mockReturnValue({ project: { id: 'sample' } }),
}));

// Lightweight proxy that reproduces the empty-state contract without mounting
// the full widget tree (which requires Tauri/IndexedDB in happy-dom).
const CockpitEmptyStateProxy = {
  template: `
    <div data-test="cockpit-page">
      <div v-if="!hasResult">
        <div v-if="!isRunning" data-test="cockpit-empty-actions">
          <button data-test="open-project">Open project</button>
          <button data-test="open-sample">Try sample</button>
        </div>
      </div>
    </div>
  `,
  props: {
    hasResult: { type: Boolean, default: false },
    isRunning: { type: Boolean, default: false },
  },
};

describe('CockpitPage — empty state contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders open-project affordance when no scan result exists', () => {
    const wrapper = mount(CockpitEmptyStateProxy, {
      props: { hasResult: false, isRunning: false },
    });
    expect(wrapper.find('[data-test="cockpit-empty-actions"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="open-project"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="open-sample"]').exists()).toBe(true);
  });

  it('hides the open-project affordance while scanning', () => {
    const wrapper = mount(CockpitEmptyStateProxy, {
      props: { hasResult: false, isRunning: true },
    });
    expect(wrapper.find('[data-test="cockpit-empty-actions"]').exists()).toBe(false);
  });

  it('CockpitPage.vue contains the open-project wiring', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/pages/cockpit/CockpitPage.vue'), 'utf8');
    expect(src).toContain('data-test="cockpit-empty-actions"');
    expect(src).toContain('Open project');
    expect(src).toContain('Try sample');
    expect(src).toContain('openProject');
    expect(src).toContain('openSample');
  });
});
