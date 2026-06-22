import type { ScanResult } from '@/core/analyzer/types';
import type { DrilldownSurface } from '@/features/cockpit-view';

export type CommandItem = {
  value: string;
  label: string;
  description?: string;
  action: { kind: 'surface'; surface: DrilldownSurface } | { kind: 'module'; moduleId: string };
};

export interface CommandLabels {
  surfaces: Record<DrilldownSurface, string>;
}

// Impact is intentionally absent: it is a per-module surface with no meaningful
// "global" form. It is reached by picking a specific module below, or via
// "open in context" on a finding — not as a target-less command.
const PALETTE_SURFACES: DrilldownSurface[] = [
  'change-risk',
  'dead-code',
  'ownership',
  'explorer',
  'rules',
  'scan-info',
];

export function buildCommandItems(scan: ScanResult | null, labels: CommandLabels): CommandItem[] {
  // Without a scan there are no surfaces or modules to jump to; the palette
  // shows its empty-state text instead of a stale list.
  if (!scan) return [];

  const surfaceItems: CommandItem[] = PALETTE_SURFACES.map((surface) => ({
    value: `surface:${surface}`,
    label: labels.surfaces[surface],
    action: { kind: 'surface', surface },
  }));
  const moduleItems: CommandItem[] = scan.modules.map((m) => ({
    value: `module:${m.id}`,
    label: m.id,
    description: m.kind,
    action: { kind: 'module', moduleId: m.id },
  }));
  return [...surfaceItems, ...moduleItems];
}
