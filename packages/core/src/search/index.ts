// Global search over `ScanResult` — no filesystem reads, only structured
// metadata (modules + edges). Strategy:
//
// 1. Parse the query (`parseQuery`).
// 2. For each prefix collect sets of candidate IDs; only modules that pass
//    the intersection of all prefixes (AND) make it into the final set.
// 3. On top of the filtered modules apply free-text ranking (substring match
//    over path and exports) and sort by the resulting score.
// 4. Return results tagged with the match kind — the UI renders pill chips
//    "Path / Export / Import / Kind", so each SearchResult must know why it
//    ended up in the output.
//
// We do not: ripgrep over file contents, fuzzy substring (fzf-style scoring) —
// for path → modules.length is usually in the hundreds, plain substring is
// enough. We'll add complexity if a "too noisy" signal shows up.

import type { ScanResult, ModuleId, ModuleKind } from '../analyzer/types';
import { parseQuery, isEmpty, type ParsedQuery, type SearchPrefix } from './parseQuery';

export type { SearchPrefix, ParsedQuery } from './parseQuery';

export type MatchKind = 'path' | 'export' | 'import' | 'kind';

export interface SearchResult {
  /** Module id (relative path). */
  id: ModuleId;
  /** Which criteria matched — the UI uses this to highlight chips. */
  matched: MatchKind[];
  /** Score 0..1; 1 = perfect match, 0 = only the prefix filter passed. */
  score: number;
  /**
   * Highlight hint for each matched criterion — the concrete values
   * (export name, import specifier, kind). Used by the results panel to
   * explain "why this module surfaced for this query".
   */
  highlights: Partial<Record<MatchKind, string[]>>;
}

export interface SearchOptions {
  /** Cap the output size. Defaults to 50 — a typical UI overlay. */
  limit?: number;
}

const DEFAULT_LIMIT = 50;

export function search(
  scan: ScanResult,
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  const parsed = parseQuery(query);
  if (isEmpty(parsed)) return [];

  const limit = options.limit ?? DEFAULT_LIMIT;
  const moduleIds = new Set(scan.modules.map((m) => m.id));

  // 1. Prefix filters yield `Map<id, MatchKind[]> + highlights` — if a prefix
  // is present, a module can only reach the output by passing it.
  const prefixHits = collectPrefixHits(scan, parsed);

  // If there are prefixes — keep only modules that hit all of the given ones.
  const eligibleIds = applyPrefixIntersection(moduleIds, prefixHits, parsed.prefixes);

  // 2. Free-text ranking. If free is empty and prefixes exist — return eligible
  // as is with score 0.5 (neutral). If free is present — compute the score and
  // drop modules where no free token matched WHEN there are no prefixes;
  // otherwise free lowers the score but does not cut a module out.
  const results: SearchResult[] = [];
  for (const id of eligibleIds) {
    const module = scan.modules.find((m) => m.id === id);
    if (!module) continue;
    const matched: MatchKind[] = [];
    const highlights: Partial<Record<MatchKind, string[]>> = {};

    // collect confirmations from prefix hits
    for (const kind of ['path', 'export', 'import', 'kind'] as const) {
      const hit = prefixHits[kind].get(id);
      if (hit) {
        matched.push(kind);
        highlights[kind] = hit;
      }
    }

    let freeScore = 0;
    if (parsed.free.length > 0) {
      const f = scoreFreeText(module.id, module.exports, parsed.free);
      freeScore = f.score;
      if (f.score > 0) {
        if (f.matchedPath && !matched.includes('path')) {
          matched.push('path');
          (highlights.path ??= []).push(...f.matchedPathTerms);
        }
        if (f.matchedExports.length > 0 && !matched.includes('export')) {
          matched.push('export');
          (highlights.export ??= []).push(...f.matchedExports);
        }
      } else if (matched.length === 0) {
        // Neither a prefix match nor a free match: the module is out entirely.
        continue;
      }
    }

    const score = parsed.free.length === 0 ? 0.5 : freeScore || 0.5;
    results.push({ id, matched, score, highlights });
  }

  // 3. Sort: higher score → first; tiebreak by shorter path → first
  // (short paths usually sit closer to a feature root than deep implementations).
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.length - b.id.length;
  });

  return results.slice(0, limit);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

interface PrefixHits {
  path: Map<ModuleId, string[]>;
  export: Map<ModuleId, string[]>;
  import: Map<ModuleId, string[]>;
  kind: Map<ModuleId, string[]>;
}

