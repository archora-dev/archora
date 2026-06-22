// search() runs on a fully synthetic ScanResult — what matters is the ranker
// and prefix-filter logic, not the parser. The minimally valid fixture
// builder below honors the shape of the types but does not claim semantic
// completeness (no cycle/metric cross-references).

import { describe, expect, it } from 'vitest';
import type {
  ScanResult,
  ModuleNode,
  DependencyEdge,
  ModuleId,
  ModuleKind,
} from '../../analyzer/types';
import { search } from '../index';

interface ModuleSpec {
  id: ModuleId;
  kind?: ModuleKind;
  exports?: string[];
  imports?: { to?: string; specifier: string }[];
}

function buildScan(modules: ModuleSpec[]): ScanResult {
  const moduleNodes: ModuleNode[] = modules.map((m) => ({
    id: m.id,
    absPath: m.id,
    kind: m.kind ?? 'unknown',
    language: 'ts',
    loc: 1,
    exports: m.exports ?? [],
    isInfra: false,
  }));
  const edges: DependencyEdge[] = [];
  for (const m of modules) {
    for (const i of m.imports ?? []) {
      edges.push({
        from: m.id,
        to: i.to ?? '',
        kind: 'static',
        specifier: i.specifier,
        resolved: Boolean(i.to),
      });
    }
  }
  const metrics = Object.fromEntries(
    moduleNodes.map((m) => [
      m.id,
      {
        fanIn: 0,
        fanOut: 0,
        instability: 0,
        depth: 0,
        inCycle: false,
        couplingScore: 0,
        hotnessScore: 0,
      },
    ]),
  );
  return {
    project: {
      id: 'p',
      name: 'p',
      rootPath: '/p',
      detectedFramework: 'unknown',
    },
    modules: moduleNodes,
    edges,
    cycles: [],
    metrics,
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: new Date().toISOString(),
    durationMs: 0,
    warnings: [],
  };
}

const FIXTURE = buildScan([
  { id: 'src/features/auth/composables/useAuth.ts', kind: 'composable', exports: ['useAuth'] },
  { id: 'src/features/auth/AuthForm.vue', kind: 'component', exports: ['default'] },
  {
    id: 'src/features/checkout/CheckoutForm.vue',
    kind: 'component',
    exports: ['default'],
    imports: [{ specifier: 'react-query' }, { specifier: '@/features/auth' }],
  },
  { id: 'src/shared/lib/api.ts', kind: 'util', exports: ['api', 'apiClient'] },
  { id: 'src/stores/userStore.ts', kind: 'store', exports: ['useUserStore'] },
]);

describe('search', () => {
  it('empty query → empty output', () => {
    expect(search(FIXTURE, '')).toEqual([]);
    expect(search(FIXTURE, '   ')).toEqual([]);
  });

  it('export:useAuth finds the composable', () => {
    const r = search(FIXTURE, 'export:useAuth');
    expect(r.map((x) => x.id)).toEqual(['src/features/auth/composables/useAuth.ts']);
    expect(r[0]!.matched).toContain('export');
    expect(r[0]!.highlights.export).toContain('useAuth');
  });

  it('import:react-query finds modules with that specifier', () => {
    const r = search(FIXTURE, 'import:react-query');
    expect(r.map((x) => x.id)).toEqual(['src/features/checkout/CheckoutForm.vue']);
    expect(r[0]!.matched).toContain('import');
  });

  it('kind:store filters by kind', () => {
    const r = search(FIXTURE, 'kind:store');
    expect(r.map((x) => x.id)).toEqual(['src/stores/userStore.ts']);
  });

  it('path:features matches a substring in path (case-insensitive)', () => {
    const r = search(FIXTURE, 'path:Features');
    const ids = r.map((x) => x.id);
    expect(ids).toContain('src/features/auth/composables/useAuth.ts');
    expect(ids).toContain('src/features/checkout/CheckoutForm.vue');
    expect(ids).not.toContain('src/shared/lib/api.ts');
  });

  it('AND intersection: kind:component path:auth', () => {
    const r = search(FIXTURE, 'kind:component path:auth');
    expect(r.map((x) => x.id)).toEqual(['src/features/auth/AuthForm.vue']);
  });

  it('OR within a key: kind:component kind:composable', () => {
    const r = search(FIXTURE, 'kind:component kind:composable');
    const ids = new Set(r.map((x) => x.id));
    expect(ids.has('src/features/auth/AuthForm.vue')).toBe(true);
    expect(ids.has('src/features/auth/composables/useAuth.ts')).toBe(true);
    expect(ids.has('src/stores/userStore.ts')).toBe(false);
  });

  it('free-text without a prefix: ranker finds matches by path and exports', () => {
    const r = search(FIXTURE, 'useAuth');
    // useAuth.ts must be at the top (exact exports match + basename)
    expect(r[0]!.id).toBe('src/features/auth/composables/useAuth.ts');
    expect(r[0]!.score).toBeGreaterThan(0.5);
  });

  it('exact basename match ranks above a substring match', () => {
    const r = search(FIXTURE, 'useAuth');
    // useAuth.ts — basename match; AuthForm.vue — path substring only
    expect(r[0]!.id).toBe('src/features/auth/composables/useAuth.ts');
    const formIdx = r.findIndex((x) => x.id === 'src/features/auth/AuthForm.vue');
    if (formIdx > -1) expect(formIdx).toBeGreaterThan(0);
  });

  it('limit caps the output', () => {
    const r = search(FIXTURE, 'path:src', { limit: 2 });
    expect(r).toHaveLength(2);
  });

  it('unknown kind does not throw, just finds nothing', () => {
    expect(search(FIXTURE, 'kind:nonsense')).toEqual([]);
  });

  it('SearchResult.matched may contain several criteria at once', () => {
    // useAuth: matches by export (via export:) and by path (via free-text)
    const r = search(FIXTURE, 'export:useAuth auth');
    expect(r[0]!.matched).toEqual(expect.arrayContaining(['export', 'path']));
  });
});
