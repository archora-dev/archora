import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { ScanResult } from '@/core/analyzer/types';
import ExportAction from './ExportAction.vue';

const saveReport = vi
  .fn()
  .mockResolvedValue({ exportedAt: 't', fileName: 'r.json', format: 'json', scope: 'full' });
vi.mock('@/features/export-report', () => ({
  saveReport: (...args: unknown[]) => saveReport(...args),
}));

const scan = { project: { id: 'p' } } as ScanResult;

describe('ExportAction', () => {
  it('calls saveReport with the chosen format', async () => {
    const w = mount(ExportAction, { props: { scan } });
    await w.find('[data-test="export-json"]').trigger('click');
    expect(saveReport).toHaveBeenCalledWith({ scan, format: 'json', scope: 'full' });
  });
});
