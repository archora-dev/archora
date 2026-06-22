import { describe, expect, it } from 'vitest';
import { suggestContracts } from '../suggestContracts';
import type { Cycle, DependencyEdge, ModuleNode } from '../types';

function mod(id: string): ModuleNode {
  return { id, absPath: id, kind: 'unknown', language: 'ts', loc: 10, exports: [], isInfra: false };
}
function edge(from: string, to: string): DependencyEdge {
  return { from, to, kind: 'static', specifier: to, resolved: true };
}

describe('suggestContracts', () => {
  it('proposes features-isolation when there are >=2 sibling features', () => {
    const modules = [
      mod('src/features/auth/index.ts'),
      mod('src/features/auth/lib/x.ts'),
      mod('src/features/billing/index.ts'),
      mod('src/features/billing/lib/y.ts'),
    ];
    const result = suggestContracts({ modules, edges: [], cycles: [] });
    const rule = result.contracts.boundaries?.find((r) => r.name === 'features-isolation');
    expect(rule).toBeDefined();
    expect(rule?.crossInstance).toBe(true);
    expect(rule?.from).toBe('src/features/*/**');
    expect(rule?.to).toBe('src/features/*/**');
  });

  it('does not propose features-isolation when only one feature exists', () => {
    const modules = [mod('src/features/auth/index.ts'), mod('src/features/auth/lib/x.ts')];
    const result = suggestContracts({ modules, edges: [], cycles: [] });
    expect(
      result.contracts.boundaries?.find((r) => r.name === 'features-isolation'),
    ).toBeUndefined();
  });

  it('proposes layer-discipline rules for observed FSD violations', () => {
    const modules = [mod('src/shared/lib/u.ts'), mod('src/widgets/foo/Foo.vue')];
    const edges = [edge('src/shared/lib/u.ts', 'src/widgets/foo/Foo.vue')];
    const result = suggestContracts({ modules, edges, cycles: [] });
    const rule = result.contracts.boundaries?.find((r) => r.name === 'layer-shared-not-widgets');
    expect(rule).toBeDefined();
    expect(rule?.from).toBe('src/shared/**');
    expect(rule?.to).toBe('src/widgets/**');
    expect(rule?.mode).toBe('must-not');
  });

  it('proposes no-cycles budgets only for clean folders that exist', () => {
    const modules = [
      mod('src/shared/lib/a.ts'),
      mod('src/shared/lib/b.ts'),
      mod('src/entities/x/y.ts'),
    ];
    const cycles: Cycle[] = [
      {
        id: 'c1',
        modules: ['src/entities/x/y.ts', 'src/entities/x/z.ts'],
        length: 2,
        severity: 'direct',
      },
    ];
    const result = suggestContracts({ modules, edges: [], cycles });
    const sharedBudget = result.contracts.budgets?.find((r) => r.name === 'no-cycles-shared');
    const entitiesBudget = result.contracts.budgets?.find((r) => r.name === 'no-cycles-entities');
    expect(sharedBudget).toBeDefined();
    expect(sharedBudget?.maxCycles).toBe(0);
    // entities has cycles -> skip
    expect(entitiesBudget).toBeUndefined();
  });

  it('does not duplicate rules already present in existing config', () => {
    const modules = [mod('src/features/auth/index.ts'), mod('src/features/billing/index.ts')];
    const result = suggestContracts({
      modules,
      edges: [],
      cycles: [],
      existing: {
        boundaries: [
          {
            name: 'features-isolation',
            from: 'src/features/*/**',
            to: 'src/features/*/**',
            mode: 'must-not',
          },
        ],
      },
    });
    expect(
      result.contracts.boundaries?.find((r) => r.name === 'features-isolation'),
    ).toBeUndefined();
  });

  it('skips type-only edges when computing layer pairs', () => {
    const modules = [mod('src/shared/lib/u.ts'), mod('src/widgets/foo/Foo.vue')];
    const edges: DependencyEdge[] = [
      {
        from: 'src/shared/lib/u.ts',
        to: 'src/widgets/foo/Foo.vue',
        kind: 'type-only',
        specifier: 'x',
        resolved: true,
      },
    ];
    const result = suggestContracts({ modules, edges, cycles: [] });
    expect(
      result.contracts.boundaries?.find((r) => r.name === 'layer-shared-not-widgets'),
    ).toBeUndefined();
  });
});
