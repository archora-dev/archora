import { describe, expect, it } from 'vitest';
import {
  buildExplainView,
  buildImpactView,
  buildLifecycleHygieneView,
  buildMatrixView,
  buildOwnershipView,
  buildReviewRiskView,
  buildSemanticSurfaceView,
  buildSignalBaselineView,
  buildTrendView,
  resolveImpactTarget,
} from '../analyzerViews';
import type { ArchitectureSignal, ScanResult } from '../../analyzer/types';

describe('analyzer view helpers', () => {
  it('builds filtered matrix cells and ranks risky relations first', () => {
    const matrix = buildMatrixView(scanFixture(), {
      groupBy: 'layer',
      onlyViolations: true,
      top: 1,
    });

    expect(matrix.cells).toEqual([
      {
        from: 'features',
        to: 'pages',
        imports: 1,
        violations: 1,
        cycleEdges: 1,
        edges: [
          {
            from: 'src/features/auth/model/session.ts',
            to: 'src/pages/login/Page.ts',
            kind: 'static',
            specifier: '@/pages/login/Page',
            violation: true,
            cycleEdge: true,
          },
        ],
      },
    ]);
    expect(matrix.summary).toMatchObject({
      modules: 2,
      imports: 2,
      groups: 2,
      cells: 1,
      violations: 1,
      cycleEdges: 1,
    });
  });

  it('groups non-FSD projects by readable areas by default', () => {
    const matrix = buildMatrixView(
      scanFixture({
        modules: [
          moduleNode('src/App.tsx', 'component'),
          moduleNode('src/mfes/products/ProductCard.tsx', 'component'),
          moduleNode('src/mfes/users/UserCard.tsx', 'component'),
          moduleNode('src/utils/date.ts', 'util'),
        ],
        edges: [
          edge('src/App.tsx', 'src/mfes/products/ProductCard.tsx'),
          edge('src/mfes/products/ProductCard.tsx', 'src/mfes/products/productTypes.ts'),
          edge('src/mfes/products/ProductCard.tsx', 'src/utils/date.ts'),
          edge('src/mfes/users/UserCard.tsx', 'src/utils/date.ts'),
        ],
        cycles: [],
        metrics: {},
        layerViolations: [],
      }),
    );

    expect(matrix.grouping).toBe('area');
    expect(matrix.groups).toEqual(['app', 'mfes/products', 'mfes/users', 'utils']);
    expect(matrix.groups).not.toContain('unknown');
    expect(matrix.cells).not.toContainEqual(
      expect.objectContaining({ from: 'mfes/products', to: 'mfes/products' }),
    );
    expect(matrix.cells).toContainEqual(
      expect.objectContaining({
        from: 'app',
        to: 'mfes/products',
        imports: 1,
        violations: 0,
        cycleEdges: 0,
      }),
    );
  });

  it('uses project label for non-FSD layer grouping', () => {
    const matrix = buildMatrixView(
      scanFixture({
        modules: [
          moduleNode('src/client/index.ts', 'module'),
          moduleNode('src/services/api.ts', 'service'),
        ],
        edges: [edge('src/client/index.ts', 'src/services/api.ts')],
        cycles: [],
        metrics: {},
        layerViolations: [],
      }),
      'layer',
    );

    expect(matrix.groups).toEqual(['project']);
    expect(matrix.groups).not.toContain('unknown');
  });

  it('builds review, ownership and semantic views', () => {
    const scan = scanFixture({
      modules: [
        moduleNode('src/client/index.ts', 'module'),
        moduleNode('src/services/api.ts', 'service'),
        moduleNode('src/types/public.ts', 'schema', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
      ],
      edges: [
        edge('src/client/index.ts', 'src/services/api.ts'),
        edge('src/services/api.ts', 'src/types/public.ts'),
      ],
      cycles: [],
      metrics: {
        'src/client/index.ts': metric({ fanIn: 0, fanOut: 1 }),
        'src/services/api.ts': metric({ fanIn: 1, fanOut: 1, hotnessScore: 12 }),
        'src/types/public.ts': metric({ fanIn: 1, fanOut: 0 }),
      },
      hotZones: ['src/services/api.ts'],
      layerViolations: [],
    });

    expect(buildReviewRiskView(scan)).toMatchObject({
      level: 'medium',
      checkFirst: ['src/services/api.ts'],
      guidedActions: [
        {
          kind: 'hotspot',
          title: 'Review hotspot impact',
          target: 'src/services/api.ts',
          action: 'Open impact before changing this module.',
          verify: 'Run impact for this module and check the top importers before editing.',
        },
      ],
    });
    expect(buildOwnershipView(scan).areas[0]).toMatchObject({
      area: 'services',
      primaryKind: 'service',
    });
    expect(buildSemanticSurfaceView(scan).broadPublicModules[0]).toMatchObject({
      id: 'src/types/public.ts',
      role: 'schema',
    });
  });

  it('adds baseline regressions to the review view', () => {
    const baseline = scanFixture({ cycles: [], signals: [] });
    const current = scanFixture({
      signals: [signal({ stableKey: 'contract:new', severity: 'high' })],
    });
    const view = buildReviewRiskView(current, {
      baseline,
      diff: {
        projectId: 'p',
        projectName: 'project',
        prevScannedAt: baseline.scannedAt,
        nextScannedAt: current.scannedAt,
        addedModules: [],
        removedModules: [],
        changedModules: [],
        newCycles: current.cycles,
        resolvedCycles: [],
        newLayerViolations: [],
        resolvedLayerViolations: [],
        newContractViolations: [],
        resolvedContractViolations: [],
        summary: {
          addedModules: 0,
          removedModules: 0,
          changedModules: 0,
          newCycles: current.cycles.length,
          resolvedCycles: 0,
          newLayerViolations: 0,
          newContractViolations: 0,
        },
      },
    });

    expect(view.baseline).toMatchObject({ newCycles: 1, newSignals: 1 });
    expect(view.regressions).toEqual(['1 new cycle(s)', '1 new signal(s)']);
  });

  it('raises review priority for unowned lifecycle side effects', () => {
    const scan = scanFixture({
      archDebt: {
        score: 10,
        grade: 'A',
        breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
      },
      modules: [moduleNode('src/components/Dashboard.tsx', 'module')],
      metrics: {
        'src/components/Dashboard.tsx': metric({ fanIn: 1, fanOut: 0 }),
      },
      cycles: [],
      hotZones: [],
      layerViolations: [],
      memoryRisks: [
        {
          id: 'memory:event-listener-cleanup:src/components/Dashboard.tsx:8',
          kind: 'event-listener-cleanup',
          moduleId: 'src/components/Dashboard.tsx',
          severity: 'medium',
          confidence: 'high',
          evidence: [
            {
              message: 'addEventListener has no visible removeEventListener cleanup',
              line: 8,
              acquire: 'addEventListener',
              expectedCleanup: 'removeEventListener',
            },
          ],
          remediation: 'Remove the listener from the matching component teardown lifecycle.',
        },
      ],
    });

    expect(buildReviewRiskView(scan)).toMatchObject({
      level: 'medium',
      reasons: ['1 lifecycle owner review(s)'],
      checkFirst: ['src/components/Dashboard.tsx'],
      guidedActions: [
        {
          kind: 'lifecycle',
          title: 'Assign lifecycle owner',
          target: 'src/components/Dashboard.tsx',
          verify: 'Run hygiene and confirm the module is no longer listed as a review boundary.',
        },
      ],
    });
  });

  it('builds lifecycle hygiene and trend views', () => {
    const baseline = scanFixture({
      cycles: [],
      signals: [],
      archDebt: {
        score: 12,
        grade: 'A',
        breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
      },
    });
    const current = scanFixture({
      modules: [
        moduleNode('src/app/main.ts', 'entry'),
        moduleNode('src/client/bootstrap.ts', 'module'),
        moduleNode('src/legacy/unused.ts', 'module'),
        { ...moduleNode('src/generated/api.ts', 'api'), isGenerated: true, loc: 800 },
      ],
      edges: [edge('src/client/bootstrap.ts', 'src/app/main.ts')],
      cycles: [],
      metrics: {
        'src/client/bootstrap.ts': metric({ fanIn: 0, fanOut: 1 }),
        'src/legacy/unused.ts': metric({ fanIn: 0, fanOut: 0 }),
        'src/generated/api.ts': metric({ fanIn: 30, fanOut: 0 }),
      },
      signals: [signal({ stableKey: 'surface:new', severity: 'high' })],
      memoryRisks: [
        {
          id: 'memory:event-listener-cleanup:src/client/bootstrap.ts:3',
          kind: 'event-listener-cleanup',
          moduleId: 'src/client/bootstrap.ts',
          severity: 'medium',
          confidence: 'high',
          evidence: [
            {
              message: 'addEventListener has no visible removeEventListener cleanup',
              line: 3,
              acquire: 'addEventListener',
              expectedCleanup: 'removeEventListener',
            },
          ],
          remediation: 'Remove the listener from the matching component teardown lifecycle.',
        },
      ],
      asyncLifecycleRisks: [
        {
          id: 'async-lifecycle:async-effect-cleanup:src/client/bootstrap.ts:4',
          kind: 'async-effect-cleanup',
          moduleId: 'src/client/bootstrap.ts',
          severity: 'medium',
          confidence: 'high',
          evidence: [
            {
              message: 'async lifecycle work has no visible abort, stale guard, or cleanup',
              line: 4,
              asyncSource: 'fetch',
              expectedGuard: 'AbortController or stale guard cleanup',
            },
          ],
          remediation:
            'Add AbortController, a stale-result guard, or lifecycle cleanup before updating state.',
        },
      ],
      archDebt: {
        score: 42,
        grade: 'C',
        breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 1 },
      },
    });

    expect(buildLifecycleHygieneView(current)).toMatchObject({
      summary: {
        removableCandidates: 1,
        entryCandidates: 1,
        generatedPressure: 1,
        memoryRisks: 1,
        asyncLifecycleRisks: 1,
        lifecycleRiskModules: 1,
        sideEffectOwners: 1,
      },
      sideEffectOwners: [
        {
          id: 'src/client/bootstrap.ts',
          owner: 'src',
          layer: 'project',
          kind: 'module',
          memoryRisks: 1,
          asyncLifecycleRisks: 1,
          totalRisks: 2,
          placement: 'review',
        },
      ],
      lifecycleRiskModules: [
        {
          id: 'src/client/bootstrap.ts',
          memoryRisks: 1,
          asyncLifecycleRisks: 1,
          totalRisks: 2,
          confidence: 'high',
          severity: 'medium',
        },
      ],
    });
    expect(buildTrendView(baseline, current)).toMatchObject({
      direction: 'regressed',
      summary: { scoreDelta: 30, newSignals: 1 },
    });
  });

  it('resolves impact targets by exact id or substring', () => {
    const scan = scanFixture();

    expect(resolveImpactTarget(scan, 'src/features/auth/model/session.ts')).toBe(
      'src/features/auth/model/session.ts',
    );
    expect(resolveImpactTarget(scan, 'session')).toBe('src/features/auth/model/session.ts');

    const impact = buildImpactView(scan, 'src/features/auth/model/session.ts');
    expect(impact.importers).toContain('src/pages/login/Page.ts');
    expect(impact.affectedModules).not.toContain('src/features/auth/model/session.ts');
    expect(impact.cyclesTouched).toEqual(['cycle:auth']);
    expect(impact.metrics).toMatchObject({ fanIn: 1, fanOut: 1 });
  });

  it('explains cycle scope, path edges and suggested breakpoints', () => {
    const view = buildExplainView(scanFixture(), { cycle: 'cycle:auth' });

    expect(view).toMatchObject({
      kind: 'cycle',
      title: 'Cycle cycle:auth',
      severity: 'direct',
      cycle: {
        affectedAreas: ['features/auth', 'pages/login'],
        affectedFolders: ['src/features/auth/model', 'src/pages/login'],
        affectedLayers: ['features', 'pages'],
        suggestedBreakpoint: {
          from: 'src/features/auth/model/session.ts',
          to: 'src/pages/login/Page.ts',
        },
      },
    });
    expect(view.cycle?.edges).toContainEqual(
      expect.objectContaining({
        from: 'src/features/auth/model/session.ts',
        to: 'src/pages/login/Page.ts',
        fromLayer: 'features',
        toLayer: 'pages',
        fromFolder: 'src/features/auth/model',
        toFolder: 'src/pages/login',
      }),
    );
    expect(view.evidence).toContain(
      'Affected areas: features/auth, pages/login; layers: features, pages',
    );
  });

  it('reconciles new, regressed and resolved signals for baseline reports', () => {
    const baseline = scanFixture({
      signals: [
        signal({ stableKey: 'contract:a', severity: 'medium' }),
        signal({ stableKey: 'contract:resolved', severity: 'high' }),
      ],
    });
    const current = scanFixture({
      signals: [
        signal({ stableKey: 'contract:a', severity: 'high' }),
        signal({ stableKey: 'contract:new', severity: 'high' }),
      ],
    });

    const view = buildSignalBaselineView(baseline, current);
    expect(view.regressedSignals.map((item) => item.stableKey)).toEqual(['contract:a']);
    expect(view.newSignals.map((item) => item.stableKey)).toEqual(['contract:new']);
    expect(view.resolved.map((item) => item.stableKey)).toEqual(['contract:resolved']);
  });
});

