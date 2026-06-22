// Architectural contracts engine.
//
// Compiles user-defined boundary, budget and api-stability rules from
// `.archora.json -> contracts` into a list of `ContractViolation`s after a
// scan completes. The engine is *purely structural* - it operates on the
// already-built modules/edges/cycles/metrics tuple, no I/O, no parsing.
//
// Glob matching reuses the `ignore` package (same dialect as `layerOverrides`
// and `discover.extraIgnoreGlobs`), so users get a single mental model for
// every globbed field in our config.

import ignore, { type Ignore } from 'ignore';

import type { BoundaryRule, BudgetRule, ContractsConfig } from '../config/frontScopeConfig';
import type { Cycle, DependencyEdge, ModuleId, ModuleMetrics, ModuleNode } from './types';

export interface ContractViolation {
  /** Stable id for grouping/diffing. Format: `<rule-kind>:<rule-name>:<idx>`. */
  id: string;
  /** Which kind of contract was violated. `api-stability` is only a stub now. */
  kind: 'boundary' | 'budget' | 'api-stability' | 'rsc-leak';
  ruleName: string;
  severity: 'error' | 'warning';
  /** Human-readable headline (CLI/UI use this verbatim). */
  message: string;
  /** Free-form `description` echoed from the rule, if present. */
  description?: string;
  /**
   * Module(s) that triggered the violation. For boundary rules these are the
   * `from` and `to` of the offending edge; for budget rules - the offending
   * module(s).
   */
  modules: ModuleId[];
  /** Set for boundary violations: identity of the offending edge. */
  edge?: { from: ModuleId; to: ModuleId; specifier: string };
  /** Numeric details for budget violations (`metric=value vs limit`). */
  detail?: {
    metric: 'fanIn' | 'fanOut' | 'loc' | 'cycles';
    value: number;
    limit: number;
  };
}

export interface CheckContractsInput {
  modules: ModuleNode[];
  edges: DependencyEdge[];
  metrics: Record<ModuleId, ModuleMetrics>;
  cycles: Cycle[];
  contracts?: ContractsConfig;
}

/**
 * Run every configured contract rule against a finished scan. Returns an
 * empty array when no contracts are configured.
 */
export function checkContracts(input: CheckContractsInput): ContractViolation[] {
  const cfg = input.contracts;
  if (!cfg) return [];
  const out: ContractViolation[] = [];

  if (cfg.boundaries) {
    for (const rule of cfg.boundaries) out.push(...evalBoundary(rule, input));
  }
  if (cfg.budgets) {
    for (const rule of cfg.budgets) out.push(...evalBudget(rule, input));
  }
  // api-stability: schema only, full diff lives in 6.4. We surface a single
  // informational violation per rule so users see the policy is recognized.
  // Skipped here to avoid noise - revisit when 6.4 lands.

  return out;
}

// --- Boundary ----------------------------------------------------------------

function evalBoundary(rule: BoundaryRule, input: CheckContractsInput): ContractViolation[] {
  const fromMatcher = makeMatcher(rule.from);
  const toMatcher = makeMatcher(rule.to);
  const exceptMatcher = rule.except && rule.except.length > 0 ? makeMatcher(rule.except) : null;
  if (!fromMatcher || !toMatcher) return [];
  const severity = rule.severity ?? 'error';
  // crossInstance: extract the segment matched by the first `*` (single-star)
  // wildcard in each pattern. Edges where these segments are equal are
  // considered same-instance (e.g. both modules under `features/auth/...`)
  // and skipped. We only support the symmetric case (same wildcard depth in
  // `from` and `to`) - asymmetric users can construct patterns explicitly.
  const crossDepth = rule.crossInstance ? wildcardDepth(rule.from, rule.to) : -1;
  const out: ContractViolation[] = [];
  let idx = 0;

  for (const e of input.edges) {
    if (!e.resolved) continue;
    // type-only imports don't carry runtime semantics; treating them as
    // boundary violations would force users to either suppress with `except`
    // or thread `import type` everywhere. We exclude them - mirrors how the
    // built-in layer-violation check treats them.
    if (e.kind === 'type-only') continue;
    if (e.from === e.to) continue; // self-imports already produce a warning
    if (!fromMatcher.ignores(e.from)) continue;

    if (crossDepth >= 0 && segmentAt(e.from, crossDepth) === segmentAt(e.to, crossDepth)) {
      continue;
    }

    const targetMatches = toMatcher.ignores(e.to);
    const isException = exceptMatcher ? exceptMatcher.ignores(e.to) : false;

    let trips = false;
    if (rule.mode === 'must-not') {
      // Forbidden edge: target matches AND is not in the whitelist.
      trips = targetMatches && !isException;
    } else {
      // can-only: any edge from a `from`-module that DOESN'T land on `to` (or
      // an exception) is forbidden. Edges that stay within `from`'s own glob
      // are allowed - keeps internal refactors free.
      const insideFromGlob = fromMatcher.ignores(e.to);
      trips = !targetMatches && !isException && !insideFromGlob;
    }
    if (!trips) continue;

    out.push({
      id: `boundary:${rule.name}:${idx++}`,
      kind: 'boundary',
      ruleName: rule.name,
      severity,
      message:
        rule.mode === 'must-not'
          ? `${shortId(e.from)} must not import ${shortId(e.to)} (rule "${rule.name}")`
          : `${shortId(e.from)} can only import ${describeTo(rule)}, but imports ${shortId(e.to)} (rule "${rule.name}")`,
      ...(rule.description ? { description: rule.description } : {}),
      modules: [e.from, e.to],
      edge: { from: e.from, to: e.to, specifier: e.specifier },
    });
  }
  return out;
}

