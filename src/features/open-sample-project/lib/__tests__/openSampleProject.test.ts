import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '@/entities/project';
import { useScanStore } from '@/entities/scan';
import { SAMPLE_PROJECT_ID } from '@/entities/sample-project';
import { openSampleProject } from '../openSampleProject';

describe('openSampleProject', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('loads a real ScanResult-shaped sample into project and scan stores', () => {
    const result = openSampleProject();
    const project = useProjectStore();
    const scan = useScanStore();

    expect(result.project.id).toBe(SAMPLE_PROJECT_ID);
    expect(project.current?.id).toBe(SAMPLE_PROJECT_ID);
    expect(project.recent[0]?.id).toBe(SAMPLE_PROJECT_ID);
    expect(scan.status).toBe('done');
    expect(scan.result?.project.id).toBe(SAMPLE_PROJECT_ID);
    expect(scan.result?.modules.length).toBeGreaterThan(0);
    expect(scan.result?.cycles.length).toBeGreaterThan(0);
    expect(scan.result?.layerViolations.length).toBeGreaterThan(0);
    expect(scan.result?.contractViolations).toEqual([]);
  });
});
