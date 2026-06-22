import type { ModuleId, ModuleNode, ScanResult } from '../analyzer/types';

export interface DeadCodeCandidate {
  id: ModuleId;
  loc: number;
  kind: ModuleNode['kind'];
  group: 'isolated' | 'script-entry';
  reason: string;
}

export interface DeadCodeReport {
  candidates: DeadCodeCandidate[];
  /** Sum of candidate loc — the reclaimable LOC estimate. */
  totalLoc: number;
  isolatedCount: number;
  scriptEntryCount: number;
}

const DEAD_MODULE_REASON =
  'No resolved imports connect this module to the analyzed dependency model.';

export function buildDeadCodeReport(scan: ScanResult): DeadCodeReport {
  const candidates: DeadCodeCandidate[] = [];

  for (const module of scan.modules) {
    if (!isReviewModule(module.id)) continue;
    const metrics = scan.metrics[module.id];
    const fanIn = metrics?.fanIn ?? 0;
    const fanOut = metrics?.fanOut ?? 0;
    if (
      fanIn === 0 &&
      fanOut === 0 &&
      module.exports.length === 0 &&
      module.kind !== 'entry' &&
      module.kind !== 'test' &&
      !module.isGenerated &&
      !module.isInfra
    ) {
      candidates.push({
        id: module.id,
        loc: module.loc,
        kind: module.kind,
        group: isScriptEntryCandidate(module.id) ? 'script-entry' : 'isolated',
        reason: DEAD_MODULE_REASON,
      });
    }
  }

  candidates.sort((a, b) => b.loc - a.loc || a.id.localeCompare(b.id));

  const totalLoc = candidates.reduce((sum, c) => sum + c.loc, 0);
  const isolatedCount = candidates.filter((c) => c.group === 'isolated').length;
  const scriptEntryCount = candidates.filter((c) => c.group === 'script-entry').length;

  return { candidates, totalLoc, isolatedCount, scriptEntryCount };
}

/**
 * Repair action and verify text for an unreachable module finding.
 * Shared with buildFixPlan so the two never diverge.
 */
export function unreachableRepair(id: ModuleId): {
  action: string;
  verify: string;
  params: Record<string, unknown>;
} {
  if (isScriptEntryCandidate(id)) {
    return {
      action: `Treat ${id} as a script entry: add it to architecture entry configuration or exclude it from review scope; delete only after confirming no package script or CI job calls it.`,
      verify:
        'Run archora report . --format fix-plan after entry/exclude config and confirm this script is no longer a priority finding.',
      params: { entryCandidate: 'script' },
    };
  }

  return {
    action:
      'Check whether this file is dead code, dynamically loaded outside analyzer reach, or should be declared as an entry point.',
    verify:
      'Re-scan after deletion, ignore, or entry-point configuration and confirm the candidate is gone.',
    params: {},
  };
}

/**
 * Matches modules that should go through architecture review.
 * Excludes fixture directories and test files — same predicate as buildFixPlan.
 */
export function isReviewModule(id: ModuleId): boolean {
  return !/(^|\/)(fixtures|test\/fixtures|__fixtures__|__tests__|__mocks__)(\/|$)|\.(test|spec)\./u.test(
    id,
  );
}

/**
 * Heuristic: a file directly under a `scripts/` directory with a JS extension
 * is likely a standalone Node script, not a dead module.
 */
export function isScriptEntryCandidate(id: ModuleId): boolean {
  const normalized = id.replace(/\\/gu, '/');
  let scriptsIndex = 0;
  if (!normalized.startsWith('scripts/')) {
    const nestedIndex = normalized.indexOf('/scripts/');
    if (nestedIndex < 0) return false;
    scriptsIndex = nestedIndex + 1;
  }
  const file = normalized.slice(scriptsIndex + 'scripts/'.length);
  if (!file) return false;
  return file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs');
}
