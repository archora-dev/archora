import type { Cycle, DependencyEdge, ModuleId, ModuleNode } from './types';

export function detectCycles(modules: ModuleNode[], edges: DependencyEdge[]): Cycle[] {
  const adj = buildAdjacency(modules, edges);
  const ids = modules.map((m) => m.id);

  const indices = new Map<ModuleId, number>();
  const lowlinks = new Map<ModuleId, number>();
  const onStack = new Set<ModuleId>();
  const stack: ModuleId[] = [];
  let nextIndex = 0;
  const sccs: ModuleId[][] = [];

  const strongconnect = (v: ModuleId): void => {
    indices.set(v, nextIndex);
    lowlinks.set(v, nextIndex);
    nextIndex++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v) ?? 0, lowlinks.get(w) ?? 0));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v) ?? 0, indices.get(w) ?? 0));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const component: ModuleId[] = [];
      let w: ModuleId | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      sccs.push(component);
    }
  };

  for (const id of ids) {
    if (!indices.has(id)) strongconnect(id);
  }

  const cycles: Cycle[] = [];
  for (const comp of sccs) {
    if (comp.length === 1) {
      const only = comp[0];
      if (only !== undefined && (adj.get(only) ?? []).includes(only)) {
        cycles.push({
          id: cycleId(comp),
          modules: comp,
          length: 1,
          severity: 'direct',
        });
      }
      continue;
    }
    cycles.push({
      id: cycleId(comp),
      modules: [...comp].sort(),
      length: comp.length,
      severity: comp.length === 2 ? 'direct' : 'indirect',
    });
  }
  cycles.sort((a, b) => b.length - a.length || a.id.localeCompare(b.id));
  return cycles;
}

function buildAdjacency(modules: ModuleNode[], edges: DependencyEdge[]): Map<ModuleId, ModuleId[]> {
  const adj = new Map<ModuleId, ModuleId[]>();
  for (const m of modules) adj.set(m.id, []);
  for (const e of edges) {
    if (e.kind === 'type-only') continue;
    const list = adj.get(e.from);
    if (list) list.push(e.to);
  }
  return adj;
}

// Stable, short, content-addressed cycle id derived from the sorted member
// list. The concrete modules stay on `cycle.modules` for display. The older
// `modules.join('|')` form produced 2kB+ strings on dense indirect SCCs and
// blew up fix-plan ids, baseline diffs and report headers.
function cycleId(modules: ModuleId[]): string {
  return `cycle:${fnv1a32([...modules].sort().join('\u0001'))}`;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
