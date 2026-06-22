import { describe, expect, it } from 'vitest';
import { buildFixPlan } from '../buildFixPlan';
import type { ScanResult } from '../../analyzer/types';

describe('buildFixPlan generated policy', () => {
  it('flags findings whose every target is generated and downweights them below user-code findings', () => {
    const plan = buildFixPlan(scanFixture(), { exportedAt: '2026-05-12T00:00:00.000Z' });

    expect(plan.summary.generatedModules).toBe(2);
    expect(plan.evidence.generatedModules).toEqual([
      'src/recruit/openapi/api.ts',
      'src/recruit/openapi/client.ts',
    ]);

    // Generated-only cycle must not be first - the mixed (user-touching) cycle
    // and the user-code layer violation outrank it.
    const ids = plan.priorityFindings.map((f) => f.id);
    expect(ids.indexOf('cycle:generated-only')).toBeGreaterThan(ids.indexOf('cycle:mixed'));
    expect(ids.indexOf('cycle:generated-only')).toBeGreaterThan(ids.indexOf('shared->app'));

    const generatedFinding = plan.priorityFindings.find((f) => f.id === 'cycle:generated-only');
    expect(generatedFinding?.generated).toBe(true);
    // 100 (direct cycle) * 0.1 = 10
    expect(generatedFinding?.weight).toBeCloseTo(10, 5);

    const mixedFinding = plan.priorityFindings.find((f) => f.id === 'cycle:mixed');
    expect(mixedFinding?.generated).toBeUndefined();
  });

  it('adds deterministic repair findings beyond type-only imports', () => {
    const plan = buildFixPlan(
      {
        ...scanFixture(),
        modules: [
          mod('src/app/main.ts', false, 'entry'),
          mod('src/components/index.ts', false, 'module'),
          mod('src/components/Button.ts', false, 'component'),
          mod('src/legacy/dead.ts', false, 'module'),
        ],
        cycles: [
          {
            id: 'cycle:barrel',
            modules: ['src/components/index.ts', 'src/components/Button.ts'],
            length: 2,
            severity: 'direct',
          },
        ],
        edges: [
          edge('src/components/index.ts', 'src/components/Button.ts', './Button'),
          edge('src/components/Button.ts', 'src/components/index.ts', '.'),
        ],
        layerViolations: [
          {
            edgeId: 'components->app',
            from: 'src/components/index.ts',
            to: 'src/app/main.ts',
            fromLayer: 'components',
            toLayer: 'app',
            severity: 'error',
          },
        ],
        metrics: {
          'src/legacy/dead.ts': {
            fanIn: 0,
            fanOut: 0,
            instability: 0,
            depth: 0,
            inCycle: false,
            couplingScore: 0,
            hotnessScore: 0,
          },
          'src/components/index.ts': {
            fanIn: 12,
            fanOut: 3,
            instability: 0.2,
            depth: 2,
            inCycle: true,
            couplingScore: 6,
            hotnessScore: 9,
          },
        },
        hotZones: ['src/components/index.ts'],
        contractViolations: [
          {
            id: 'contract:public-api',
            kind: 'api-stability',
            ruleName: 'Public API boundary',
            severity: 'error',
            message: 'src/components/Button.ts exposes unstable implementation surface.',
            modules: ['src/components/Button.ts'],
          },
        ],
      },
      { exportedAt: '2026-05-12T00:00:00.000Z' },
    );

    expect(plan.priorityFindings.map((finding) => finding.type)).toEqual(
      expect.arrayContaining(['barrel-cycle', 'move-module', 'unreachable-from-entries']),
    );
    expect(plan.repairGroups.map((group) => group.id)).toEqual(
      expect.arrayContaining(['safe-first', 'high-impact', 'review-before-change']),
    );
    expect(plan.repairGroups.find((group) => group.id === 'safe-first')?.findings).toContain(
      'src/legacy/dead.ts:unreachable',
    );
    const barrel = plan.priorityFindings.find((finding) => finding.type === 'barrel-cycle');
    expect(barrel?.action).toBe(
      'Replace imports through src/components/index.ts in src/components/Button.ts with concrete module paths, then keep src/components/index.ts as export-only.',
    );
    expect(barrel?.verify).toContain('archora check . --fail-on new-cycles:0');
    expect(barrel?.params).toMatchObject({
      cycleId: 'cycle:barrel',
      barrel: 'src/components/index.ts',
      importer: 'src/components/Button.ts',
      importSpecifier: '.',
    });
    const move = plan.priorityFindings.find((finding) => finding.type === 'move-module');
    expect(move?.action).toBe(
      'Remove the forbidden import src/components/index.ts -> src/app/main.ts. Move the dependency behind a components-facing adapter or invert the dependency through an allowed app entry.',
    );
    expect(move?.verify).toContain('archora check . --fail-on layer-violations:0');
    expect(move?.params).toMatchObject({
      from: 'src/components/index.ts',
      to: 'src/app/main.ts',
      fromLayer: 'components',
      toLayer: 'app',
    });
    const hotspot = plan.priorityFindings.find((finding) => finding.type === 'hot-zone');
    expect(hotspot?.action).toBe(
      'Freeze the public surface of src/components/index.ts first, then inspect its 12 consumers before editing internals.',
    );
    expect(hotspot?.verify).toContain('archora impact --module src/components/index.ts');
    const contract = plan.priorityFindings.find((finding) => finding.type === 'contract-violation');
    expect(contract?.action).toBe(
      'Fix Public API boundary in src/components/Button.ts: narrow the exported surface or add an explicit policy exception with owner approval.',
    );
    expect(contract?.verify).toContain('archora check . --fail-on contract-errors:0');
  });

  it('downweights generated-path findings even when the module is not tagged', () => {
    const plan = buildFixPlan(
      {
        ...scanFixture(),
        modules: [
          mod('src/features/orders/model/order.ts', false, 'model'),
          mod('src/shared/assets/demo/generated/src/api/client.ts', false, 'api'),
        ],
        metrics: {
          'src/features/orders/model/order.ts': {
            fanIn: 1,
            fanOut: 1,
            instability: 0.5,
            depth: 1,
            inCycle: false,
            couplingScore: 2,
            hotnessScore: 4,
          },
          'src/shared/assets/demo/generated/src/api/client.ts': {
            fanIn: 20,
            fanOut: 20,
            instability: 0.5,
            depth: 1,
            inCycle: false,
            couplingScore: 40,
            hotnessScore: 10,
          },
        },
        hotZones: [
          'src/shared/assets/demo/generated/src/api/client.ts',
          'src/features/orders/model/order.ts',
        ],
        cycles: [],
        layerViolations: [],
      },
      { exportedAt: '2026-05-12T00:00:00.000Z' },
    );

    const ids = plan.priorityFindings.map((finding) => finding.id);
    expect(plan.evidence.generatedModules).toContain(
      'src/shared/assets/demo/generated/src/api/client.ts',
    );
    expect(ids.indexOf('src/shared/assets/demo/generated/src/api/client.ts')).toBeGreaterThan(
      ids.indexOf('src/features/orders/model/order.ts'),
    );
    expect(
      plan.priorityFindings.find(
        (finding) => finding.id === 'src/shared/assets/demo/generated/src/api/client.ts',
      )?.generated,
    ).toBe(true);
  });

  it('treats unreachable scripts as entry configuration candidates', () => {
    const plan = buildFixPlan(
      {
        ...scanFixture(),
        modules: [
          mod('scripts/refresh-reports.mjs', false, 'module'),
          mod('packages/ui/scripts/clean-dist.mjs', false, 'module'),
        ],
        metrics: {
          'scripts/refresh-reports.mjs': {
            fanIn: 0,
            fanOut: 0,
            instability: 0,
            depth: 0,
            inCycle: false,
            couplingScore: 0,
            hotnessScore: 0,
          },
          'packages/ui/scripts/clean-dist.mjs': {
            fanIn: 0,
            fanOut: 0,
            instability: 0,
            depth: 0,
            inCycle: false,
            couplingScore: 0,
            hotnessScore: 0,
          },
        },
        cycles: [],
        layerViolations: [],
      },
      { exportedAt: '2026-05-12T00:00:00.000Z' },
    );

    const script = plan.priorityFindings.find(
      (finding) => finding.id === 'scripts/refresh-reports.mjs:unreachable',
    );
    expect(script?.action).toBe(
      'Treat scripts/refresh-reports.mjs as a script entry: add it to architecture entry configuration or exclude it from review scope; delete only after confirming no package script or CI job calls it.',
    );
    expect(script?.verify).toContain('archora report . --format fix-plan');
    expect(script?.params).toMatchObject({ entryCandidate: 'script' });
    expect(
      plan.priorityFindings.find(
        (finding) => finding.id === 'packages/ui/scripts/clean-dist.mjs:unreachable',
      )?.params,
    ).toMatchObject({ entryCandidate: 'script' });
  });

  it('adds churn context to hotspot repair actions when git history is present', () => {
    const plan = buildFixPlan(
      {
        ...scanFixture(),
        modules: [mod('src/features/orders/model/order.ts', false, 'model')],
        metrics: {
          'src/features/orders/model/order.ts': {
            fanIn: 10,
            fanOut: 2,
            instability: 0.2,
            depth: 1,
            inCycle: false,
            couplingScore: 12,
            hotnessScore: 9,
          },
        },
        churn: {
          'src/features/orders/model/order.ts': {
            moduleId: 'src/features/orders/model/order.ts',
            commits: 14,
            linesChanged: 320,
            authorCount: 3,
            lastTouchedAt: '2026-05-20T10:00:00Z',
            authors: [{ author: 'dev@example.com', commits: 8 }],
          },
        },
        hotZones: ['src/features/orders/model/order.ts'],
        cycles: [],
        layerViolations: [],
      },
      { exportedAt: '2026-05-12T00:00:00.000Z' },
    );

    const hotspot = plan.priorityFindings.find(
      (finding) => finding.id === 'src/features/orders/model/order.ts',
    );
    expect(hotspot?.action).toContain('Coordinate the change with recent owners first');
    expect(hotspot?.reason).toContain('14 commits');
    expect(hotspot?.params).toMatchObject({ commits: 14, authorCount: 3 });
  });
});

