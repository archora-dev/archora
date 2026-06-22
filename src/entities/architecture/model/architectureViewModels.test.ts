import { describe, expect, it } from 'vitest';
import {
  buildArchitectureOverview,
  buildCyclesViewModel,
  buildDependencyMatrix,
  buildExplorerInspectorData,
  buildFolderExplorer,
  buildImpactViewModel,
  buildImpactSummary,
  buildRulesViewModel,
  createArchitectureViewContext,
  resolveArchitectureNavigationTarget,
  resolveExplorerSelectionTarget,
} from '@/entities/architecture';
import type { ScanResult } from '@/core/analyzer/types';

function scanFixture(): ScanResult {
  const modules: ScanResult['modules'] = [
    moduleNode('src/features/auth/model/session.ts', { loc: 180 }),
    moduleNode('src/features/auth/api/auth-service.ts', { loc: 120 }),
    moduleNode('src/widgets/login/ui/LoginPanel.vue', { language: 'vue', loc: 95 }),
    moduleNode('src/shared/api/client.ts', { loc: 140 }),
    moduleNode('src/shared/lib/date.ts', { loc: 35 }),
    moduleNode('src/entities/user/model/user.ts', { loc: 90 }),
    moduleNode('src/pages/home/HomePage.vue', { language: 'vue', loc: 70 }),
    moduleNode('src/legacy/orphan.ts', { loc: 25 }),
  ];

  const edges: ScanResult['edges'] = [
    edge('src/pages/home/HomePage.vue', 'src/widgets/login/ui/LoginPanel.vue'),
    edge('src/widgets/login/ui/LoginPanel.vue', 'src/features/auth/model/session.ts'),
    edge('src/features/auth/model/session.ts', 'src/features/auth/api/auth-service.ts'),
    edge('src/features/auth/api/auth-service.ts', 'src/shared/api/client.ts'),
    edge('src/shared/api/client.ts', 'src/features/auth/model/session.ts'),
    edge('src/features/auth/model/session.ts', 'src/entities/user/model/user.ts'),
    edge('src/features/auth/model/session.ts', 'src/shared/lib/date.ts', 'type-only'),
  ];

  return {
    project: {
      id: 'p',
      name: 'demo',
      rootPath: '/demo',
      detectedFramework: 'vue',
    },
    modules,
    edges,
    cycles: [
      {
        id: 'cycle:auth',
        modules: [
          'src/features/auth/model/session.ts',
          'src/features/auth/api/auth-service.ts',
          'src/shared/api/client.ts',
        ],
        length: 3,
        severity: 'indirect',
      },
    ],
    metrics: {
      'src/features/auth/model/session.ts': metric({
        fanIn: 2,
        fanOut: 3,
        instability: 0.6,
        inCycle: true,
        couplingScore: 14,
        hotnessScore: 18,
      }),
      'src/features/auth/api/auth-service.ts': metric({
        fanIn: 1,
        fanOut: 1,
        inCycle: true,
        couplingScore: 8,
        hotnessScore: 9,
      }),
      'src/widgets/login/ui/LoginPanel.vue': metric({
        fanIn: 1,
        fanOut: 1,
        couplingScore: 3,
        hotnessScore: 2,
      }),
      'src/shared/api/client.ts': metric({
        fanIn: 1,
        fanOut: 1,
        inCycle: true,
        couplingScore: 10,
        hotnessScore: 12,
      }),
      'src/shared/lib/date.ts': metric({ fanIn: 1, fanOut: 0, couplingScore: 1 }),
      'src/entities/user/model/user.ts': metric({ fanIn: 1, fanOut: 0, couplingScore: 2 }),
      'src/pages/home/HomePage.vue': metric({ fanIn: 0, fanOut: 1, couplingScore: 1 }),
      'src/legacy/orphan.ts': metric({ fanIn: 0, fanOut: 0 }),
    },
    hotZones: ['src/features/auth/model/session.ts', 'src/shared/api/client.ts'],
    layerViolations: [
      {
        edgeId: 'shared-to-feature',
        from: 'src/shared/api/client.ts',
        to: 'src/features/auth/model/session.ts',
        fromLayer: 'shared',
        toLayer: 'features',
        severity: 'error',
      },
    ],
    archDebt: {
      score: 42,
      grade: 'C',
      breakdown: { cycles: 18, layerViolations: 14, hotZones: 7, coupling: 3 },
    },
    recommendations: [
      {
        id: 'split-session',
        kind: 'split-god-module',
        modules: ['src/features/auth/model/session.ts'],
        params: { reason: 'high coupling' },
        weight: 20,
      },
      {
        id: 'type-only-session-date',
        kind: 'type-only-candidate',
        modules: ['src/features/auth/model/session.ts'],
        params: { target: 'src/shared/lib/date.ts' },
        weight: 6,
      },
    ],
    contractViolations: [],
    scannedAt: '2026-05-10T00:00:00Z',
    durationMs: 120,
    warnings: [],
  };
}