function scanFixture(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    project: { id: 'p', name: 'project', rootPath: '/repo', detectedFramework: 'generic' },
    modules: [
      {
        id: 'src/pages/login/Page.ts',
        absPath: '/repo/src/pages/login/Page.ts',
        kind: 'route',
        language: 'ts',
        loc: 20,
        exports: [],
        isInfra: false,
      },
      {
        id: 'src/features/auth/model/session.ts',
        absPath: '/repo/src/features/auth/model/session.ts',
        kind: 'store',
        language: 'ts',
        loc: 50,
        exports: [],
        isInfra: false,
      },
    ],
    edges: [
      {
        from: 'src/pages/login/Page.ts',
        to: 'src/features/auth/model/session.ts',
        kind: 'static',
        specifier: '@/features/auth/model/session',
        resolved: true,
      },
      {
        from: 'src/features/auth/model/session.ts',
        to: 'src/pages/login/Page.ts',
        kind: 'static',
        specifier: '@/pages/login/Page',
        resolved: true,
      },
    ],
    cycles: [
      {
        id: 'cycle:auth',
        modules: ['src/pages/login/Page.ts', 'src/features/auth/model/session.ts'],
        length: 2,
        severity: 'direct',
      },
    ],
    metrics: {
      'src/pages/login/Page.ts': {
        fanIn: 1,
        fanOut: 1,
        instability: 0.5,
        depth: 0,
        inCycle: true,
        couplingScore: 1,
        hotnessScore: 1,
      },
      'src/features/auth/model/session.ts': {
        fanIn: 1,
        fanOut: 1,
        instability: 0.5,
        depth: 1,
        inCycle: true,
        couplingScore: 1,
        hotnessScore: 1,
      },
    },
    hotZones: [],
    layerViolations: [
      {
        edgeId: 'src/features/auth/model/session.ts\u0001src/pages/login/Page.ts',
        from: 'src/features/auth/model/session.ts',
        to: 'src/pages/login/Page.ts',
        fromLayer: 'features',
        toLayer: 'pages',
        severity: 'warning',
      },
    ],
    archDebt: {
      score: 30,
      grade: 'B',
      breakdown: { cycles: 1, layerViolations: 1, hotZones: 0, coupling: 1 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: '2026-05-19T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
    ...overrides,
  };
}

function moduleNode(
  id: string,
  kind: ScanResult['modules'][number]['kind'],
  exports: string[] = [],
) {
  return {
    id,
    absPath: `/repo/${id}`,
    kind,
    language: 'ts',
    loc: 10,
    exports,
    isInfra: false,
  } satisfies ScanResult['modules'][number];
}

function metric(overrides: Partial<ScanResult['metrics'][string]> = {}) {
  return {
    fanIn: 0,
    fanOut: 0,
    instability: 0,
    depth: 0,
    inCycle: false,
    couplingScore: 0,
    hotnessScore: 0,
    ...overrides,
  } satisfies ScanResult['metrics'][string];
}

function edge(from: string, to: string) {
  return {
    from,
    to,
    kind: 'static',
    specifier: to,
    resolved: true,
  } satisfies ScanResult['edges'][number];
}

function signal(overrides: Partial<ArchitectureSignal>): ArchitectureSignal {
  return {
    id: `signal:${overrides.stableKey ?? 'default'}`,
    stableKey: 'contract:default',
    kind: 'contract-violation',
    title: 'contract',
    severity: 'high',
    confidence: 'high',
    actionability: 'manual',
    status: 'new',
    maturity: 'stable',
    modules: ['src/features/auth/model/session.ts'],
    evidence: [{ kind: 'contract', message: 'contract issue', confidence: 'high' }],
    limitations: [],
    ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
    ...overrides,
  };
}
