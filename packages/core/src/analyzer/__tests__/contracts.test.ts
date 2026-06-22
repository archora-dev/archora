// Architectural contracts engine - unit tests at the engine boundary
// (input: pre-built modules/edges/cycles/metrics, output: violations) plus
// one integration test that drives the engine through the full `analyze()`
// pipeline using `.archora.json` to make sure config plumbing works.

import { describe, expect, it } from 'vitest';

import { analyze } from '../index';
import { checkContracts } from '../contracts';
import { createInMemoryFileSource } from '../sources/inMemoryFileSource';
import type { Cycle, DependencyEdge, ModuleId, ModuleMetrics, ModuleNode } from '../types';

// --- Test helpers ----------------------------------------------------------

function mod(id: ModuleId, overrides: Partial<ModuleNode> = {}): ModuleNode {
  return {
    id,
    absPath: id,
    kind: 'unknown',
    language: 'ts',
    loc: 50,
    exports: [],
    isInfra: false,
    ...overrides,
  };
}

function edge(
  from: ModuleId,
  to: ModuleId,
  kind: DependencyEdge['kind'] = 'static',
): DependencyEdge {
  return { from, to, kind, specifier: to, resolved: true };
}

function metrics(
  values: Partial<Record<ModuleId, Partial<ModuleMetrics>>>,
): Record<ModuleId, ModuleMetrics> {
  const out: Record<ModuleId, ModuleMetrics> = {};
  for (const [id, m] of Object.entries(values)) {
    out[id] = {
      fanIn: 0,
      fanOut: 0,
      instability: 0,
      depth: 0,
      inCycle: false,
      couplingScore: 0,
      hotnessScore: 0,
      ...m,
    };
  }
  return out;
}

// --- Boundary rules --------------------------------------------------------

describe('boundary: must-not', () => {
  const modules = [
    mod('features/auth/api.ts'),
    mod('features/billing/api.ts'),
    mod('features/shared/types.ts'),
    mod('shared/ui/button.ts'),
  ];
  const edges = [
    edge('features/auth/api.ts', 'features/billing/api.ts'), // violation
    edge('features/auth/api.ts', 'features/shared/types.ts'), // exempted
    edge('features/auth/api.ts', 'shared/ui/button.ts'), // ok
  ];

  it('flags forbidden cross-feature import', () => {
    const v = checkContracts({
      modules,
      edges,
      metrics: {},
      cycles: [],
      contracts: {
        boundaries: [
          {
            name: 'features-isolation',
            from: 'features/*/**',
            to: 'features/*/**',
            mode: 'must-not',
            except: ['features/shared/**'],
          },
        ],
      },
    });
    expect(v.length).toBe(1);
    expect(v[0]?.kind).toBe('boundary');
    expect(v[0]?.edge).toEqual({
      from: 'features/auth/api.ts',
      to: 'features/billing/api.ts',
      specifier: 'features/billing/api.ts',
    });
  });

  it('except whitelist actually exempts matched edges', () => {
    const v = checkContracts({
      modules,
      edges: [edge('features/auth/api.ts', 'features/shared/types.ts')],
      metrics: {},
      cycles: [],
      contracts: {
        boundaries: [
          {
            name: 'features-isolation',
            from: 'features/*/**',
            to: 'features/*/**',
            mode: 'must-not',
            except: ['features/shared/**'],
          },
        ],
      },
    });
    expect(v).toEqual([]);
  });

  it('ignores type-only edges (mirrors layer-violation behaviour)', () => {
    const v = checkContracts({
      modules,
      edges: [edge('features/auth/api.ts', 'features/billing/api.ts', 'type-only')],
      metrics: {},
      cycles: [],
      contracts: {
        boundaries: [
          {
            name: 'features-isolation',
            from: 'features/*/**',
            to: 'features/*/**',
            mode: 'must-not',
          },
        ],
      },
    });
    expect(v).toEqual([]);
  });

  it('crossInstance: skips same-feature internal edges, flags cross-feature', () => {
    const v = checkContracts({
      modules: [
        mod('features/auth/index.ts'),
        mod('features/auth/lib/jwt.ts'),
        mod('features/billing/index.ts'),
      ],
      edges: [
        edge('features/auth/index.ts', 'features/auth/lib/jwt.ts'), // same-feature, OK
        edge('features/auth/index.ts', 'features/billing/index.ts'), // cross-feature, violation
      ],
      metrics: {},
      cycles: [],
      contracts: {
        boundaries: [
          {
            name: 'features-isolation',
            from: 'features/*/**',
            to: 'features/*/**',
            mode: 'must-not',
            crossInstance: true,
          },
        ],
      },
    });
    expect(v.length).toBe(1);
    expect(v[0]?.edge?.to).toBe('features/billing/index.ts');
  });

  it('respects severity from the rule (default error)', () => {
    const v = checkContracts({
      modules,
      edges,
      metrics: {},
      cycles: [],
      contracts: {
        boundaries: [
          {
            name: 'soft-rule',
            from: 'features/*/**',
            to: 'features/*/**',
            mode: 'must-not',
            severity: 'warning',
          },
        ],
      },
    });
    expect(v[0]?.severity).toBe('warning');
  });
});

