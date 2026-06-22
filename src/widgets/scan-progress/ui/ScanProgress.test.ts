import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import ScanProgress from './ScanProgress.vue';
import { useScanStore } from '@/entities/scan';
import { useProjectStore } from '@/entities/project';

describe('ScanProgress', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the plain-language phase label and a percentage while running', () => {
    const project = useProjectStore();
    project.setCurrent({
      id: 'p1',
      name: 'acme-web',
      source: 'fs',
      locator: '/acme-web',
    } as never);

    const scan = useScanStore();
    scan.start();
    scan.setProgress({ phase: 'parse', current: 50, total: 100 });

    const wrapper = mount(ScanProgress);

    const text = wrapper.text();
    // Friendly phase label, not the raw enum.
    expect(text).toContain('Parse');
    expect(text).toContain('Reading files');
    expect(text).toContain('Scanning acme-web');
    expect(text).toContain('50 / 100');

    // discover (20%) done + half of parse (10%) -> 30% overall.
    const percent = wrapper.get('[data-test="scan-progress-percent"]');
    expect(percent.text()).toBe('30%');
  });

  it('renders an error state with the scan message', () => {
    const scan = useScanStore();
    scan.start();
    scan.fail(new Error('Cannot read project files'));

    const wrapper = mount(ScanProgress);

    expect(wrapper.text()).toContain('Scan failed');
    expect(wrapper.text()).toContain('Cannot read project files');
  });
});
