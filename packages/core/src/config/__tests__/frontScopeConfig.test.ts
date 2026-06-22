import { describe, expect, it } from 'vitest';
import {
  loadArchoraConfig,
  loadArchoraConfigWithDiagnostics,
  resolveGeneratedPatterns,
  GENERATED_PRESETS,
} from '../frontScopeConfig';
import type { FileSource } from '../../analyzer/fileSource';

describe('frontScopeConfig analysis.generated', () => {
  it('parses kebab mode + patterns + presets and dedupes', async () => {
    const cfg = await loadArchoraConfig(
      mockSource({
        '.archora.json': JSON.stringify({
          analysis: {
            generated: {
              mode: 'classify',
              patterns: ['src/recruit/openapi/**', '  ', '**/openapi/**'],
              presets: ['openapi', 'unknown-preset', 'vendor'],
            },
          },
        }),
      }),
    );

    expect(cfg.analysis?.generated?.mode).toBe('classify');
    expect(cfg.analysis?.generated?.patterns).toEqual(['src/recruit/openapi/**', '**/openapi/**']);
    expect(cfg.analysis?.generated?.presets).toEqual(['openapi', 'vendor']);
  });

  it('accepts the legacy `classifyAsGenerated` mode + `paths` shape from the Settings UI snippet', async () => {
    const cfg = await loadArchoraConfig(
      mockSource({
        '.archora.json': JSON.stringify({
          analysis: {
            generated: {
              mode: 'classifyAsGenerated',
              paths: ['src/api-generated/**'],
            },
          },
        }),
      }),
    );

    expect(cfg.analysis?.generated?.mode).toBe('classify');
    expect(cfg.analysis?.generated?.patterns).toEqual(['src/api-generated/**']);
  });

  it('drops the policy when neither patterns nor presets are present', async () => {
    const cfg = await loadArchoraConfig(
      mockSource({
        '.archora.json': JSON.stringify({
          analysis: { generated: { mode: 'classify' } },
        }),
      }),
    );
    expect(cfg.analysis).toBeUndefined();
  });

  it('returns diagnostics for invalid config fields without throwing', async () => {
    const result = await loadArchoraConfigWithDiagnostics(
      mockSource({
        '.archora.json': JSON.stringify({
          unknownField: true,
          ignore: 'dist/**',
          analysis: { generated: { mode: 'classify', presets: ['bad-preset'] } },
          contracts: { budgets: [{ name: 'shared-budget', module: 'src/shared/**' }] },
        }),
      }),
    );

    expect(result.config.ignore).toBeUndefined();
    expect(result.file).toBe('.archora.json');
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        '$.unknownField',
        '$.ignore',
        '$.analysis.generated.presets[0]',
        '$.contracts.budgets[0]',
      ]),
    );
  });

  it('parses signal suppressions from project config', async () => {
    const cfg = await loadArchoraConfig(
      mockSource({
        '.archora.json': JSON.stringify({
          signals: {
            insightLimit: 4,
            minInsightSeverity: 'high',
            minInsightConfidence: 'high',
            suppressions: [
              {
                stableKey: 'contract:shared-boundary',
                reason: 'Accepted until shared API extraction lands.',
                scope: 'module',
                moduleId: 'src/shared/api/client.ts',
                createdAt: '2026-05-22T00:00:00.000Z',
                expiresAt: '2026-06-22T00:00:00.000Z',
              },
            ],
          },
        }),
      }),
    );

    expect(cfg.signals?.suppressions?.[0]).toMatchObject({
      stableKey: 'contract:shared-boundary',
      reason: 'Accepted until shared API extraction lands.',
      scope: 'module',
      moduleId: 'src/shared/api/client.ts',
    });
    expect(cfg.signals).toMatchObject({
      insightLimit: 4,
      minInsightSeverity: 'high',
      minInsightConfidence: 'high',
    });
  });

  it('parses architecture budget thresholds from project config', async () => {
    const cfg = await loadArchoraConfig(
      mockSource({
        '.archora.json': JSON.stringify({
          architectureBudget: {
            maxDebtScore: 35,
            maxCycles: 0,
            maxCriticalSignals: 0,
            maxContractErrors: 0,
            maxHotspotGrowth: 2,
          },
        }),
      }),
    );

    expect(cfg.architectureBudget).toEqual({
      maxDebtScore: 35,
      maxCycles: 0,
      maxCriticalSignals: 0,
      maxContractErrors: 0,
      maxHotspotGrowth: 2,
    });
  });

  it('reports invalid JSON as a config diagnostic', async () => {
    const result = await loadArchoraConfigWithDiagnostics(
      mockSource({
        '.archora.json': '{',
      }),
    );

    expect(result.config).toEqual({});
    expect(result.file).toBe('.archora.json');
    expect(result.diagnostics[0]).toMatchObject({
      file: '.archora.json',
      path: '$',
      severity: 'error',
    });
  });

  it('reports absent rules config without diagnostics', async () => {
    const result = await loadArchoraConfigWithDiagnostics(mockSource({}));

    expect(result.config).toEqual({});
    expect(result.file).toBeNull();
    expect(result.diagnostics).toEqual([]);
  });

  it('expands presets in declaration order, user patterns first', () => {
    const out = resolveGeneratedPatterns({
      mode: 'classify',
      patterns: ['src/recruit/openapi/**'],
      presets: ['openapi', 'generated-folder'],
    });
    expect(out[0]).toBe('src/recruit/openapi/**');
    for (const p of GENERATED_PRESETS.openapi) expect(out).toContain(p);
    for (const p of GENERATED_PRESETS['generated-folder']) expect(out).toContain(p);
  });
});

function mockSource(files: Record<string, string>): FileSource {
  return {
    rootPath: '/repo',
    list: async () => Object.keys(files),
    read: async (p) => files[p] ?? '',
    exists: async (p) => p in files,
  };
}