describe('boundary: can-only', () => {
  const modules = [
    mod('src/router/routes.ts'),
    mod('src/pages/home.ts'),
    mod('src/utils/helpers.ts'),
  ];

  it("forbids edges that don't land on the allowed glob", () => {
    const edges = [
      edge('src/router/routes.ts', 'src/pages/home.ts'), // ok
      edge('src/router/routes.ts', 'src/utils/helpers.ts'), // violation
    ];
    const v = checkContracts({
      modules,
      edges,
      metrics: {},
      cycles: [],
      contracts: {
        boundaries: [
          {
            name: 'router-only-pages',
            from: 'src/router/**',
            to: 'src/pages/**',
            mode: 'can-only',
          },
        ],
      },
    });
    expect(v.length).toBe(1);
    expect(v[0]?.edge?.to).toBe('src/utils/helpers.ts');
  });

  it('allows internal (within-from-glob) edges without violation', () => {
    const edges = [edge('src/router/routes.ts', 'src/router/guards.ts')];
    const v = checkContracts({
      modules: [...modules, mod('src/router/guards.ts')],
      edges,
      metrics: {},
      cycles: [],
      contracts: {
        boundaries: [
          {
            name: 'router-only-pages',
            from: 'src/router/**',
            to: 'src/pages/**',
            mode: 'can-only',
          },
        ],
      },
    });
    expect(v).toEqual([]);
  });
});

// --- Budget rules ----------------------------------------------------------

describe('budget rules', () => {
  it('triggers maxFanIn when exceeded', () => {
    const v = checkContracts({
      modules: [mod('features/auth/index.ts')],
      edges: [],
      metrics: metrics({ 'features/auth/index.ts': { fanIn: 50 } }),
      cycles: [],
      contracts: {
        budgets: [{ name: 'auth-fanin', module: 'features/auth/**', maxFanIn: 30 }],
      },
    });
    expect(v.length).toBe(1);
    expect(v[0]?.detail).toEqual({ metric: 'fanIn', value: 50, limit: 30 });
  });

  it('does NOT trigger when under the limit', () => {
    const v = checkContracts({
      modules: [mod('features/auth/index.ts')],
      edges: [],
      metrics: metrics({ 'features/auth/index.ts': { fanIn: 5 } }),
      cycles: [],
      contracts: {
        budgets: [{ name: 'auth-fanin', module: 'features/auth/**', maxFanIn: 30 }],
      },
    });
    expect(v).toEqual([]);
  });

  it('triggers maxLoc on a per-module basis', () => {
    const v = checkContracts({
      modules: [mod('shared/ui/big.ts', { loc: 600 }), mod('shared/ui/small.ts', { loc: 50 })],
      edges: [],
      metrics: metrics({
        'shared/ui/big.ts': {},
        'shared/ui/small.ts': {},
      }),
      cycles: [],
      contracts: {
        budgets: [{ name: 'ui-loc', module: 'shared/ui/**', maxLoc: 300 }],
      },
    });
    expect(v.length).toBe(1);
    expect(v[0]?.modules).toEqual(['shared/ui/big.ts']);
  });

  it('triggers maxCycles when ≥ N+1 cycles touch the glob', () => {
    const cycles: Cycle[] = [
      { id: 'c1', modules: ['shared/ui/a.ts', 'shared/ui/b.ts'], length: 2, severity: 'direct' },
    ];
    const v = checkContracts({
      modules: [mod('shared/ui/a.ts'), mod('shared/ui/b.ts')],
      edges: [],
      metrics: {},
      cycles,
      contracts: {
        budgets: [{ name: 'ui-no-cycles', module: 'shared/ui/**', maxCycles: 0 }],
      },
    });
    expect(v.length).toBe(1);
    expect(v[0]?.detail?.metric).toBe('cycles');
    expect(v[0]?.detail?.value).toBe(1);
  });

  it('rule with no numeric ceiling is silently dropped during config parse', () => {
    // We can't go through normalizeConfig here, but we *can* check that the
    // engine itself does nothing when the budget object has every threshold
    // set to undefined. The normalizer (config.test.ts) covers the parse-time
    // drop-on-empty case.
    const v = checkContracts({
      modules: [mod('features/auth/index.ts')],
      edges: [],
      metrics: metrics({ 'features/auth/index.ts': { fanIn: 100 } }),
      cycles: [],
      contracts: {
        budgets: [{ name: 'no-op', module: 'features/auth/**' }],
      },
    });
    expect(v).toEqual([]);
  });
});

// --- Integration via analyze() --------------------------------------------

describe('integration: analyze() honours .archora.json contracts', () => {
  it('full pipeline emits contract-violation recommendations', async () => {
    const config = {
      contracts: {
        boundaries: [
          {
            name: 'features-isolation',
            from: 'features/*/**',
            to: 'features/*/**',
            mode: 'must-not',
            except: ['features/shared/**'],
          },
        ],
        budgets: [{ name: 'auth-loc', module: 'features/auth/**', maxLoc: 5 }],
      },
    };
    const source = createInMemoryFileSource('/proj', {
      'tsconfig.json': '{}',
      '.archora.json': JSON.stringify(config),
      'features/auth/index.ts': "import { x } from '../billing/index';\nexport const a = x;\n",
      'features/billing/index.ts': 'export const x = 1;\n',
      'features/shared/util.ts': 'export const u = 0;\n',
    });
    const scan = await analyze(source);

    expect(scan.contractViolations.length).toBeGreaterThanOrEqual(1);
    const boundary = scan.contractViolations.find((v) => v.kind === 'boundary');
    expect(boundary).toBeDefined();
    expect(boundary?.ruleName).toBe('features-isolation');

    const recs = scan.recommendations.filter((r) => r.kind === 'contract-violation');
    expect(recs.length).toBeGreaterThanOrEqual(1);
    expect(recs[0]?.params['rule']).toBe('features-isolation');
  });

  it('no contracts block → empty contractViolations', async () => {
    const source = createInMemoryFileSource('/proj', {
      'tsconfig.json': '{}',
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': 'export const b = 1;\n',
    });
    const scan = await analyze(source);
    expect(scan.contractViolations).toEqual([]);
  });
});
