// Git history types.
//
// Archora reads `git log` once per scan and feeds the result into the
// analyzer as `AnalyzeOptions.gitHistory`. Everything in this file is plain
// data: no IO, no Node dependencies. The reader (`readGitHistory.ts`) and
// the parser (`parseGitLog.ts`) hydrate these shapes.

import type { ModuleId } from '../analyzer/types';

export interface GitCommit {
  /** Full SHA. */
  sha: string;
  /** Short SHA, first 7 chars by convention. Stored alongside `sha` so callers
   *  don't have to recompute. */
  shortSha: string;
  /** Author email (lowercased on read for stable grouping). */
  author: string;
  /** Author display name as written in the commit. */
  authorName: string;
  /** ISO-8601 timestamp of the author date (commit date is ignored — author
   *  date survives rebase/cherry-pick which is what we want for churn). */
  authoredAt: string;
  subject: string;
  /**
   * Files changed by this commit, normalized to repo-root-relative paths
   * with `/` separators. Renames are recorded as the new path; the old path
   * is in `renamedFrom`.
   */
  changes: GitFileChange[];
}

export interface GitFileChange {
  path: string;
  /** Renames record the previous path here. Otherwise undefined. */
  renamedFrom?: string;
  /** Lines added in this file in this commit. `null` for binary changes. */
  added: number | null;
  /** Lines removed in this file in this commit. `null` for binary. */
  removed: number | null;
}

export interface GitHistory {
  /** Range covered by this history. */
  since: string; // ISO date string
  until: string; // ISO date string
  /** Commits in reverse-chronological order. */
  commits: GitCommit[];
  /** Inclusive of merges? Reader filters merges by default; surface here so
   *  consumers know what they're looking at. */
  includesMerges: boolean;
}

/**
 * Per-module churn aggregate. Computed by `computeChurn` from `GitHistory`
 * once we know which paths map to which `ModuleId`s.
 */
export interface ChurnMetric {
  moduleId: ModuleId;
  /** Number of commits that touched this module in the window. */
  commits: number;
  /** Sum of `added + removed`, ignoring binary files. */
  linesChanged: number;
  /** Number of distinct authors. */
  authorCount: number;
  /** ISO timestamp of the most recent commit touching this module. */
  lastTouchedAt: string;
  /** Author distribution sorted by commit count desc, then alphabetic.
   *  Capped at top 5; remaining authors collapsed into a single
   *  `{ author: '__other__', commits: N }` entry when present. */
  authors: ChurnAuthor[];
}

export interface ChurnAuthor {
  author: string;
  commits: number;
}

/** Aggregate keyed by `ModuleId`. Modules with zero touches are omitted. */
export type ChurnByModule = Record<ModuleId, ChurnMetric>;

/**
 * One pair of modules that change together more often than baseline.
 * The pair is ordered (`a < b` lexically) so a coupling is unique
 * by `${a}\0${b}`.
 */
export interface TemporalCoupling {
  a: ModuleId;
  b: ModuleId;
  /** Commits that touched both `a` and `b`. */
  coOccurrences: number;
  /** `coOccurrences / commits(a)`. */
  scoreA: number;
  /** `coOccurrences / commits(b)`. */
  scoreB: number;
  /** `min(scoreA, scoreB)` — the symmetric, conservative score. */
  score: number;
  /**
   * True when there is no static import edge between `a` and `b` in either
   * direction. These are the "surprising" couplings — the actually
   * informative ones, because the static graph already exposes the rest.
   */
  hidden: boolean;
  /**
   * True when `a` and `b` live in different top-level module groups (FSD layer
   * / first path segment). A hidden + cross-boundary coupling is the strongest
   * "missing abstraction / leaky boundary" signal — and one a pure-git tool
   * (no architecture model) cannot produce.
   */
  crossBoundary: boolean;
  /**
   * Actionability score (0..1): coupling strength tempered by evidence
   * (`coOccurrences`), boosted when `hidden` and when `crossBoundary`. Primary
   * sort key.
   */
  risk: number;
}

export interface TemporalCouplingThresholds {
  /** Minimum co-occurrences required to consider a pair. Default 3. */
  minCoOccurrences?: number;
  /** Minimum `score` (symmetric) to surface. Default 0.5 — at least 50% of
   *  the rarer module's commits also touched the other. */
  minScore?: number;
  /** Hard cap on emitted pairs. Default 100. */
  maxPairs?: number;
  /**
   * Per-commit fan-out cap: commits that touch more than this many files
   * are skipped (mass renames, lockfile bumps, format-everything passes).
   * Default 50.
   */
  commitFanOutCap?: number;
}
