import type { ArchoraConfig, GeneratedPolicy } from '../config/frontScopeConfig';
import type { LayerViolation, ScanResult } from '../analyzer/types';

export interface SnippetOptions {
  indent?: number;
}

const DEFAULT_INDENT = 2;

export type ProjectPolicyPreset = 'fsd' | 'package-workspace' | 'generated-openapi';

export function buildProjectPolicyPresetSnippet(
  preset: ProjectPolicyPreset,
  options: SnippetOptions = {},
): string {
  return JSON.stringify(projectPolicyPreset(preset), null, options.indent ?? DEFAULT_INDENT);
}

export function buildGeneratedConfigSnippet(
  policy: GeneratedPolicy,
  options: SnippetOptions = {},
): string {
  const block: Record<string, unknown> = { mode: policy.mode };
  if (policy.patterns && policy.patterns.length > 0) block['patterns'] = policy.patterns;
  if (policy.presets && policy.presets.length > 0) block['presets'] = policy.presets;
  return JSON.stringify({ analysis: { generated: block } }, null, options.indent ?? DEFAULT_INDENT);
}

export function buildIgnoreSnippet(
  patterns: readonly string[],
  options: SnippetOptions = {},
): string {
  return JSON.stringify(
    { ignore: dedupeNonEmpty(patterns) },
    null,
    options.indent ?? DEFAULT_INDENT,
  );
}

export function buildLayerOverrideSnippet(
  violations: readonly LayerViolation[],
  options: SnippetOptions = {},
): string {
  const counts = new Map<string, Map<string, number>>();
  for (const v of violations) {
    const byLayer = counts.get(v.to) ?? new Map<string, number>();
    byLayer.set(v.fromLayer, (byLayer.get(v.fromLayer) ?? 0) + 1);
    counts.set(v.to, byLayer);
  }
  const overrides: Record<string, string> = {};
  for (const [moduleId, byLayer] of counts) {
    const top = pickTop(byLayer);
    if (top) overrides[moduleId] = top;
  }
  return JSON.stringify({ layerOverrides: overrides }, null, options.indent ?? DEFAULT_INDENT);
}

export function buildDynamicLoaderSnippet(scan: ScanResult, options: SnippetOptions = {}): string {
  const seen = new Set<string>();
  const samples: { specifier: string; resolveAs: string }[] = [];
  for (const e of scan.edges) {
    if (e.resolutionKind !== 'prefix' && e.resolutionKind !== 'glob') continue;
    if (seen.has(e.specifier)) continue;
    seen.add(e.specifier);
    samples.push({ specifier: e.specifier, resolveAs: dynamicResolveTemplate(e.specifier) });
    if (samples.length >= 5) break;
  }
  const block = samples.map((s, i) => ({
    name: `dynamic-loader-${i + 1}`,
    resolveAs: s.resolveAs,
    description: `Observed pattern: ${s.specifier}`,
  }));
  return JSON.stringify({ dynamicLoaders: block }, null, options.indent ?? DEFAULT_INDENT);
}

function projectPolicyPreset(preset: ProjectPolicyPreset): ArchoraConfig {
  switch (preset) {
    case 'fsd':
      return {
        contracts: {
          boundaries: [
            {
              name: 'features-isolation',
              from: 'src/features/*/**',
              to: 'src/features/*/**',
              mode: 'must-not',
              crossInstance: true,
              severity: 'warning',
              description: 'Feature slices should talk through shared APIs, not sibling internals.',
            },
            {
              name: 'shared-not-ui-layers',
              from: 'src/shared/**',
              to: 'src/**',
              mode: 'must-not',
              except: ['src/shared/**'],
              severity: 'error',
              description: 'Shared code should stay independent from product layers.',
            },
          ],
        },
      };
    case 'package-workspace':
      return {
        contracts: {
          boundaries: [
            {
              name: 'packages-through-public-api',
              from: 'packages/*/src/**',
              to: 'packages/*/src/**',
              mode: 'must-not',
              crossInstance: true,
              except: ['packages/*/src/index.*'],
              severity: 'warning',
              description:
                'Workspace packages should consume sibling packages through public APIs.',
            },
          ],
          budgets: [
            {
              name: 'package-entry-fanout',
              module: 'packages/*/src/index.*',
              maxFanOut: 12,
              severity: 'warning',
              description: 'Package entry points should stay narrow enough to review.',
            },
          ],
        },
      };
    case 'generated-openapi':
      return {
        analysis: {
          generated: {
            mode: 'classify',
            presets: ['openapi', 'generated-folder'],
          },
        },
      };
  }
}

function dedupeNonEmpty(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function pickTop(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = -1;
  for (const [layer, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && layer.localeCompare(best) < 0)) {
      best = layer;
      bestCount = c;
    }
  }
  return best;
}

function dynamicResolveTemplate(specifier: string): string {
  const normalized = specifier.replace(/\\/g, '/');
  if (normalized.endsWith('/')) return `${normalized}{0}/index`;
  if (normalized.includes('*')) return normalized.replace(/\*+/g, '{0}');
  return `${normalized}/{0}/index`;
}
