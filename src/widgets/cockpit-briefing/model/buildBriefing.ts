import type {
  ArchitectureOverview,
  ArchitecturePriorityIssue,
  ArchitecturePriorityIssueKind,
} from '@/entities/architecture';
import type { FindingType } from '@/entities/finding';

export type BriefingGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** A localization-agnostic line: the UI renders it via t(i18nKey, params). */
export interface BriefingText {
  i18nKey: string;
  params: Record<string, string | number>;
}

export interface BriefingPriority {
  id: string;
  kind: ArchitecturePriorityIssueKind;
  severity: 'error' | 'warning' | 'info';
  /** Anchor module/edge/cycle id for "open in context". */
  targetId: string;
  affectedModules: number;
  /** Plain-language "why it matters" for this issue kind. */
  why: BriefingText;
  /** Plain-language "what to do" for this issue kind. */
  fix: BriefingText;
}

export interface BriefingBaselineDelta {
  cycles: number;
  layerViolations: number;
  hotZones: number;
  /** True when no metric moved in either direction. */
  unchanged: boolean;
}

/** One contributor to the architecture-debt score, with its relative weight. */
export interface GradeDriver {
  label: string;
  value: number;
  /** Fraction of the total debt this driver accounts for, 0–1. */
  share: number;
  /** Finding type this driver maps to, so the UI can open the matching queue. */
  kind: FindingType;
  /** Concrete count behind the driver, or null when it has no direct tally. */
  count: number | null;
}

export interface CockpitBriefing {
  grade: BriefingGrade;
  /** One-line health read keyed off the grade. */
  assessment: BriefingText;
  totals: {
    findings: number;
    cycles: number;
    layerViolations: number;
    hotZones: number;
  };
  /** What pulls the grade down, ranked — empty on a clean (grade A) scan. */
  gradeDrivers: GradeDriver[];
  priorities: BriefingPriority[];
  /** Present only when a baseline overview was supplied. */
  baselineDelta: BriefingBaselineDelta | null;
}

export interface BuildBriefingInput {
  overview: ArchitectureOverview;
  baselineOverview: ArchitectureOverview | null;
  /** Architecture-debt score breakdown, used to explain the grade. */
  breakdown?: { cycles: number; layerViolations: number; hotZones: number; coupling: number };
  /** Total findings shown by the queue under the current lens/filters. */
  findingsTotal: number;
  /**
   * Drops a priority whose target is a re-export barrel — the same modules the
   * queue already excludes from hotspots — so "Start here" doesn't tell the user
   * to split their public API aggregator.
   */
  isBarrel?: (targetId: string) => boolean;
}

const PRIORITY_LIMIT = 3;
const SAME_KIND_LIMIT = 2;

/**
 * Groups priority kinds the way the queue labels them: high-fan-out, high-fan-in
 * and unstable-module all read as "Hotspot". Capping on this grouping keeps
 * "Start here" from showing three near-identical hotspots.
 */
function displayKind(kind: ArchitecturePriorityIssueKind): string {
  if (kind === 'cycle' || kind === 'layer-violation' || kind === 'orphan') return kind;
  return 'hotspot';
}

/**
 * Picks the top priorities while capping any single display kind, preserving the
 * incoming (already ranked) order. Deterministic for a given input.
 */
function selectVariedPriorities(
  issues: ArchitecturePriorityIssue[],
  limit: number,
): ArchitecturePriorityIssue[] {
  const picked: ArchitecturePriorityIssue[] = [];
  const counts = new Map<string, number>();
  for (const issue of issues) {
    if (picked.length === limit) break;
    const key = displayKind(issue.kind);
    if ((counts.get(key) ?? 0) >= SAME_KIND_LIMIT) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    picked.push(issue);
  }
  return picked;
}

/**
 * Synthesizes the cockpit landing read from a pre-computed architecture overview.
 * Does no analysis of its own — it only selects, ranks, and attaches plain-language
 * i18n keys over `buildArchitectureOverview` output.
 */
export function buildBriefing(input: BuildBriefingInput): CockpitBriefing {
  const { overview } = input;
  const grade = overview.health.grade as BriefingGrade;

  return {
    grade,
    assessment: {
      i18nKey: `cockpit.briefing.assessment.${grade}`,
      params: {
        cycles: overview.totals.cycles,
        layerViolations: overview.totals.layerViolations,
        hotZones: overview.totals.hotZones,
      },
    },
    totals: {
      findings: input.findingsTotal,
      cycles: overview.totals.cycles,
      layerViolations: overview.totals.layerViolations,
      hotZones: overview.totals.hotZones,
    },
    gradeDrivers: gradeDrivers(input.breakdown, overview.totals),
    priorities: selectVariedPriorities(
      input.isBarrel
        ? overview.priorityIssues.filter((i) => !input.isBarrel!(i.targetId))
        : overview.priorityIssues,
      PRIORITY_LIMIT,
    ).map((issue) => ({
      id: issue.id,
      kind: issue.kind,
      severity: issue.severity,
      targetId: issue.targetId,
      affectedModules: issue.affectedModules,
      why: {
        i18nKey: `cockpit.briefing.why.${issue.kind}`,
        params: { targetId: issue.targetId, affectedModules: issue.affectedModules },
      },
      fix: {
        i18nKey: `cockpit.briefing.fix.${issue.kind}`,
        params: { targetId: issue.targetId, affectedModules: issue.affectedModules },
      },
    })),
    baselineDelta: input.baselineOverview ? baselineDelta(overview, input.baselineOverview) : null,
  };
}

// Turns the debt-score breakdown into ranked, weighted drivers so the grade is
// explainable: the heaviest contributor is the highest-leverage thing to fix.
// Each driver carries the concrete count behind it (where one exists) and the
// finding type it maps to, so the UI can both quantify and open it.
function gradeDrivers(
  breakdown: BuildBriefingInput['breakdown'],
  totals: ArchitectureOverview['totals'],
): GradeDriver[] {
  if (!breakdown) return [];
  const all: GradeDriver[] = [
    { label: 'Cycles', value: breakdown.cycles, share: 0, kind: 'cycle', count: totals.cycles },
    {
      label: 'Layer violations',
      value: breakdown.layerViolations,
      share: 0,
      kind: 'layer-violation',
      count: totals.layerViolations,
    },
    {
      label: 'Hot zones',
      value: breakdown.hotZones,
      share: 0,
      kind: 'hotspot',
      count: totals.hotZones,
    },
    // Coupling is a derived score with no single tally to show.
    { label: 'Coupling', value: breakdown.coupling, share: 0, kind: 'coupling', count: null },
  ];
  const entries = all.filter((driver) => driver.value > 0);
  const total = entries.reduce((sum, driver) => sum + driver.value, 0);
  if (total === 0) return [];
  for (const driver of entries) driver.share = driver.value / total;
  return entries.sort((a, b) => b.value - a.value);
}

function baselineDelta(
  current: ArchitectureOverview,
  baseline: ArchitectureOverview,
): BriefingBaselineDelta {
  const cycles = current.totals.cycles - baseline.totals.cycles;
  const layerViolations = current.totals.layerViolations - baseline.totals.layerViolations;
  const hotZones = current.totals.hotZones - baseline.totals.hotZones;
  return {
    cycles,
    layerViolations,
    hotZones,
    unchanged: cycles === 0 && layerViolations === 0 && hotZones === 0,
  };
}