function describeTo(rule: BoundaryRule): string {
  return rule.except && rule.except.length > 0
    ? `${rule.to} (except ${rule.except.length} whitelisted)`
    : rule.to;
}

// --- Budget ------------------------------------------------------------------

function evalBudget(rule: BudgetRule, input: CheckContractsInput): ContractViolation[] {
  const matcher = makeMatcher(rule.module);
  if (!matcher) return [];
  const severity = rule.severity ?? 'error';
  const out: ContractViolation[] = [];
  let idx = 0;

  for (const m of input.modules) {
    if (!matcher.ignores(m.id)) continue;
    const mt = input.metrics[m.id];
    if (mt === undefined) continue;
    if (rule.maxFanIn !== undefined && mt.fanIn > rule.maxFanIn) {
      out.push(budget(rule, severity, idx++, m.id, 'fanIn', mt.fanIn, rule.maxFanIn));
    }
    if (rule.maxFanOut !== undefined && mt.fanOut > rule.maxFanOut) {
      out.push(budget(rule, severity, idx++, m.id, 'fanOut', mt.fanOut, rule.maxFanOut));
    }
    if (rule.maxLoc !== undefined && m.loc > rule.maxLoc) {
      out.push(budget(rule, severity, idx++, m.id, 'loc', m.loc, rule.maxLoc));
    }
  }

  // Cycles: aggregate. A single budget breach is "this glob owns >N cycles
  // (any cycle that touches at least one module under the glob)". We emit a
  // single violation pointing at the offending modules.
  if (rule.maxCycles !== undefined) {
    const matched = input.cycles.filter((c) => c.modules.some((id) => matcher.ignores(id)));
    if (matched.length > rule.maxCycles) {
      const touched = unique(matched.flatMap((c) => c.modules.filter((id) => matcher.ignores(id))));
      out.push({
        id: `budget:${rule.name}:${idx++}`,
        kind: 'budget',
        ruleName: rule.name,
        severity,
        message: `${matched.length} cycle(s) touching "${rule.module}" exceed limit of ${rule.maxCycles} (rule "${rule.name}")`,
        ...(rule.description ? { description: rule.description } : {}),
        modules: touched,
        detail: { metric: 'cycles', value: matched.length, limit: rule.maxCycles },
      });
    }
  }
  return out;
}

function budget(
  rule: BudgetRule,
  severity: 'error' | 'warning',
  idx: number,
  moduleId: ModuleId,
  metric: 'fanIn' | 'fanOut' | 'loc',
  value: number,
  limit: number,
): ContractViolation {
  return {
    id: `budget:${rule.name}:${idx}`,
    kind: 'budget',
    ruleName: rule.name,
    severity,
    message: `${shortId(moduleId)} ${metric}=${value} exceeds budget ${limit} (rule "${rule.name}")`,
    ...(rule.description ? { description: rule.description } : {}),
    modules: [moduleId],
    detail: { metric, value, limit },
  };
}

// --- Helpers -----------------------------------------------------------------

/**
 * Find the path-segment depth of the first single-star (`*`, not `**`)
 * wildcard, only when both patterns share the same depth. Returns -1 when
 * patterns differ structurally - the caller falls back to plain matching.
 */
function wildcardDepth(fromPattern: string, toPattern: string): number {
  const fa = singleStarDepth(fromPattern);
  const fb = singleStarDepth(toPattern);
  if (fa === -1 || fb === -1) return -1;
  return fa === fb ? fa : -1;
}

function singleStarDepth(pattern: string): number {
  const segs = pattern.split('/');
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === '*') return i;
  }
  return -1;
}

function segmentAt(id: string, depth: number): string | undefined {
  return id.split('/')[depth];
}

function makeMatcher(pattern: string | string[]): Ignore | null {
  try {
    const ig = ignore();
    ig.add(pattern);
    return ig;
  } catch {
    return null;
  }
}

function shortId(moduleId: ModuleId): string {
  // Match the displayShortId style without pulling its full implementation
  // (which depends on the existing module list). The full path stays in
  // `modules[]` for consumers that need it.
  const segs = moduleId.split('/');
  if (segs.length <= 3) return moduleId;
  return `…/${segs.slice(-3).join('/')}`;
}

function unique<T>(arr: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}
