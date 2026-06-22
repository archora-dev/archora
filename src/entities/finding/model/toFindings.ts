import type { ScanResult } from '@/core/analyzer/types';
import {
  asyncLifecycleToFinding,
  contractToFinding,
  couplingToFinding,
  cycleToFinding,
  hotspotToFinding,
  layerViolationToFinding,
  memoryToFinding,
  setupToFinding,
} from './adapters';
import type { Finding } from './types';

const COUPLING_CAP = 10;

export function toFindings(scan: ScanResult): Finding[] {
  const out: Finding[] = [];
  for (const cycle of scan.cycles) out.push(cycleToFinding(cycle));
  for (const violation of scan.layerViolations) out.push(layerViolationToFinding(violation));
  // `scan.hotZones` already excludes re-export barrels — core ranks them out of
  // the hot-zone window (see markBarrelModules/rankHotZones). No second pass here.
  scan.hotZones.forEach((moduleId, rank) => {
    const metrics = scan.metrics[moduleId];
    if (!metrics) return;
    out.push(hotspotToFinding(moduleId, metrics, rank, scan.hotZones.length));
  });
  for (const violation of scan.contractViolations) out.push(contractToFinding(violation));
  const couplings = (scan.temporalCoupling ?? [])
    .filter((c) => c.hidden && c.crossBoundary)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, COUPLING_CAP);
  for (const coupling of couplings) out.push(couplingToFinding(coupling));
  for (const finding of scan.memoryRisks ?? []) out.push(memoryToFinding(finding));
  for (const finding of scan.asyncLifecycleRisks ?? []) out.push(asyncLifecycleToFinding(finding));
  (scan.configDiagnostics ?? []).forEach((diagnostic, index) =>
    out.push(setupToFinding(diagnostic, index)),
  );
  return out;
}