describe('architecture view models', () => {
  it('builds overview totals, hotspots, orphans, and next actions', () => {
    const overview = buildArchitectureOverview(scanFixture());

    expect(overview.totals).toMatchObject({
      modules: 8,
      dependencies: 7,
      domains: 7,
      cycles: 1,
      layerViolations: 1,
      hotZones: 2,
      orphanModules: 1,
    });
    expect(overview.topHotspots[0]).toMatchObject({
      id: 'src/features/auth/model/session.ts',
      fanIn: 2,
      fanOut: 3,
      degree: 5,
      cycleCount: 1,
      violationCount: 1,
      loc: 180,
      instability: 0.6,
      debtScore: expect.any(Number),
    });
    expect(overview.orphanModules).toEqual([
      { id: 'src/legacy/orphan.ts', label: 'legacy/orphan.ts', folder: 'src/legacy', loc: 25 },
    ]);
    expect(overview.suggestedActions[0]?.kind).toBe('fix-layer-violation');
    expect(overview.suggestedActions[0]).toMatchObject({
      kind: 'fix-layer-violation',
      i18nKey: 'widgets.architectureWorkspace.actions.fix-layer-violation',
      params: { count: 1 },
      evidence: ['shared-to-feature'],
    });
    expect(overview.priorityIssues.map((issue) => issue.kind)).toEqual([
      'cycle',
      'layer-violation',
      'high-fan-out',
      'high-fan-in',
      'orphan',
    ]);
    expect(overview.priorityIssues[0]).toMatchObject({
      severity: 'warning',
      affectedModules: 3,
      targetId: 'cycle:auth',
    });
    expect(overview.priorityIssues[0]?.recommendation).toMatchObject({
      kind: 'cycle',
      i18nKey: 'widgets.architectureWorkspace.priorityRecommendations.cycle',
      params: { targetId: 'cycle:auth', affectedModules: 3 },
      evidence: ['cycle:auth'],
    });
    expect(overview.layerViolations[0]?.message).toMatchObject({
      kind: 'layer-violation',
      i18nKey: 'widgets.architectureWorkspace.violationMessage',
      params: { fromLayer: 'shared', toLayer: 'features' },
      evidence: ['shared-to-feature'],
    });
    expect(overview.folderRisks[0]).toMatchObject({
      folder: 'src/features/auth',
      cycleCount: 1,
      violationCount: 1,
    });
    expect(overview.areaRisks[0]).toMatchObject({
      area: 'features/auth',
      moduleCount: 2,
      cycleCount: 1,
      violationCount: 1,
    });
    expect(overview.layerRisks[0]).toMatchObject({
      layer: 'features',
      moduleCount: 2,
    });
  });

  it('builds a layer dependency matrix with violation-only filtering', () => {
    const areaMatrix = buildDependencyMatrix(scanFixture(), { grouping: 'area' });
    const matrix = buildDependencyMatrix(scanFixture(), { grouping: 'layer' });
    const violationOnly = buildDependencyMatrix(scanFixture(), {
      grouping: 'layer',
      violationOnly: true,
    });

    expect(areaMatrix.groups).toEqual([
      'pages/home',
      'widgets/login',
      'features/auth',
      'shared/api',
      'entities/user',
      'shared/lib',
    ]);
    expect(matrix.groups).toEqual(['pages', 'widgets', 'features', 'shared', 'entities']);
    expect(cell(matrix, 'shared', 'features')).toMatchObject({
      count: 1,
      severity: 'error',
      violationCount: 1,
    });
    expect(cell(matrix, 'features', 'shared')).toMatchObject({
      count: 2,
      severity: 'normal',
    });
    expect(violationOnly.cells).toHaveLength(1);
    expect(violationOnly.cells[0]?.imports[0]).toMatchObject({
      from: 'src/shared/api/client.ts',
      to: 'src/features/auth/model/session.ts',
      cycleEdge: true,
    });
  });

  it('reuses a scan context across matrix, rules, impact and inspector builders', () => {
    const scan = scanFixture();
    const context = createArchitectureViewContext(scan);
    const explorer = buildFolderExplorer(scan, { depth: 3 }, context);
    const auth = explorer.items.find((item) => item.id === 'src/features/auth');

    expect(buildDependencyMatrix(scan, { grouping: 'layer' }, context)).toEqual(
      buildDependencyMatrix(scan, { grouping: 'layer' }),
    );
    expect(buildRulesViewModel(scan, { sortBy: 'risk' }, context)).toEqual(
      buildRulesViewModel(scan, { sortBy: 'risk' }),
    );
    expect(
      buildImpactViewModel(
        scan,
        'src/features/auth/model/session.ts',
        {
          targetKind: 'module',
          direction: 'both',
          depth: 2,
          groupBy: 'distance',
          sortBy: 'distance',
        },
        context,
      ),
    ).toEqual(
      buildImpactViewModel(scan, 'src/features/auth/model/session.ts', {
        targetKind: 'module',
        direction: 'both',
        depth: 2,
        groupBy: 'distance',
        sortBy: 'distance',
      }),
    );
    expect(buildExplorerInspectorData(scan, auth, context)).toEqual(
      buildExplorerInspectorData(scan, auth),
    );
  });

  it('builds folder explorer rows with risk badges and top files', () => {
    const explorer = buildFolderExplorer(scanFixture(), { depth: 3 });
    const auth = explorer.items.find((item) => item.id === 'src/features/auth');

    expect(auth).toMatchObject({
      id: 'src/features/auth',
      fileCount: 2,
      outgoingDeps: 4,
      incomingDeps: 2,
      cycleCount: 1,
      violationCount: 1,
      layer: 'features',
      type: 'folder',
      fanIn: 3,
      fanOut: 4,
    });
    expect(auth?.badges).toContain('HOT');
    expect(auth?.badges).toContain('CYCLE');
    expect(auth?.badges).toContain('VIOLATION');
    expect(auth?.topFiles[0]?.id).toBe('src/features/auth/model/session.ts');
  });

  it('builds explorer inspector data from analyzer facts', () => {
    const explorer = buildFolderExplorer(scanFixture(), { depth: 3 });
    const auth = explorer.items.find((item) => item.id === 'src/features/auth');

    const inspector = buildExplorerInspectorData(scanFixture(), auth);

    expect(inspector?.summary).toMatchObject({
      loc: 300,
      fanIn: 3,
      fanOut: 4,
      couplingScore: 22,
      dependenceScore: 7,
      incomingDeps: 2,
      outgoingDeps: 4,
      cycleCount: 1,
      violationCount: 1,
      riskScore: auth?.riskScore,
      badges: expect.arrayContaining(['HOT', 'CYCLE', 'VIOLATION']),
    });
    expect(inspector?.summary.riskFactors.map((item) => item.id)).toEqual([
      'cycles',
      'violations',
      'fan-out',
      'fan-in',
      'coupling',
      'dependence',
      'size',
    ]);
    expect(inspector?.summary.whyRisk).toBe(
      'src/features/auth: 1 cycle, 1 violation, 4 outgoing dependencies, 2 incoming dependencies.',
    );
    expect(inspector?.imports.outgoing.map((item) => [item.to, item.count, item.kind])).toEqual([
      ['src/entities/user/model/user.ts', 1, 'static'],
      ['src/shared/api/client.ts', 1, 'static'],
      ['src/shared/lib/date.ts', 1, 'type-only'],
    ]);
    expect(inspector?.imports).toMatchObject({
      outgoingCount: 3,
      incomingCount: 2,
      uniqueModuleCount: 4,
    });
    expect(inspector?.imports.outgoing[1]?.evidence[0]).toMatchObject({
      sourcePath: 'src/features/auth/api/auth-service.ts',
      targetPath: 'src/shared/api/client.ts',
      specifier: 'src/shared/api/client.ts',
      resolved: true,
      confidence: 'high',
    });
    expect(inspector?.imports.incoming.map((item) => item.from)).toEqual([
      'src/widgets/login/ui/LoginPanel.vue',
      'src/shared/api/client.ts',
    ]);
    expect(inspector?.imports.bothDirections.map((item) => [item.from, item.to])).toEqual([
      ['src/features/auth/api/auth-service.ts', 'src/shared/api/client.ts'],
      ['src/shared/api/client.ts', 'src/features/auth/model/session.ts'],
    ]);
    expect(inspector?.cycles.primaryCycle).toMatchObject({
      id: 'cycle:auth',
      riskScore: expect.any(Number),
    });
    expect(inspector?.cycles.summary).toMatchObject({
      cycleCount: 1,
      relatedModuleCount: 3,
      violationCount: 1,
      hotZoneCount: 2,
      importTypeCandidateCount: 1,
    });
    expect(inspector?.cycles.primaryCycle?.edges[0]).toMatchObject({
      from: 'src/features/auth/model/session.ts',
      to: 'src/features/auth/api/auth-service.ts',
    });
    expect(inspector?.violations.items[0]).toMatchObject({
      ruleId: 'shared-to-feature',
      ruleName: 'Layer order',
      from: 'src/shared/api/client.ts',
      to: 'src/features/auth/model/session.ts',
      whatHappenedKey: 'layerBoundaryCrossed',
      whyBadKey: 'layerDirection',
      howToFixKey: 'moveDependency',
      messageParams: {
        sourceLayer: 'shared',
        targetLayer: 'features',
      },
    });
    expect(inspector?.violations.summary).toMatchObject({
      totalCount: 1,
      criticalCount: 1,
      warningCount: 0,
    });
    expect(inspector?.impact).toMatchObject({
      affectedModulesCount: 4,
      affectedFilesCount: 4,
      affectedLayersCount: 4,
      changeRiskScore: expect.any(Number),
      changeRiskSeverity: expect.any(String),
      directCount: 3,
      transitiveCount: 1,
      primaryAction: {
        key: 'breakCycle',
        reason: 'cycles-touched',
      },
    });
    expect(inspector?.impact.incomingImporters.map((item) => item.id)).toEqual([
      'src/widgets/login/ui/LoginPanel.vue',
    ]);
    expect(inspector?.impact.outgoingImports.map((item) => item.id)).toEqual([
      'src/entities/user/model/user.ts',
      'src/shared/api/client.ts',
    ]);
    expect(inspector?.impact.riskyAffectedModules.map((item) => item.id)).toEqual([
      'src/shared/api/client.ts',
    ]);
    expect(inspector?.impact.items.map((item) => [item.id, item.relation, item.distance])).toEqual([
      ['src/entities/user/model/user.ts', 'import', 1],
      ['src/shared/api/client.ts', 'import', 1],
      ['src/widgets/login/ui/LoginPanel.vue', 'imported-by', 1],
      ['src/pages/home/HomePage.vue', 'transitive', 2],
    ]);
    expect(inspector?.impact.recommendations).toEqual(['reviewTransitive', 'reviewHighRisk']);
    expect(inspector?.recommendations.map((item) => item.key)).toEqual([
      'breakCycle',
      'moveDependency',
    ]);
  });

  it('includes contract violations in inspector summary and typed violation details', () => {
    const scan = scanFixture();
    scan.contractViolations = [
      {
        id: 'boundary:auth-api:0',
        kind: 'boundary',
        ruleName: 'auth-api',
        severity: 'warning',
        message: 'auth api boundary is crossed',
        modules: ['src/widgets/login/ui/LoginPanel.vue', 'src/features/auth/model/session.ts'],
        edge: {
          from: 'src/widgets/login/ui/LoginPanel.vue',
          to: 'src/features/auth/model/session.ts',
          specifier: '@/features/auth/model/session',
        },
      },
    ];
    const explorer = buildFolderExplorer(scan, { depth: 3 });
    const auth = explorer.items.find((item) => item.id === 'src/features/auth');

    const inspector = buildExplorerInspectorData(scan, auth);

    expect(inspector?.summary.violationCount).toBe(2);
    expect(inspector?.summary.riskFactors.find((item) => item.id === 'violations')?.value).toBe(2);
    expect(inspector?.violations.items.map((item) => [item.ruleId, item.kind])).toEqual([
      ['shared-to-feature', 'layer'],
      ['boundary:auth-api:0', 'contract'],
    ]);
    expect(inspector?.violations.items[1]).toMatchObject({
      whatHappenedKey: 'contractViolation',
      whyBadKey: 'contractRule',
      howToFixKey: 'enforceContract',
      messageParams: {
        ruleName: 'auth-api',
        sourceLayer: 'widgets',
        targetLayer: 'features',
      },
    });
  });

  it('resolves explorer selection targets without choosing unrelated rows', () => {
    const explorer = buildFolderExplorer(scanFixture(), { depth: 3 });

    expect(resolveExplorerSelectionTarget(explorer.items, 'src/features/auth')?.item.id).toBe(
      'src/features/auth',
    );
    expect(
      resolveExplorerSelectionTarget(explorer.items, 'src/features/auth/model/session.ts'),
    ).toMatchObject({
      item: { id: 'src/features/auth' },
      match: 'exact-path',
    });
    expect(resolveExplorerSelectionTarget(explorer.items, 'src/does/not/exist.ts')).toBe(null);
  });

  it('resolves typed architecture navigation targets deterministically', () => {
    const scan = scanFixture();
    const explorer = buildFolderExplorer(scan, { depth: 3 });
    const cycles = buildCyclesViewModel(scan).items;
    const rules = buildRulesViewModel(scan).items;
    const input = { explorerItems: explorer.items, cycles, rules };

    expect(
      resolveArchitectureNavigationTarget({
        ...input,
        target: { kind: 'module', id: 'src/features/auth/model/session.ts' },
      }).explorer?.item.id,
    ).toBe('src/features/auth');
    expect(
      resolveArchitectureNavigationTarget({
        ...input,
        target: { kind: 'folder', id: 'src/shared/api' },
      }).explorer?.item.id,
    ).toBe('src/shared/api');
    expect(
      resolveArchitectureNavigationTarget({
        ...input,
        target: { kind: 'cycle', id: 'cycle:auth' },
      }),
    ).toMatchObject({
      status: 'resolved',
      cycleId: 'cycle:auth',
      explorer: { item: { id: 'src/features/auth' } },
      impactTargetId: 'src/features/auth/model/session.ts',
    });
    expect(
      resolveArchitectureNavigationTarget({
        ...input,
        target: { kind: 'rule', id: 'shared-to-feature' },
      }),
    ).toMatchObject({
      status: 'resolved',
      ruleId: 'shared-to-feature',
      explorer: { item: { id: 'src/shared/api' } },
      impactTargetId: 'src/shared/api/client.ts',
    });
    expect(
      resolveArchitectureNavigationTarget({
        ...input,
        target: { kind: 'module', id: 'src/does/not/exist.ts' },
      }),
    ).toMatchObject({
      status: 'not-found',
      explorer: null,
    });
  });

  it('filters and sorts explorer rows for architecture triage', () => {
    const explorer = buildFolderExplorer(scanFixture(), {
      depth: 3,
      search: 'auth',
      onlyViolations: true,
      sortBy: 'riskScore',
      sortDirection: 'desc',
    });

    expect(explorer.items.map((item) => item.id)).toEqual(['src/features/auth']);
    expect(explorer.totalCount).toBe(7);
    expect(explorer.filteredCount).toBe(1);
    expect(explorer.items[0]?.riskScore).toBeGreaterThan(overviewRiskFloor());
  });

  it('filters explorer rows by memory-risk findings', () => {
    const scan = scanFixture();
    scan.memoryRisks = [
      {
        id: 'memory:event-listener-cleanup:src/features/auth/model/session.ts:12',
        kind: 'event-listener-cleanup',
        moduleId: 'src/features/auth/model/session.ts',
        framework: 'vue',
        severity: 'medium',
        confidence: 'high',
        evidence: [
          {
            message: 'addEventListener has no visible removeEventListener cleanup',
            line: 12,
            acquire: 'addEventListener',
            expectedCleanup: 'removeEventListener',
          },
        ],
        remediation: 'Remove the listener from the matching component teardown lifecycle.',
      },
    ];

    const explorer = buildFolderExplorer(scan, {
      depth: 3,
      onlyMemoryRisks: true,
    });

    expect(explorer.items.map((item) => item.id)).toEqual(['src/features/auth']);
    expect(explorer.items[0]?.memoryRiskCount).toBe(1);
    expect(explorer.items[0]?.badges).toContain('MEMORY');
  });

  it('filters explorer rows by async lifecycle findings', () => {
    const scan = scanFixture();
    scan.asyncLifecycleRisks = [
      {
        id: 'async-lifecycle:async-effect-cleanup:src/features/auth/model/session.ts:12',
        kind: 'async-effect-cleanup',
        moduleId: 'src/features/auth/model/session.ts',
        framework: 'vue',
        severity: 'medium',
        confidence: 'high',
        evidence: [
          {
            message: 'async lifecycle work has no visible abort, stale guard, or cleanup',
            line: 12,
            asyncSource: 'fetch',
            expectedGuard: 'AbortController or stale guard cleanup',
          },
        ],
        remediation:
          'Add AbortController, a stale-result guard, or lifecycle cleanup before updating state.',
      },
    ];

    const explorer = buildFolderExplorer(scan, {
      depth: 3,
      onlyAsyncLifecycleRisks: true,
    });

    expect(explorer.items.map((item) => item.id)).toEqual(['src/features/auth']);
    expect(explorer.items[0]?.asyncLifecycleRiskCount).toBe(1);
    expect(explorer.items[0]?.badges).toContain('ASYNC');
  });

  it('builds impact summary for a selected folder', () => {
    const impact = buildImpactSummary(scanFixture(), 'src/features/auth');

    expect(impact.target).toMatchObject({
      id: 'src/features/auth',
      kind: 'folder',
      moduleCount: 2,
    });
    expect(impact.importers.map((item) => item.id)).toContain(
      'src/widgets/login/ui/LoginPanel.vue',
    );
    expect(impact.imports.map((item) => item.id)).toEqual([
      'src/entities/user/model/user.ts',
      'src/shared/api/client.ts',
      'src/shared/lib/date.ts',
    ]);
    expect(impact.affectedFolders).toEqual([
      'src/entities/user',
      'src/features/auth',
      'src/shared/api',
      'src/shared/lib',
      'src/widgets/login',
    ]);
    expect(impact.summary).toMatchObject({
      kind: 'impact-summary',
      i18nKey: 'widgets.architectureWorkspace.impactSummary',
      params: {
        target: 'src/features/auth',
        modules: 5,
        folders: 5,
      },
      evidence: ['src/features/auth'],
    });
  });

  it('filters, sorts and groups cycles by real analyzer facts', () => {
    const cycles = buildCyclesViewModel(scanFixture(), {
      search: 'shared/api',
      onlyIndirect: true,
      onlyCrossLayer: true,
      onlyInvolvingHotZones: true,
      sortBy: 'risk',
      groupBy: 'layer',
    });

    expect(cycles.items).toHaveLength(1);
    expect(cycles.items[0]).toMatchObject({
      id: 'cycle:auth',
      severity: 'indirect',
      length: 3,
      riskScore: expect.any(Number),
      affectedAreas: ['features/auth', 'shared/api'],
      affectedLayers: ['features', 'shared'],
    });
    expect(cycles.items[0]?.relatedLayerViolations.map((item) => item.id)).toEqual([
      'shared-to-feature',
    ]);
    expect(cycles.items[0]?.suggestedBreakpoints[0]).toMatchObject({
      sourceId: 'src/shared/api/client.ts',
      targetId: 'src/features/auth/model/session.ts',
      reasonKind: 'rule-violation',
      confidence: 'high',
      evidence: expect.arrayContaining(['shared-to-feature']),
    });
    expect(cycles.items[0]?.importTypeCandidates.map((item) => item.from)).toEqual([
      'src/features/auth/model/session.ts',
    ]);
    expect(cycles.groups).toEqual([
      {
        id: 'features',
        label: 'features',
        count: 1,
        riskScore: cycles.items[0]?.riskScore,
      },
    ]);
    expect(cycles.selectedCycle?.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual([
      'src/features/auth/model/session.ts->src/features/auth/api/auth-service.ts',
      'src/features/auth/api/auth-service.ts->src/shared/api/client.ts',
      'src/shared/api/client.ts->src/features/auth/model/session.ts',
    ]);
    expect(cycles.selectedCycle?.edges[2]).toMatchObject({
      fromLayer: 'shared',
      toLayer: 'features',
      fromFolder: 'src/shared/api',
      toFolder: 'src/features/auth/model',
      crossesLayer: true,
      violatesBoundary: true,
    });
  });

  it('uses analyzer feedback edges for cycle break suggestions', () => {
    const scan = scanFixture();
    scan.recommendations.push({
      id: 'cycle-feedback',
      kind: 'cycle-break-cluster',
      modules: [
        'src/features/auth/model/session.ts',
        'src/features/auth/api/auth-service.ts',
        'src/shared/api/client.ts',
      ],
      params: {
        feedbackEdges: [
          {
            from: 'src/features/auth/api/auth-service.ts',
            to: 'src/shared/api/client.ts',
            broken: 1,
            partial: false,
          },
        ],
      },
      weight: 20,
    });

    const cycles = buildCyclesViewModel(scan);

    expect(cycles.items[0]?.suggestedBreakpoints[0]).toMatchObject({
      sourceId: 'src/features/auth/api/auth-service.ts',
      targetId: 'src/shared/api/client.ts',
      reasonKind: 'cross-layer',
      confidence: 'high',
      evidence: expect.arrayContaining(['cycle-feedback']),
    });
  });

  it('does not suggest cycle breakpoints when cycle edge evidence is missing', () => {
    const scan = scanFixture();
    scan.edges = scan.edges.filter(
      (edge) =>
        !(
          edge.from === 'src/shared/api/client.ts' &&
          edge.to === 'src/features/auth/model/session.ts'
        ),
    );

    const cycles = buildCyclesViewModel(scan);

    expect(cycles.items[0]?.suggestedBreakpoints).toEqual([]);
  });

  it('builds cycle-safe impact analysis with depth and direction controls', () => {
    const impact = buildImpactViewModel(scanFixture(), 'src/features/auth/model/session.ts', {
      targetKind: 'module',
      direction: 'both',
      depth: 2,
      groupBy: 'distance',
      sortBy: 'distance',
    });

    expect(impact.empty).toBe(false);
    expect(impact.summary).toMatchObject({
      affectedModulesCount: 5,
      affectedFoldersCount: 5,
      affectedLayersCount: 5,
      riskyAffectedModulesCount: 3,
      cyclesTouched: 1,
      violationsTouched: 1,
      hotZonesTouched: 2,
      directCount: 4,
      transitiveCount: 1,
    });
    expect(impact).toMatchObject({
      direction: 'both',
      depth: 2,
    });
    expect(impact.incomingImporters.map((item) => item.id)).toEqual([
      'src/shared/api/client.ts',
      'src/widgets/login/ui/LoginPanel.vue',
    ]);
    expect(impact.outgoingImports.map((item) => item.id)).toEqual([
      'src/entities/user/model/user.ts',
      'src/features/auth/api/auth-service.ts',
    ]);
    expect(impact.riskyAffectedModules.map((item) => item.id)).toEqual([
      'src/shared/api/client.ts',
      'src/features/auth/api/auth-service.ts',
    ]);
    expect(impact.primaryAction).toMatchObject({
      key: 'breakCycle',
      reason: 'cycles-touched',
      count: 1,
    });
    expect(impact.items.map((item) => [item.id, item.direction, item.distance])).toEqual([
      ['src/entities/user/model/user.ts', 'dependency', 1],
      ['src/features/auth/api/auth-service.ts', 'dependency', 1],
      ['src/shared/api/client.ts', 'dependent', 1],
      ['src/widgets/login/ui/LoginPanel.vue', 'dependent', 1],
      ['src/pages/home/HomePage.vue', 'dependent', 2],
    ]);
    expect(impact.groups.map((group) => [group.id, group.count])).toEqual([
      ['1', 4],
      ['2', 1],
    ]);
  });

  it('builds impact direction slices and target-specific actions', () => {
    const dependencies = buildImpactViewModel(scanFixture(), 'src/features/auth/model/session.ts', {
      targetKind: 'module',
      direction: 'dependencies',
      depth: 1,
    });
    const dependents = buildImpactViewModel(scanFixture(), 'src/features/auth/model/session.ts', {
      targetKind: 'module',
      direction: 'dependents',
      depth: 1,
    });
    const highFanInScan = scanFixture();
    highFanInScan.metrics['src/features/auth/model/session.ts'] = metric({ fanIn: 9, fanOut: 1 });
    const highFanOutScan = scanFixture();
    highFanOutScan.metrics['src/features/auth/model/session.ts'] = metric({ fanIn: 1, fanOut: 9 });
    const cleanScan = scanFixture();
    cleanScan.cycles = [];
    cleanScan.layerViolations = [];

    expect(dependencies.items.map((item) => item.direction)).toEqual(['dependency', 'dependency']);
    expect(dependencies.incomingImporters).toEqual([]);
    expect(dependencies.outgoingImports.map((item) => item.id)).toEqual([
      'src/entities/user/model/user.ts',
      'src/features/auth/api/auth-service.ts',
    ]);
    expect(dependents.items.map((item) => item.direction)).toEqual(['dependent', 'dependent']);
    expect(dependents.incomingImporters.map((item) => item.id)).toEqual([
      'src/shared/api/client.ts',
      'src/widgets/login/ui/LoginPanel.vue',
    ]);
    expect(
      buildImpactViewModel(highFanInScan, 'src/features/auth/model/session.ts', {
        targetKind: 'module',
        direction: 'both',
        depth: 1,
      }).primaryAction.key,
    ).toBe('stabilizeApi');
    expect(
      buildImpactViewModel(highFanOutScan, 'src/features/auth/model/session.ts', {
        targetKind: 'module',
        direction: 'both',
        depth: 1,
      }).primaryAction.key,
    ).toBe('splitModule');
    expect(
      buildImpactViewModel(cleanScan, 'src/shared/lib/date.ts', {
        targetKind: 'module',
        direction: 'both',
        depth: 1,
      }).primaryAction.key,
    ).toBe('keepBoundary');
  });

  it('builds an empty impact state when no target is selected', () => {
    const impact = buildImpactViewModel(scanFixture(), '', {
      direction: 'dependencies',
      depth: 1,
    });

    expect(impact.empty).toBe(true);
    expect(impact.items).toEqual([]);
    expect(impact.summary.affectedModulesCount).toBe(0);
    expect(impact.primaryAction.key).toBe('keepBoundary');
  });

  it('builds searchable rules details from layer and contract violations', () => {
    const scan = scanFixture();
    scan.contractViolations = [
      {
        id: 'boundary:auth-api:0',
        kind: 'boundary',
        ruleName: 'auth-api',
        severity: 'warning',
        message: 'auth api boundary is crossed',
        modules: ['src/widgets/login/ui/LoginPanel.vue', 'src/features/auth/model/session.ts'],
        edge: {
          from: 'src/widgets/login/ui/LoginPanel.vue',
          to: 'src/features/auth/model/session.ts',
          specifier: '@/features/auth/model/session',
        },
      },
    ];

    const rules = buildRulesViewModel(scan, {
      search: 'auth-api',
      kinds: ['contract'],
      onlyRelatedToCycles: true,
      groupBy: 'rule',
      sortBy: 'risk',
    });

    expect(rules.items).toHaveLength(1);
    expect(rules.items[0]).toMatchObject({
      id: 'boundary:auth-api:0',
      kind: 'contract',
      ruleName: 'auth-api',
      severity: 'warning',
      sourceModule: 'src/widgets/login/ui/LoginPanel.vue',
      targetModule: 'src/features/auth/model/session.ts',
      relatedCycles: ['cycle:auth'],
    });
    expect(rules.groups).toEqual([
      {
        id: 'auth-api',
        label: 'auth-api',
        count: 1,
        riskScore: rules.items[0]?.riskScore,
      },
    ]);
    expect(rules.selectedViolation?.explanation).toMatchObject({
      kind: 'contract-rule',
      i18nKey: 'widgets.architectureWorkspace.rules.contractExplanation',
      evidence: ['boundary:auth-api:0'],
    });
    expect(rules.selectedViolation?.howToFix).toMatchObject({
      kind: 'enforce-contract',
      i18nKey: 'widgets.architectureWorkspace.recommendations.enforceContract',
      evidence: ['boundary:auth-api:0'],
    });
  });

  it('does not expose raw user-facing text from architecture builders', () => {
    const overview = buildArchitectureOverview(scanFixture());
    const rules = buildRulesViewModel(scanFixture());
    const impact = buildImpactSummary(scanFixture(), 'src/features/auth');

    expect(typeof overview.priorityIssues[0]?.recommendation).toBe('object');
    expect(typeof overview.suggestedActions[0]).toBe('object');
    expect(typeof overview.layerViolations[0]?.message).toBe('object');
    expect(typeof rules.items[0]?.explanation).toBe('object');
    expect(typeof rules.items[0]?.howToFix).toBe('object');
    expect(typeof impact.summary).toBe('object');
  });
});

function cell(
  matrix: ReturnType<typeof buildDependencyMatrix>,
  from: string,
  to: string,
): ReturnType<typeof buildDependencyMatrix>['cells'][number] | undefined {
  return matrix.cells.find((item) => item.from === from && item.to === to);
}

function moduleNode(
  id: string,
  overrides: Partial<ScanResult['modules'][number]> = {},
): ScanResult['modules'][number] {
  return {
    id,
    absPath: `/demo/${id}`,
    kind: 'util',
    language: 'ts',
    loc: 40,
    exports: [],
    isInfra: false,
    ...overrides,
  };
}

function edge(
  from: string,
  to: string,
  kind: ScanResult['edges'][number]['kind'] = 'static',
): ScanResult['edges'][number] {
  return { from, to, kind, specifier: to, resolved: true, confidence: 'high' };
}

function metric(
  overrides: Partial<ScanResult['metrics'][string]> = {},
): ScanResult['metrics'][string] {
  return {
    fanIn: 0,
    fanOut: 0,
    instability: 0,
    depth: 0,
    inCycle: false,
    couplingScore: 0,
    hotnessScore: 0,
    ...overrides,
  };
}

function overviewRiskFloor(): number {
  return 20;
}
