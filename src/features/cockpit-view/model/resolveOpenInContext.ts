import type { Finding } from '@/entities/finding';
import type { DrilldownSurface } from './drilldownStore';

/**
 * Where a finding's "open in context" should land.
 * - `drilldown` opens a surface focused on a REAL module id.
 * - `select` is the fallback when no real module anchor exists: the queue keeps
 *   the finding selected and its detail open, rather than opening an empty surface.
 */
export type OpenInContextTarget =
  | { kind: 'drilldown'; surface: DrilldownSurface; moduleId: string }
  | { kind: 'select' };

/**
 * Resolves a sensible, type-aware drill-down for a finding.
 *
 * The anchor is always `finding.location`, which the adapters set to a real
 * module id (for cycles it is `cycle.modules[0]`, never the `cycle:` id). We
 * verify it against the scan's module set so Impact never receives an id that
 * resolves to nothing — a cycle/edge id would render an empty "no dependencies"
 * surface. When the anchor is missing or not a real module, fall back to keeping
 * the finding selected.
 */
export function resolveOpenInContext(
  finding: Finding,
  moduleIds: ReadonlySet<string>,
): OpenInContextTarget {
  const anchor = finding.location;
  if (anchor && moduleIds.has(anchor)) {
    return { kind: 'drilldown', surface: 'impact', moduleId: anchor };
  }
  return { kind: 'select' };
}
