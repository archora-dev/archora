import { describe, expect, it } from 'vitest';
import type { ScanDiff, ScanResult } from '@archora/core';
import { buildHtmlReport } from '../exporters/html';
import { buildMarkdownReport } from '../exporters/markdown';

describe('report exporters', () => {
  it('shows signal review state and config diagnostics in markdown and html reports', () => {
    const scan = makeScan({
      configDiagnostics: [
        {
          severity: 'warning',
          file: '.archora.json',
          path: '$.signals.suppressions[0]',
          message: 'Signal suppression requires stableKey and reason.',
        },
      ],
      signals: [
        signal({
          id: 'signal:stable',
          stableKey: 'contract:stable',
          title: 'Layer contract drift',
          severity: 'high',
          confidence: 'high',
          status: 'new',
          modules: ['src/features/orders/useOrders.ts'],
          evidence: [{ kind: 'contract', message: 'features imports widgets', confidence: 'high' }],
        }),
        signal({
          id: 'signal:suppressed',
          stableKey: 'contract:suppressed',
          title: 'Accepted boundary debt',
          severity: 'critical',
          confidence: 'high',
          status: 'new',
          suppressed: true,
          suppressionReason: 'accepted until checkout split',
          modules: ['src/widgets/checkout/CheckoutPanel.vue'],
          evidence: [{ kind: 'contract', message: 'widgets imports pages', confidence: 'high' }],
        }),
        signal({
          id: 'signal:beta',
          stableKey: 'signal:beta',
          title: 'Beta confidence signal',
          severity: 'medium',
          confidence: 'medium',
          maturity: 'beta',
          modules: ['src/shared/lib/date.ts'],
          evidence: [{ kind: 'heuristic', message: 'heuristic only', confidence: 'medium' }],
        }),
      ],
    });

    const markdown = buildMarkdownReport(scan, null);
    expect(markdown).toContain('## Signal review');
    expect(markdown).toContain('## Review checklist');
    expect(markdown).toContain('## Guided review');
    expect(markdown).toContain(
      '| Review CI-safe signal | src/features/orders/useOrders.ts | Separate blocking findings from review-only observations. | Run review against the baseline and confirm no new CI-safe signal remains. |',
    );
    expect(markdown).toContain('Review CI-safe signal: Layer contract drift');
    expect(markdown).toContain('| Severity | Confidence | State | Signal | Modules | Evidence |');
    expect(markdown).toContain('suppressed: accepted until checkout split');
    expect(markdown).toContain('medium');
    expect(markdown).toContain('Signal suppression requires stableKey and reason.');

    const html = buildHtmlReport(scan);
    expect(html).toContain('<h2>Guided review</h2>');
    expect(html).toContain('Review CI-safe signal');
    expect(html).toContain('<h2>Signal review</h2>');
    expect(html).toContain('<th>Confidence</th><th>State</th>');
    expect(html).toContain('suppressed: accepted until checkout split');
    expect(html).toContain('Beta confidence signal');
    expect(html).toContain('Signal suppression requires stableKey and reason.');
  });

  it('summarizes static memory risks in markdown and html reports', () => {
    const scan = makeScan({
      memoryRisks: [
        {
          id: 'memory:event-listener-cleanup:src/App.tsx:6',
          kind: 'event-listener-cleanup',
          moduleId: 'src/App.tsx',
          framework: 'react',
          severity: 'medium',
          confidence: 'high',
          evidence: [
            {
              message: 'addEventListener has no visible removeEventListener cleanup',
              line: 6,
              acquire: 'addEventListener',
              expectedCleanup: 'removeEventListener',
            },
          ],
          remediation: 'Remove the listener from the matching component teardown lifecycle.',
        },
      ],
    });

    const markdown = buildMarkdownReport(scan, null);
    expect(markdown).toContain('## Lifecycle hygiene');
    expect(markdown).toContain('| Memory risks | 1 |');
    expect(markdown).toContain('| Lifecycle risk modules | 1 |');
    expect(markdown).toContain('## Side-effect ownership');
    expect(markdown).toContain('| `src/App.tsx` | src | project | module | review | 1 | 0 |');
    expect(markdown).toContain('## Memory risk');
    expect(markdown).toContain('Event listener');
    expect(markdown).toContain('src/App.tsx:6');
    expect(markdown).toContain('static risk, not runtime proof');
    expect(markdown).toContain('addEventListener has no visible removeEventListener cleanup.');

    const html = buildHtmlReport(scan);
    expect(html).toContain('<h2>Lifecycle hygiene</h2>');
    expect(html).toContain('Lifecycle risk modules');
    expect(html).toContain('<h2>Side-effect ownership</h2>');
    expect(html).toContain('<td>src</td>');
    expect(html).toContain('<h2>Memory risk</h2>');
    expect(html).toContain('Event listener');
    expect(html).toContain('src/App.tsx:6');
    expect(html).toContain('static risk, not runtime proof');
  });

  it('summarizes async lifecycle risks in markdown and html reports', () => {
    const scan = makeScan({
      asyncLifecycleRisks: [
        {
          id: 'async-lifecycle:async-effect-cleanup:src/App.tsx:6',
          kind: 'async-effect-cleanup',
          moduleId: 'src/App.tsx',
          framework: 'react',
          severity: 'medium',
          confidence: 'high',
          evidence: [
            {
              message:
                'async lifecycle work has no visible abort, stale guard, or returned cleanup',
              line: 6,
              asyncSource: 'fetch',
              expectedGuard: 'AbortController or stale guard cleanup',
            },
          ],
          remediation:
            'Add AbortController, a stale-result guard, or lifecycle cleanup before updating state.',
        },
      ],
    });

    const markdown = buildMarkdownReport(scan, null);
    expect(markdown).toContain('## Lifecycle hygiene');
    expect(markdown).toContain('| Async lifecycle risks | 1 |');
    expect(markdown).toContain('| Lifecycle risk modules | 1 |');
    expect(markdown).toContain('## Side-effect ownership');
    expect(markdown).toContain('## Async lifecycle risk');
    expect(markdown).toContain('Async lifecycle work');
    expect(markdown).toContain('src/App.tsx:6');
    expect(markdown).toContain('static async lifecycle risk, not runtime proof');

    const html = buildHtmlReport(scan);
    expect(html).toContain('<h2>Lifecycle hygiene</h2>');
    expect(html).toContain('Lifecycle risk modules');
    expect(html).toContain('<h2>Async lifecycle risk</h2>');
    expect(html).toContain('Async lifecycle work');
    expect(html).toContain('src/App.tsx:6');
  });

  it('explains baseline regression drivers in markdown reports', () => {
    const scan = makeScan({
      modules: [
        moduleNode('src/features/orders/useOrders.ts', { loc: 80 }),
        moduleNode('src/widgets/orders/OrdersPanel.vue', { loc: 120 }),
      ],
      cycles: [
        {
          id: 'cycle:orders',
          modules: ['src/features/orders/useOrders.ts', 'src/widgets/orders/OrdersPanel.vue'],
          length: 2,
          severity: 'direct',
        },
      ],
      archDebt: {
        score: 62,
        grade: 'D',
        breakdown: { cycles: 1, layerViolations: 0, hotZones: 0, coupling: 0 },
      },
    });
    const diff: ScanDiff = {
      projectId: 'p',
      projectName: 'p',
      prevScannedAt: '2026-01-01T00:00:00.000Z',
      nextScannedAt: '2026-01-02T00:00:00.000Z',
      addedModules: [moduleNode('src/widgets/orders/OrdersPanel.vue', { loc: 120 })],
      removedModules: [],
      changedModules: [
        {
          id: 'src/features/orders/useOrders.ts',
          prev: { kind: 'composable', loc: 40, language: 'ts' },
          next: { kind: 'composable', loc: 80, language: 'ts' },
        },
      ],
      newCycles: scan.cycles,
      resolvedCycles: [],
      newLayerViolations: [],
      resolvedLayerViolations: [],
      newContractViolations: [],
      resolvedContractViolations: [],
      summary: {
        addedModules: 1,
        removedModules: 0,
        changedModules: 1,
        newCycles: 1,
        resolvedCycles: 0,
        newLayerViolations: 0,
        newContractViolations: 0,
      },
    };

    const markdown = buildMarkdownReport(scan, diff);
    expect(markdown).toContain('### Baseline regression drivers');
    expect(markdown).toContain('| Type | Impact | Evidence |');
    expect(markdown).toContain('New direct cycle');
    expect(markdown).toContain('LOC +40');
    expect(markdown).toContain('src/features/orders/useOrders.ts');
  });

  it('shows architecture budget status and reasons in markdown reports', () => {
    const scan = makeScan({
      archDebt: {
        score: 42,
        grade: 'C',
        breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
      },
      configStatus: { state: 'loaded', file: '.archora.json' },
    });

    const markdown = buildMarkdownReport(scan, null, null, {
      architectureBudget: {
        maxDebtScore: 35,
        maxCycles: 0,
      },
    });
    expect(markdown).toContain('## Architecture budget');
    expect(markdown).toContain('| Status | failed |');
    expect(markdown).toContain('maxDebtScore');
    expect(markdown).toContain('42 > budget 35');
  });

  it('keeps generated-only clusters out of top report sections', () => {
    const scan = makeScan({
      modules: [
        moduleNode('src/shared/assets/forge/demo/generated/src/api/users.ts', {
          loc: 900,
        }),
        moduleNode('src/shared/assets/forge/demo/generated/src/api/orders.ts', {
          loc: 900,
        }),
        moduleNode('src/app/router/index.ts'),
      ],
      metrics: {
        'src/shared/assets/forge/demo/generated/src/api/users.ts': metric({
          fanIn: 40,
          fanOut: 20,
          hotnessScore: 200,
          couplingScore: 200,
        }),
        'src/shared/assets/forge/demo/generated/src/api/orders.ts': metric({
          fanIn: 40,
          fanOut: 20,
          hotnessScore: 200,
          couplingScore: 200,
        }),
        'src/app/router/index.ts': metric({ fanIn: 2, fanOut: 3 }),
      },
      hotZones: [
        'src/shared/assets/forge/demo/generated/src/api/users.ts',
        'src/app/router/index.ts',
      ],
      recommendations: [
        {
          id: 'isolated:generated',
          kind: 'isolated-cluster',
          modules: [
            'src/shared/assets/forge/demo/generated/src/api/users.ts',
            'src/shared/assets/forge/demo/generated/src/api/orders.ts',
          ],
          params: { count: 2, sample: 'users.ts, orders.ts' },
          weight: 0.45,
        },
      ],
      signals: [
        signal({
          id: 'signal:isolated-generated',
          stableKey: 'isolated:generated',
          kind: 'isolated-cluster',
          title: 'isolated cluster',
          severity: 'low',
          confidence: 'low',
          modules: [
            'src/shared/assets/forge/demo/generated/src/api/users.ts',
            'src/shared/assets/forge/demo/generated/src/api/orders.ts',
          ],
          evidence: [
            {
              kind: 'heuristic',
              message: 'isolated-cluster legacy recommendation',
              confidence: 'low',
            },
          ],
        }),
      ],
    });

    const markdown = buildMarkdownReport(scan, null);
    const affectedAreas = markdown.slice(
      markdown.indexOf('## Affected areas'),
      markdown.indexOf('## Summary'),
    );

    expect(affectedAreas).toContain('| `app` | 1 | 1 |');
    expect(affectedAreas.indexOf('| `app` |')).toBeLessThan(
      affectedAreas.indexOf('| `shared/assets` |'),
    );
    expect(markdown).not.toContain('Review isolated cluster');
    expect(markdown).not.toContain('isolated-cluster legacy recommendation');
    expect(affectedAreas).toContain('| `shared/assets` | 2 | 0 |');
    expect(markdown).toContain('| Hidden generated-only findings | 1 |');
  });

  it('keeps broad approximate glob loaders out of hotspot-first report sections', () => {
    const scan = makeScan({
      modules: [
        moduleNode('src/entities/fixture/index.ts'),
        ...Array.from({ length: 25 }, (_, i) =>
          moduleNode(`src/shared/assets/demo/generated/file${i}.ts`),
        ),
        moduleNode('src/app/router/index.ts'),
      ],
      edges: Array.from({ length: 25 }, (_, i) => ({
        from: 'src/entities/fixture/index.ts',
        to: `src/shared/assets/demo/generated/file${i}.ts`,
        kind: 'dynamic' as const,
        specifier: '@/shared/assets/demo/**/*',
        resolved: true,
        resolutionKind: 'glob' as const,
        confidence: 'low' as const,
        approximate: true,
      })),
      metrics: {
        'src/entities/fixture/index.ts': metric({
          fanOut: 25,
          hotnessScore: 250,
          couplingScore: 50,
        }),
        'src/app/router/index.ts': metric({ fanIn: 2, fanOut: 3 }),
      },
      hotZones: ['src/entities/fixture/index.ts', 'src/app/router/index.ts'],
    });

    const markdown = buildMarkdownReport(scan, null);

    expect(markdown).toContain(
      'Fix first | inspect impact for `src/app/router/index.ts` before changing its public surface |',
    );
    expect(markdown).toContain('archora impact --module src/app/router/index.ts');
    expect(markdown).not.toContain('Check impact for hotspot src/entities/fixture/index.ts');
  });
});

function makeScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/', detectedFramework: 'unknown' },
    modules: [],
    edges: [],
    cycles: [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: '2026-01-01T00:00:00.000Z',
    durationMs: 0,
    warnings: [],
    ...overrides,
  };
}

function moduleNode(
  id: string,
  overrides: Partial<ScanResult['modules'][number]> = {},
): ScanResult['modules'][number] {
  return {
    id,
    absPath: id,
    kind: 'unknown',
    language: 'ts',
    loc: 10,
    exports: [],
    isInfra: false,
    ...overrides,
  };
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

function signal(
  overrides: Partial<NonNullable<ScanResult['signals']>[number]> = {},
): NonNullable<ScanResult['signals']>[number] {
  return {
    id: overrides.stableKey ?? 'signal:contract',
    stableKey: 'contract:default',
    kind: 'contract-violation',
    title: 'Contract signal',
    severity: 'high',
    confidence: 'high',
    actionability: 'manual',
    status: 'new',
    maturity: 'stable',
    modules: ['src/a.ts'],
    evidence: [{ kind: 'contract', message: 'contract issue', confidence: 'high' }],
    limitations: [],
    ranking: { score: 10, reasons: [], noisePenalty: 0, noveltyBoost: 0 },
    ...overrides,
  };
}
