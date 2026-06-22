import type { ArchoraConfig } from '../config/frontScopeConfig';

export interface BuildInitialArchoraConfigInput {
  files: readonly string[];
  packageJsonText?: string;
}

export interface InitialArchoraConfigResult {
  config: ArchoraConfig;
  detected: InitialArchoraDetection[];
}

export type InitialArchoraDetection =
  | 'vite'
  | 'next'
  | 'nuxt'
  | 'sveltekit'
  | 'workspace-packages'
  | 'generated-openapi';

/** Canonical JSON Schema URL written into generated configs for editor support. */
export const ARCHORA_CONFIG_SCHEMA_URL = 'https://docs.archora.dev/archora.schema.json';

const DEFAULT_IGNORES = [
  'dist/**',
  'build/**',
  'coverage/**',
  '.next/**',
  '.nuxt/**',
  '.svelte-kit/**',
];

const ENTRY_CANDIDATES = [
  'src/main.ts',
  'src/main.tsx',
  'src/main.js',
  'src/main.jsx',
  'src/App.tsx',
  'src/App.jsx',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/pages/_app.tsx',
  'src/pages/index.tsx',
  'src/routes/+layout.svelte',
  'src/routes/+page.svelte',
  'app/layout.tsx',
  'app/page.tsx',
  'pages/_app.tsx',
  'pages/index.tsx',
  'pages/index.vue',
];

export function buildInitialArchoraConfig(
  input: BuildInitialArchoraConfigInput,
): InitialArchoraConfigResult {
  const files = normalizeFiles(input.files);
  const fileSet = new Set(files);
  const packageJson = parsePackageJson(input.packageJsonText);
  const detected = detectProjectShape(fileSet, packageJson);

  const config: ArchoraConfig = {
    $schema: ARCHORA_CONFIG_SCHEMA_URL,
    entryPoints: pickEntryPoints(files, fileSet, detected),
    ignore: DEFAULT_IGNORES,
    signals: {
      insightLimit: 6,
      minInsightSeverity: 'medium',
      minInsightConfidence: 'medium',
    },
  };

  if (detected.includes('generated-openapi')) {
    config.analysis = {
      generated: {
        mode: 'classify',
        presets: ['openapi', 'generated-folder'],
      },
    };
  }

  if (detected.includes('workspace-packages')) {
    config.contracts = {
      boundaries: [
        {
          name: 'packages-through-public-api',
          from: 'packages/*/src/**',
          to: 'packages/*/src/**',
          mode: 'must-not',
          crossInstance: true,
          except: ['packages/*/src/index.*'],
          severity: 'warning',
          description: 'Workspace packages should consume sibling packages through public APIs.',
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
    };
  }

  return { config, detected };
}

export function buildInitialArchoraConfigJson(
  input: BuildInitialArchoraConfigInput,
  indent = 2,
): string {
  return `${JSON.stringify(buildInitialArchoraConfig(input).config, null, indent)}\n`;
}

function normalizeFiles(files: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of files) {
    const rel = raw.replace(/\\/g, '/').replace(/^\.?\//u, '');
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function parsePackageJson(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function detectProjectShape(
  files: ReadonlySet<string>,
  packageJson: Record<string, unknown> | null,
): InitialArchoraDetection[] {
  const deps = collectDependencies(packageJson);
  const detected: InitialArchoraDetection[] = [];

  if (deps.has('vite') || files.has('vite.config.ts') || files.has('vite.config.js')) {
    detected.push('vite');
  }
  if (deps.has('next') || files.has('next.config.js') || files.has('next.config.ts')) {
    detected.push('next');
  }
  if (deps.has('nuxt') || files.has('nuxt.config.ts') || files.has('nuxt.config.js')) {
    detected.push('nuxt');
  }
  if (deps.has('@sveltejs/kit') || files.has('svelte.config.js') || files.has('svelte.config.ts')) {
    detected.push('sveltekit');
  }
  if (hasWorkspacePackages(files, packageJson)) {
    detected.push('workspace-packages');
  }
  if ([...files].some(isGeneratedApiPath)) {
    detected.push('generated-openapi');
  }

  return detected;
}

function collectDependencies(packageJson: Record<string, unknown> | null): Set<string> {
  const deps = new Set<string>();
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const block = packageJson?.[key];
    if (!block || typeof block !== 'object') continue;
    for (const name of Object.keys(block as Record<string, unknown>)) deps.add(name);
  }
  return deps;
}

function hasWorkspacePackages(
  files: ReadonlySet<string>,
  packageJson: Record<string, unknown> | null,
): boolean {
  const workspaces = packageJson?.['workspaces'];
  const hasWorkspaceField =
    Array.isArray(workspaces) ||
    Boolean(
      workspaces &&
      typeof workspaces === 'object' &&
      Array.isArray((workspaces as Record<string, unknown>)['packages']),
    );
  if (!hasWorkspaceField) return false;
  return [...files].some((file) => /^packages\/[^/]+\/src\/index\.[cm]?[jt]sx?$/u.test(file));
}

function pickEntryPoints(
  files: readonly string[],
  fileSet: ReadonlySet<string>,
  detected: readonly InitialArchoraDetection[],
): string[] {
  const entries: string[] = [];
  for (const candidate of ENTRY_CANDIDATES) {
    if (fileSet.has(candidate)) entries.push(candidate);
  }
  if (detected.includes('workspace-packages')) {
    entries.push(
      ...files.filter((file) => /^packages\/[^/]+\/src\/index\.[cm]?[jt]sx?$/u.test(file)),
    );
  }
  return dedupe(entries);
}

function isGeneratedApiPath(file: string): boolean {
  return (
    /(^|\/)(openapi|api-generated|swagger|__generated__|generated)\//u.test(file) ||
    /\.(gen|generated)\.[cm]?[jt]sx?$/u.test(file)
  );
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
