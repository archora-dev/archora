import { describe, expect, it } from 'vitest';
import {
  buildDynamicLoaderSnippet,
  buildGeneratedConfigSnippet,
  buildIgnoreSnippet,
  buildLayerOverrideSnippet,
  buildProjectPolicyPresetSnippet,
} from '../configSnippets';
import { buildInitialArchoraConfig, buildInitialArchoraConfigJson } from '../initConfig';
import type { LayerViolation, ScanResult } from '../../analyzer/types';

describe('config snippets', () => {
  it('builds a generated policy snippet that round-trips with loadArchoraConfig', () => {
    const text = buildGeneratedConfigSnippet({
      mode: 'classify',
      patterns: ['src/recruit/openapi/**'],
      presets: ['openapi'],
    });
    const parsed = JSON.parse(text) as { analysis: { generated: Record<string, unknown> } };
    expect(parsed.analysis.generated).toEqual({
      mode: 'classify',
      patterns: ['src/recruit/openapi/**'],
      presets: ['openapi'],
    });
  });

  it('drops empty patterns/presets in generated snippet', () => {
    const text = buildGeneratedConfigSnippet({ mode: 'exclude' });
    expect(JSON.parse(text)).toEqual({ analysis: { generated: { mode: 'exclude' } } });
  });

  it('dedupes and trims ignore patterns', () => {
    const text = buildIgnoreSnippet(['src/legacy/**', '  src/legacy/**  ', '', 'dist/**']);
    expect(JSON.parse(text)).toEqual({
      ignore: ['src/legacy/**', 'dist/**'],
    });
  });

  it('builds layerOverrides from violations, preferring the importer layer that hits the module most often', () => {
    const violations: LayerViolation[] = [
      violation('src/shared/api.ts', 'features'),
      violation('src/shared/api.ts', 'features'),
      violation('src/shared/api.ts', 'app'),
      violation('src/util.ts', 'app'),
    ];
    const text = buildLayerOverrideSnippet(violations);
    expect(JSON.parse(text)).toEqual({
      layerOverrides: {
        'src/shared/api.ts': 'features',
        'src/util.ts': 'app',
      },
    });
  });

  it('extracts dynamic loader templates from prefix/glob edges', () => {
    const scan: ScanResult = {
      ...minimalScan(),
      edges: [
        {
          from: 'src/main.ts',
          to: 'src/mfes/a.ts',
          kind: 'dynamic',
          specifier: './mfes/',
          resolved: true,
          resolutionKind: 'prefix',
        },
        {
          from: 'src/main.ts',
          to: 'src/mfes/b.ts',
          kind: 'dynamic',
          specifier: './mfes/',
          resolved: true,
          resolutionKind: 'prefix',
        },
        {
          from: 'src/x.ts',
          to: 'src/routes/y.ts',
          kind: 'static',
          specifier: './routes/*.ts',
          resolved: true,
          resolutionKind: 'glob',
        },
        {
          from: 'src/x.ts',
          to: 'src/util.ts',
          kind: 'static',
          specifier: './util',
          resolved: true,
          resolutionKind: 'literal',
        },
      ],
    };
    const parsed = JSON.parse(buildDynamicLoaderSnippet(scan)) as {
      dynamicLoaders: Array<Record<string, unknown>>;
    };
    expect(parsed.dynamicLoaders).toHaveLength(2);
    expect(parsed.dynamicLoaders[0]).toMatchObject({
      name: 'dynamic-loader-1',
      resolveAs: './mfes/{0}/index',
      description: 'Observed pattern: ./mfes/',
    });
    expect(parsed.dynamicLoaders[1]).toMatchObject({
      name: 'dynamic-loader-2',
      resolveAs: './routes/{0}.ts',
    });
  });

  it('returns an empty dynamicLoaders array when the scan has no dynamic edges', () => {
    const text = buildDynamicLoaderSnippet(minimalScan());
    expect(JSON.parse(text)).toEqual({ dynamicLoaders: [] });
  });

  it('builds common .archora.json policy presets', () => {
    const fsd = JSON.parse(buildProjectPolicyPresetSnippet('fsd')) as {
      contracts: { boundaries: Array<Record<string, unknown>> };
    };
    expect(
      fsd.contracts.boundaries.find((rule) => rule['name'] === 'features-isolation'),
    ).toMatchObject({
      name: 'features-isolation',
      from: 'src/features/*/**',
      to: 'src/features/*/**',
      mode: 'must-not',
      crossInstance: true,
    });

    const workspace = JSON.parse(buildProjectPolicyPresetSnippet('package-workspace')) as {
      contracts: { boundaries: Array<Record<string, unknown>> };
    };
    expect(
      workspace.contracts.boundaries.find((rule) => rule['name'] === 'packages-through-public-api'),
    ).toMatchObject({
      name: 'packages-through-public-api',
      from: 'packages/*/src/**',
      to: 'packages/*/src/**',
      mode: 'must-not',
      crossInstance: true,
    });
    expect(JSON.parse(buildProjectPolicyPresetSnippet('generated-openapi'))).toEqual({
      analysis: {
        generated: {
          mode: 'classify',
          presets: ['openapi', 'generated-folder'],
        },
      },
    });
  });

  it('builds a conservative init config for a Vite app', () => {
    const result = buildInitialArchoraConfig({
      files: ['vite.config.ts', 'src/main.ts', 'src/App.vue'],
      packageJsonText: JSON.stringify({ devDependencies: { vite: '^5.0.0' } }),
    });

    expect(result.detected).toContain('vite');
    expect(result.config.entryPoints).toEqual(['src/main.ts']);
    expect(result.config.ignore).toContain('dist/**');
    expect(result.config.signals).toMatchObject({
      insightLimit: 6,
      minInsightSeverity: 'medium',
      minInsightConfidence: 'medium',
    });
    expect(result.config.contracts).toBeUndefined();
  });

  it('adds workspace contracts only when workspace package entries are present', () => {
    const result = buildInitialArchoraConfig({
      files: ['packages/ui/src/index.ts', 'packages/app/src/index.ts'],
      packageJsonText: JSON.stringify({ workspaces: ['packages/*'] }),
    });

    expect(result.detected).toContain('workspace-packages');
    expect(result.config.entryPoints).toEqual([
      'packages/app/src/index.ts',
      'packages/ui/src/index.ts',
    ]);
    expect(result.config.contracts?.boundaries?.[0]).toMatchObject({
      name: 'packages-through-public-api',
      severity: 'warning',
    });
  });

  it('adds generated policy when generated API files are present', () => {
    const text = buildInitialArchoraConfigJson({
      files: ['src/main.ts', 'src/openapi/petstore.generated.ts'],
    });

    expect(JSON.parse(text)).toMatchObject({
      analysis: {
        generated: {
          mode: 'classify',
          presets: ['openapi', 'generated-folder'],
        },
      },
    });
  });
});

function violation(to: string, fromLayer: string): LayerViolation {
  return {
    edgeId: `${fromLayer}->${to}`,
    from: `src/${fromLayer}/x.ts`,
    to,
    fromLayer,
    toLayer: 'shared',
    severity: 'error',
  };
}

function minimalScan(): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/p', detectedFramework: 'vue' },
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
    scannedAt: '2026-05-12T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
  };
}