function scanFixture(): ScanResult {
  return {
    project: { id: 'demo', name: 'demo', rootPath: '/repo', detectedFramework: 'vue' },
    modules: [
      mod('src/app/main.ts', false, 'entry'),
      mod('src/shared/api.ts', false, 'api'),
      mod('src/recruit/openapi/api.ts', true, 'api'),
      mod('src/recruit/openapi/client.ts', true, 'api'),
    ],
    edges: [],
    cycles: [
      {
        id: 'cycle:generated-only',
        modules: ['src/recruit/openapi/api.ts', 'src/recruit/openapi/client.ts'],
        length: 2,
        severity: 'direct',
      },
      {
        id: 'cycle:mixed',
        modules: ['src/shared/api.ts', 'src/recruit/openapi/api.ts'],
        length: 2,
        severity: 'direct',
      },
    ],
    metrics: {},
    hotZones: [],
    layerViolations: [
      {
        edgeId: 'shared->app',
        from: 'src/shared/api.ts',
        to: 'src/app/main.ts',
        fromLayer: 'shared',
        toLayer: 'app',
        severity: 'error',
      },
    ],
    archDebt: {
      score: 50,
      grade: 'C',
      breakdown: { cycles: 20, layerViolations: 20, hotZones: 0, coupling: 10 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: '2026-05-12T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
  };
}

function mod(
  id: string,
  isGenerated = false,
  kind: ScanResult['modules'][number]['kind'] = 'module',
): ScanResult['modules'][number] {
  return {
    id,
    absPath: `/repo/${id}`,
    kind,
    language: 'ts',
    loc: 10,
    exports: [],
    isInfra: false,
    ...(isGenerated ? { isGenerated: true } : {}),
  };
}

function edge(from: string, to: string, specifier: string): ScanResult['edges'][number] {
  return {
    from,
    to,
    specifier,
    kind: 'static',
    resolved: true,
  };
}
