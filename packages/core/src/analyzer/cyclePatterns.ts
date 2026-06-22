import type { DependencyEdge, ModuleId } from './types';
import { type EdgeKey, parseEdgeKey } from './feedbackArcSet';

/**
 * Architectural patterns detected on the feedback arc set of a SCC. The label
 * dictates the action advice shown in the UI - each pattern maps to a
 * different idiom ("use useRouter()", "import sibling directly", ...).
 *
 * Order of evaluation is fixed: barrel-cycle is checked before hub-feedback,
 * so a barrel-import that also looks like a feedback hub still gets the
 * sibling-direct advice (the more specific fix).
 */
export type CyclePattern =
  | { kind: 'mutual-pair'; a: ModuleId; b: ModuleId }
  | { kind: 'barrel-cycle'; barrel: ModuleId; sibling: ModuleId }
  | {
      kind: 'hub-feedback';
      hub: ModuleId;
      incomingCount: number;
      valueImports: number;
    }
  | { kind: 'long-chain'; length: number; bridge: EdgeKey }
  | { kind: 'mixed' };

const HUB_THRESHOLD = 0.7;
const LONG_CHAIN_MIN = 8;
const LONG_CHAIN_MAX_FEEDBACK = 2;

/**
 * Pattern-match a SCC by its FAS feedback edges.
 *
 * Inputs:
 *  - scc: module ids in the SCC
 *  - feedback: result of `feedbackArcSet`
 *  - internalEdges: SCC-internal edges (deduped); used to count value vs
 *    type-only imports per hub
 */
export function classifyCyclePattern(args: {
  scc: ModuleId[];
  internalEdges: DependencyEdge[];
  feedback: Set<EdgeKey>;
}): CyclePattern {
  const { scc, internalEdges, feedback } = args;
  const fbList = [...feedback].map(parseEdgeKey);

  // 1. mutual-pair: SCC of exactly 2 with both directed edges. The FAS will
  //    only flag one as feedback, but the architecture issue is the pair.
  if (scc.length === 2) {
    const [a, b] = [...scc].sort();
    const hasAB = internalEdges.some((e) => e.from === a && e.to === b);
    const hasBA = internalEdges.some((e) => e.from === b && e.to === a);
    if (hasAB && hasBA) return { kind: 'mutual-pair', a: a!, b: b! };
  }

  // 2. barrel-cycle: SCC contains a single `index.*` module and at least one
  //    sibling that participates in the SCC. The canonical fix is to import
  //    the sibling directly bypassing the barrel; the FAS-picked feedback
  //    direction is a tie-breaker artefact and doesn't change the diagnosis.
  if (fbList.length <= 2) {
    const barrels = scc.filter(isBarrel);
    if (barrels.length === 1) {
      const barrel = barrels[0]!;
      const dir = parentDir(barrel);
      const sibling = scc.find((m) => m !== barrel && parentDir(m) === dir);
      if (sibling) return { kind: 'barrel-cycle', barrel, sibling };
    }
  }

  // 3. hub-feedback: ≥70% of feedback edges point into the same target.
  //    Counts the number of value imports (anything not type-only) - the
  //    user advice ("use useRouter() / DI / split instance") only makes
  //    sense for value imports.
  if (fbList.length >= 2) {
    const targets = new Map<ModuleId, number>();
    for (const f of fbList) targets.set(f.to, (targets.get(f.to) ?? 0) + 1);
    let bestHub: ModuleId | null = null;
    let bestCount = 0;
    for (const [t, n] of targets) {
      if (n > bestCount) {
        bestCount = n;
        bestHub = t;
      }
    }
    if (bestHub !== null && bestCount / fbList.length >= HUB_THRESHOLD) {
      const valueImports = countValueImportsInto(bestHub, internalEdges, feedback);
      return {
        kind: 'hub-feedback',
        hub: bestHub,
        incomingCount: bestCount,
        valueImports,
      };
    }
  }

  // 4. long-chain: large SCC closed by 1-2 feedback edges. The "fix" is
  //    usually a misplaced shared type, not a re-architecture.
  if (
    scc.length > LONG_CHAIN_MIN &&
    fbList.length <= LONG_CHAIN_MAX_FEEDBACK &&
    fbList.length > 0
  ) {
    const bridge = fbList[0]!;
    return {
      kind: 'long-chain',
      length: scc.length,
      bridge: `${bridge.from}\u0001${bridge.to}`,
    };
  }

  return { kind: 'mixed' };
}

function isBarrel(id: ModuleId): boolean {
  const i = id.lastIndexOf('/');
  const base = i === -1 ? id : id.slice(i + 1);
  return /^index\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte)$/.test(base);
}

function parentDir(id: ModuleId): string {
  const i = id.lastIndexOf('/');
  return i === -1 ? '' : id.slice(0, i);
}

function countValueImportsInto(
  target: ModuleId,
  internalEdges: DependencyEdge[],
  feedback: Set<EdgeKey>,
): number {
  let n = 0;
  for (const e of internalEdges) {
    if (e.to !== target) continue;
    if (e.kind === 'type-only') continue;
    // count only feedback edges into this hub
    if (!feedback.has(`${e.from}\u0001${e.to}`)) continue;
    n++;
  }
  return n;
}
