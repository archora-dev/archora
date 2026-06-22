import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ContractSuggestions from '../ContractSuggestions.vue';
import { useScanStore } from '@/entities/scan';

function setScan(modules: string[], edges: Array<[string, string]>): void {
  const scan = useScanStore();
  // @ts-expect-error: stub
  scan.result = {
    modules: modules.map((id) => ({
      id,
      absPath: id,
      kind: 'unknown',
      language: 'ts',
      loc: 10,
      exports: [],
      isInfra: false,
    })),
    edges: edges.map(([from, to]) => ({ from, to, kind: 'static', specifier: to, resolved: true })),
    cycles: [],
    contractViolations: [],
  };
  scan.status = 'done';
}

describe('ContractSuggestions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('hides when scan is idle or has no suggestions', () => {
    const w = mount(ContractSuggestions);
    expect(w.find('button').exists()).toBe(false);
  });

  it('lists boundary suggestions and renders count', async () => {
    setScan(
      ['src/features/auth/index.ts', 'src/features/billing/index.ts', 'src/shared/lib/x.ts'],
      [],
    );
    const w = mount(ContractSuggestions);
    await w.find('button').trigger('click');
    expect(w.text()).toContain('features-isolation');
    expect(w.text()).toContain('Suggested contracts');
    // shared/** has 0 cycles → expect a no-cycles-shared budget too
    expect(w.text()).toContain('no-cycles-shared');
  });

  it('hides rules already present in scan.config (existing dedup after rescan)', async () => {
    setScan(['src/features/auth/index.ts', 'src/features/billing/index.ts'], []);
    const scan = useScanStore();
    scan.setConfig({
      contracts: {
        boundaries: [
          {
            name: 'features-isolation',
            from: 'src/features/*/**',
            to: 'src/features/*/**',
            mode: 'must-not',
          },
        ],
      },
    });
    const w = mount(ContractSuggestions);
    // After dedup nothing remains -> panel is hidden.
    expect(w.find('button').exists()).toBe(false);
  });

  it('renders the boundary reason text', async () => {
    setScan(['src/features/auth/index.ts', 'src/features/billing/index.ts'], []);
    const w = mount(ContractSuggestions);
    await w.find('button').trigger('click');
    expect(w.text()).toContain('feature folders under src/features/');
  });

  it('copies a .archora.json snippet via clipboard', async () => {
    setScan(['src/features/auth/index.ts', 'src/features/billing/index.ts'], []);
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    });
    const w = mount(ContractSuggestions);
    await w.find('button').trigger('click');
    const btns = w.findAll('button');
    const copyBtn = btns.find((b) => b.text().includes('Copy as'));
    expect(copyBtn).toBeDefined();
    await copyBtn!.trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0]?.[0] as unknown as string;
    const parsed = JSON.parse(written);
    expect(parsed.contracts.boundaries[0].name).toBe('features-isolation');
  });
});