function collectPrefixHits(scan: ScanResult, q: ParsedQuery): PrefixHits {
  const out: PrefixHits = {
    path: new Map(),
    export: new Map(),
    import: new Map(),
    kind: new Map(),
  };

  if (q.prefixes.path) {
    const needles = q.prefixes.path.map((s) => s.toLowerCase());
    for (const m of scan.modules) {
      const id = m.id.toLowerCase();
      const matched = needles.filter((n) => id.includes(n));
      if (matched.length > 0) out.path.set(m.id, matched);
    }
  }

  if (q.prefixes.export) {
    const needles = q.prefixes.export;
    for (const m of scan.modules) {
      const matched: string[] = [];
      for (const e of m.exports) {
        for (const n of needles) {
          if (e === n || e.includes(n)) {
            matched.push(e);
            break;
          }
        }
      }
      if (matched.length > 0) out.export.set(m.id, matched);
    }
  }

  if (q.prefixes.import) {
    // edges.specifier — the original import string; non-resolved are counted too
    const needles = q.prefixes.import;
    const matchedSpecifiersByModule = new Map<ModuleId, Set<string>>();
    for (const e of scan.edges) {
      for (const n of needles) {
        const spec = e.specifier;
        if (spec === n || spec.includes(n)) {
          let s = matchedSpecifiersByModule.get(e.from);
          if (!s) {
            s = new Set();
            matchedSpecifiersByModule.set(e.from, s);
          }
          s.add(spec);
          break;
        }
      }
    }
    for (const [id, set] of matchedSpecifiersByModule) {
      out.import.set(id, [...set]);
    }
  }

  if (q.prefixes.kind) {
    const needles = new Set(q.prefixes.kind.map((s) => s.toLowerCase() as ModuleKind));
    for (const m of scan.modules) {
      if (needles.has(m.kind)) out.kind.set(m.id, [m.kind]);
    }
  }

  return out;
}

function applyPrefixIntersection(
  all: Set<ModuleId>,
  hits: PrefixHits,
  prefixes: ParsedQuery['prefixes'],
): Set<ModuleId> {
  let result = all;
  for (const key of ['path', 'export', 'import', 'kind'] as const) {
    if (!prefixes[key as SearchPrefix]) continue;
    const subset = hits[key];
    const next = new Set<ModuleId>();
    for (const id of result) if (subset.has(id)) next.add(id);
    result = next;
  }
  return result;
}

interface FreeTextMatch {
  score: number;
  matchedPath: boolean;
  matchedPathTerms: string[];
  matchedExports: string[];
}

/**
 * Plain substring ranker. Not fuzzy: for the typical "find useAuth" task a
 * substring gives stable results without noisy matches.
 *
 * Scoring:
 * - Exact match exports[i] === term: +0.5
 * - exports[i] contains term: +0.25
 * - basename(path) === term: +0.4
 * - path contains term: +0.2 (but counted once in the score — so that three
 *   matches don't push the score > 1)
 * Then normalize to 0..1 by the number of terms.
 */
function scoreFreeText(id: ModuleId, exports: readonly string[], terms: string[]): FreeTextMatch {
  let score = 0;
  let matchedPath = false;
  const matchedPathTerms: string[] = [];
  const matchedExports = new Set<string>();
  const idLower = id.toLowerCase();
  const baseName = basenameLower(id);

  for (const rawTerm of terms) {
    const term = rawTerm.toLowerCase();
    let bestForTerm = 0;

    for (const e of exports) {
      const eLower = e.toLowerCase();
      if (eLower === term) {
        bestForTerm = Math.max(bestForTerm, 0.5);
        matchedExports.add(e);
      } else if (eLower.includes(term)) {
        bestForTerm = Math.max(bestForTerm, 0.25);
        matchedExports.add(e);
      }
    }

    if (baseName === term) {
      bestForTerm = Math.max(bestForTerm, 0.4);
      matchedPath = true;
      matchedPathTerms.push(rawTerm);
    } else if (idLower.includes(term)) {
      bestForTerm = Math.max(bestForTerm, 0.2);
      matchedPath = true;
      matchedPathTerms.push(rawTerm);
    }

    score += bestForTerm;
  }

  // Normalize: max 0.5 per term — top score 1.0 with N terms.
  const normalized = terms.length > 0 ? Math.min(1, score / (terms.length * 0.5)) : 0;
  return {
    score: normalized,
    matchedPath,
    matchedPathTerms: [...new Set(matchedPathTerms)],
    matchedExports: [...matchedExports],
  };
}

function basenameLower(p: string): string {
  const i = p.lastIndexOf('/');
  const base = i === -1 ? p : p.slice(i + 1);
  // strip extension for path-equality match
  const dot = base.lastIndexOf('.');
  return (dot === -1 ? base : base.slice(0, dot)).toLowerCase();
}

export { parseQuery, isEmpty } from './parseQuery';
