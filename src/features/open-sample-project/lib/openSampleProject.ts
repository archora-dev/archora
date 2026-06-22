import { buildSampleArchitectureScan } from '@/entities/sample-project';
import { useProjectStore } from '@/entities/project';
import { useScanStore } from '@/entities/scan';
import type { ScanResult } from '@/core/analyzer/types';

export function openSampleProject(): ScanResult {
  const result = buildSampleArchitectureScan();
  const project = useProjectStore();
  const scan = useScanStore();

  project.setCurrent(result.project);
  scan.setConfig(null);
  scan.complete(result);

  return result;
}
