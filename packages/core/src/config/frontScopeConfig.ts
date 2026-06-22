import type { FileSource } from '../analyzer/fileSource';
import type { SignalConfidence, SignalSeverity, Suppression } from '../analyzer/types';

// .archora.json - per-project tuning, all fields optional
export interface ArchoraConfig {
  entryPoints?: string[];
  // user-defined dynamic loaders: e.g. { name: 'load', resolveAs: './mfes/{0}/index' }
  dynamicLoaders?: DynamicLoaderConfig[];
  ignore?: string[];
  // glob -> layer
  layerOverrides?: Record<string, string>;
  // architectural contracts: boundaries, budgets, api-stability
  contracts?: ContractsConfig;
  // bundle-aware analysis thresholds. All fields optional.
  bundle?: BundleSettings;
  // Generated/OpenAPI policy. Build outputs are still skipped by discovery.
  analysis?: AnalysisConfig;
  // Signal trust layer: suppressions are persisted in project config.
  signals?: SignalConfig;
  // Project-level CI budget for architecture regressions.
  architectureBudget?: ArchitectureBudgetConfig;
}

export type ConfigDiagnosticSeverity = 'error' | 'warning';

export interface ConfigDiagnostic {
  file: string;
  path: string;
  severity: ConfigDiagnosticSeverity;
  message: string;
}

export interface LoadArchoraConfigResult {
  config: ArchoraConfig;
  diagnostics: ConfigDiagnostic[];
  file: string | null;
}

export interface AnalysisConfig {
  generated?: GeneratedPolicy;
}

export interface SignalConfig {
  suppressions?: Suppression[];
  insightLimit?: number;
  minInsightSeverity?: SignalSeverity;
  minInsightConfidence?: SignalConfidence;
}

export interface ArchitectureBudgetConfig {
  maxDebtScore?: number;
  maxCycles?: number;
  maxCriticalSignals?: number;
  maxContractErrors?: number;
  maxHotspotGrowth?: number;
}

export interface GeneratedPolicy {
  mode: 'exclude' | 'classify';
  patterns?: string[];
  presets?: GeneratedPreset[];
}

export type GeneratedPreset =
  | 'openapi'
  | 'generated-folder'
  | 'generated-suffix'
  | 'vendor'
  | 'rtk-query';

export const GENERATED_PRESETS: Readonly<Record<GeneratedPreset, readonly string[]>> = {
  openapi: ['**/openapi/**', '**/api-generated/**', '**/swagger/**'],
  'generated-folder': ['**/__generated__/**', '**/generated/**'],
  'generated-suffix': ['**/*.gen.ts', '**/*.generated.ts', '**/*.gen.js', '**/*.generated.js'],
  vendor: ['**/vendor/**', '**/third_party/**'],
  'rtk-query': ['**/*.api.ts', '**/queries-generated/**'],
};

export function resolveGeneratedPatterns(policy: GeneratedPolicy | undefined): string[] {
  if (!policy) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of policy.patterns ?? []) {
    if (typeof p !== 'string') continue;
    const trimmed = p.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  for (const preset of policy.presets ?? []) {
    const list = GENERATED_PRESETS[preset];
    if (!list) continue;
    for (const p of list) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export interface BundleSettings {
  /** Chunk size in bytes that triggers `heavy-chunk`. */
  heavyChunkBytes?: number;
  /** Module appearing in >= N chunks triggers `duplicate`. */
  duplicateMinChunks?: number;
  /** Module taking >= share of a heavy chunk triggers `solo-hot` (0..1). */
  soloHotShare?: number;
}

export interface DynamicLoaderConfig {
  name: string;
  argIndex?: number;
  // template; {0} is replaced with the literal arg
  resolveAs: string;
}

/**
 * "Architecture as code". The whole block is opt-in - omitting it (or any of
 * its sub-fields) keeps the analyzer behaviour unchanged.
 */
export interface ContractsConfig {
  boundaries?: BoundaryRule[];
  budgets?: BudgetRule[];
  /**
   * "Frozen" public surfaces. The full breaking-change check lives behind
   * `apiDiff`; for now we only parse the schema so users can declare intent.
   */
  apiStability?: ApiStabilityRule[];
}

/**
 * Forbid or whitelist edges crossing module boundaries. The DSL is two-sided:
 *
 *   - `from`: whose outgoing edges this rule controls (glob).
 *   - `mode: 'must-not'` + `to`: from-modules may NOT import to-modules.
 *   - `mode: 'can-only'` + `to`: from-modules may import only to-modules
 *     (anything else is a violation).
 *   - `except`: globs (matched against the `to` module id) that whitelist
 *     specific exceptions, applied AFTER the rule predicate.
 *
 * Internal (same-module) imports never violate, because gigs would force users
 * to add `except: ['features/auth/**']` for every features-internal rule.
 */
export interface BoundaryRule {
  /** Stable identifier for diagnostics (CLI output, UI grouping). */
  name: string;
  /** Glob (gitignore-style) matching the importing module ids. */
  from: string;
  mode: 'must-not' | 'can-only';
  /** Glob matching the imported module ids. */
  to: string;
  /** Optional whitelist (glob list), applied to the importee. */
  except?: string[];
  /**
   * "Sibling isolation" knob. When `true` AND the rule is shaped like
   * `features/*\/**` ↔ `features/*\/**`, the engine treats the wildcard
   * segment as an instance identifier and only flags edges where the
   * `from`-side and `to`-side instances differ. Internal-to-feature edges
   * (`features/auth/index.ts → features/auth/lib/x.ts`) pass through.
   *
   * Defaults to `false`. Without it, `must-not` rules with the same `from`
   * and `to` pattern would flood the report with intra-feature noise.
   */
  crossInstance?: boolean;
  /** Free-form description shown in UI tooltips and CLI failure output. */
  description?: string;
  severity?: 'error' | 'warning';
}

/**
 * Numeric ceilings on per-module metrics. `module` is a glob; the rule trips
 * for every matched module that exceeds the bound.
 */
export interface BudgetRule {
  name: string;
  /** Glob matching module ids. */
  module: string;
  /** Maximum allowed `fanIn` (incoming edges). */
  maxFanIn?: number;
  /** Maximum allowed `fanOut` (outgoing edges). */
  maxFanOut?: number;
  /** Maximum lines-of-code (`module.loc`). */
  maxLoc?: number;
  /**
   * Maximum cycles touching any module under this glob. Useful to forbid
   * cycles in `shared/ui/**` while allowing them elsewhere.
   */
  maxCycles?: number;
  description?: string;
  severity?: 'error' | 'warning';
}

/**
 * Marks a public surface as "frozen". 6.2 only stores the declaration -
 * 6.4 (`semantic surface`) will compute the actual breaking-change diff.
 * Including the schema now lets users codify intent without waiting.
 */
export interface ApiStabilityRule {
  name: string;
  /** Glob (or single path) matching the public-surface module ids. */
  module: string;
  policy: 'frozen' | 'additions-only';
  description?: string;
}

const CONFIG_FILENAMES = ['.archora.json', 'archora.json'];

export async function loadArchoraConfig(source: FileSource): Promise<ArchoraConfig> {
  return (await loadArchoraConfigWithDiagnostics(source)).config;
}

export async function loadArchoraConfigWithDiagnostics(
  source: FileSource,
): Promise<LoadArchoraConfigResult> {
  for (const candidate of CONFIG_FILENAMES) {
    if (await source.exists(candidate)) {
      try {
        const raw = await source.read(candidate);
        const parsed = JSON.parse(raw) as unknown;
        const diagnostics: ConfigDiagnostic[] = [];
        const config = normalizeConfig(parsed, diagnostics, candidate);
        return { config, diagnostics, file: candidate };
      } catch (err) {
        return {
          config: {},
          file: candidate,
          diagnostics: [
            {
              file: candidate,
              path: '$',
              severity: 'error',
              message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  }
  return { config: {}, diagnostics: [], file: null };
}

function normalizeConfig(
  raw: unknown,
  diagnostics: ConfigDiagnostic[] = [],
  file = '.archora.json',
): ArchoraConfig {
  if (!raw || typeof raw !== 'object') {
    diagnostics.push({
      file,
      path: '$',
      severity: 'error',
      message: 'Configuration root must be an object.',
    });
    return {};
  }
  const r = raw as Record<string, unknown>;
  const out: ArchoraConfig = {};
  for (const key of Object.keys(r)) {
    if (
      ![
        'entryPoints',
        'dynamicLoaders',
        'ignore',
        'layerOverrides',
        'contracts',
        'bundle',
        'analysis',
        'signals',
        'architectureBudget',
      ].includes(key)
    ) {
      diagnostics.push({
        file,
        path: `$.${key}`,
        severity: 'warning',
        message: 'Unknown config field. It will be ignored.',
      });
    }
  }
  if (Array.isArray(r['entryPoints'])) {
    out.entryPoints = r['entryPoints'].filter((x): x is string => typeof x === 'string');
  } else if (r['entryPoints'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.entryPoints',
      severity: 'warning',
      message: 'Expected an array of module paths.',
    });
  }
  if (Array.isArray(r['ignore'])) {
    out.ignore = r['ignore'].filter((x): x is string => typeof x === 'string');
  } else if (r['ignore'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.ignore',
      severity: 'warning',
      message: 'Expected an array of glob patterns.',
    });
  }
  if (r['layerOverrides'] && typeof r['layerOverrides'] === 'object') {
    const overrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(r['layerOverrides'] as Record<string, unknown>)) {
      if (typeof v === 'string') overrides[k] = v;
    }
    out.layerOverrides = overrides;
  } else if (r['layerOverrides'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.layerOverrides',
      severity: 'warning',
      message: 'Expected an object of glob-to-layer mappings.',
    });
  }
  if (Array.isArray(r['dynamicLoaders'])) {
    const loaders: DynamicLoaderConfig[] = [];
    for (const [index, d] of (r['dynamicLoaders'] as unknown[]).entries()) {
      if (!d || typeof d !== 'object') {
        diagnostics.push({
          file,
          path: `$.dynamicLoaders[${index}]`,
          severity: 'warning',
          message: 'Expected an object with name and resolveAs.',
        });
        continue;
      }
      const dr = d as Record<string, unknown>;
      const name = typeof dr['name'] === 'string' ? dr['name'] : null;
      const resolveAs = typeof dr['resolveAs'] === 'string' ? dr['resolveAs'] : null;
      if (!name || !resolveAs) {
        diagnostics.push({
          file,
          path: `$.dynamicLoaders[${index}]`,
          severity: 'warning',
          message: 'Dynamic loader requires string name and resolveAs.',
        });
        continue;
      }
      const argIndex = typeof dr['argIndex'] === 'number' ? dr['argIndex'] : 0;
      loaders.push({ name, resolveAs, argIndex });
    }
    if (loaders.length > 0) out.dynamicLoaders = loaders;
  } else if (r['dynamicLoaders'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.dynamicLoaders',
      severity: 'warning',
      message: 'Expected an array of dynamic loader rules.',
    });
  }
  if (r['contracts'] && typeof r['contracts'] === 'object') {
    const contracts = normalizeContracts(
      r['contracts'] as Record<string, unknown>,
      diagnostics,
      file,
      '$.contracts',
    );
    if (contracts) out.contracts = contracts;
  } else if (r['contracts'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.contracts',
      severity: 'warning',
      message: 'Expected an object with boundaries, budgets or apiStability arrays.',
    });
  }
  if (r['bundle'] && typeof r['bundle'] === 'object') {
    const bundle = normalizeBundle(r['bundle'] as Record<string, unknown>, diagnostics, file);
    if (bundle) out.bundle = bundle;
  } else if (r['bundle'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.bundle',
      severity: 'warning',
      message: 'Expected an object with bundle thresholds.',
    });
  }
  if (r['analysis'] && typeof r['analysis'] === 'object') {
    const analysis = normalizeAnalysis(r['analysis'] as Record<string, unknown>, diagnostics, file);
    if (analysis) out.analysis = analysis;
  } else if (r['analysis'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.analysis',
      severity: 'warning',
      message: 'Expected an object with analysis options.',
    });
  }
  if (r['signals'] && typeof r['signals'] === 'object') {
    const signals = normalizeSignals(r['signals'] as Record<string, unknown>, diagnostics, file);
    if (signals) out.signals = signals;
  } else if (r['signals'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.signals',
      severity: 'warning',
      message: 'Expected an object with signal suppressions.',
    });
  }
  if (r['architectureBudget'] && typeof r['architectureBudget'] === 'object') {
    const budget = normalizeArchitectureBudget(
      r['architectureBudget'] as Record<string, unknown>,
      diagnostics,
      file,
    );
    if (budget) out.architectureBudget = budget;
  } else if (r['architectureBudget'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.architectureBudget',
      severity: 'warning',
      message: 'Expected an object with architecture budget thresholds.',
    });
  }
  return out;
}

function normalizeArchitectureBudget(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[],
  file: string,
): ArchitectureBudgetConfig | null {
  const out: ArchitectureBudgetConfig = {};
  const fields: Array<keyof ArchitectureBudgetConfig> = [
    'maxDebtScore',
    'maxCycles',
    'maxCriticalSignals',
    'maxContractErrors',
    'maxHotspotGrowth',
  ];
  for (const field of fields) {
    const value = raw[field];
    if (value === undefined) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[field] = value;
      continue;
    }
    diagnostics.push({
      file,
      path: `$.architectureBudget.${field}`,
      severity: 'warning',
      message: 'Expected a non-negative number.',
    });
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeSignals(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[],
  file: string,
): SignalConfig | null {
  const out: SignalConfig = {};
  if (typeof raw['insightLimit'] === 'number' && Number.isInteger(raw['insightLimit'])) {
    if (raw['insightLimit'] >= 0) out.insightLimit = raw['insightLimit'];
  } else if (raw['insightLimit'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.signals.insightLimit',
      severity: 'warning',
      message: 'Expected a non-negative integer insight limit.',
    });
  }
  if (isSignalSeverity(raw['minInsightSeverity'])) {
    out.minInsightSeverity = raw['minInsightSeverity'];
  } else if (raw['minInsightSeverity'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.signals.minInsightSeverity',
      severity: 'warning',
      message: 'Expected info, low, medium, high or critical.',
    });
  }
  if (isSignalConfidence(raw['minInsightConfidence'])) {
    out.minInsightConfidence = raw['minInsightConfidence'];
  } else if (raw['minInsightConfidence'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.signals.minInsightConfidence',
      severity: 'warning',
      message: 'Expected low, medium or high.',
    });
  }
  if (Array.isArray(raw['suppressions'])) {
    const suppressions: Suppression[] = [];
    for (const [index, item] of (raw['suppressions'] as unknown[]).entries()) {
      const suppression = normalizeSuppression(item);
      if (suppression) {
        suppressions.push(suppression);
      } else {
        diagnostics.push({
          file,
          path: `$.signals.suppressions[${index}]`,
          severity: 'warning',
          message: 'Signal suppression requires stableKey and reason.',
        });
      }
    }
    if (suppressions.length > 0) out.suppressions = suppressions;
  } else if (raw['suppressions'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.signals.suppressions',
      severity: 'warning',
      message: 'Expected an array of signal suppressions.',
    });
  }
  return out.suppressions ||
    out.insightLimit !== undefined ||
    out.minInsightSeverity ||
    out.minInsightConfidence
    ? out
    : null;
}

function isSignalSeverity(value: unknown): value is SignalSeverity {
  return (
    value === 'info' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'critical'
  );
}

function isSignalConfidence(value: unknown): value is SignalConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function normalizeSuppression(raw: unknown): Suppression | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const stableKey = typeof r['stableKey'] === 'string' ? r['stableKey'].trim() : '';
  const reason = typeof r['reason'] === 'string' ? r['reason'].trim() : '';
  if (!stableKey || !reason) return null;
  const out: Suppression = { stableKey, reason };
  if (r['scope'] === 'project' || r['scope'] === 'module' || r['scope'] === 'rule') {
    out.scope = r['scope'];
  }
  if (typeof r['moduleId'] === 'string' && r['moduleId'].trim()) {
    out.moduleId = r['moduleId'].trim();
  }
  if (typeof r['createdAt'] === 'string' && r['createdAt'].trim()) {
    out.createdAt = r['createdAt'].trim();
  }
  if (typeof r['expiresAt'] === 'string' && r['expiresAt'].trim()) {
    out.expiresAt = r['expiresAt'].trim();
  }
  return out;
}

function normalizeAnalysis(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[],
  file: string,
): AnalysisConfig | null {
  const out: AnalysisConfig = {};
  if (raw['generated'] && typeof raw['generated'] === 'object') {
    const policy = normalizeGenerated(
      raw['generated'] as Record<string, unknown>,
      diagnostics,
      file,
      '$.analysis.generated',
    );
    if (policy) out.generated = policy;
  } else if (raw['generated'] !== undefined) {
    diagnostics.push({
      file,
      path: '$.analysis.generated',
      severity: 'warning',
      message: 'Expected an object with mode and patterns or presets.',
    });
  }
  return out.generated ? out : null;
}

const VALID_PRESETS: ReadonlySet<GeneratedPreset> = new Set([
  'openapi',
  'generated-folder',
  'generated-suffix',
  'vendor',
  'rtk-query',
]);

function normalizeGenerated(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[],
  file: string,
  path: string,
): GeneratedPolicy | null {
  // Keep the first Settings snippet key working for copied configs.
  const rawMode = raw['mode'];
  let mode: GeneratedPolicy['mode'];
  if (rawMode === 'exclude') mode = 'exclude';
  else if (rawMode === 'classify' || rawMode === 'classifyAsGenerated') mode = 'classify';
  else {
    diagnostics.push({
      file,
      path: `${path}.mode`,
      severity: 'warning',
      message: 'Expected "exclude" or "classify".',
    });
    return null;
  }

  const patterns = Array.isArray(raw['patterns'])
    ? (raw['patterns'] as unknown[]).filter(
        (x): x is string => typeof x === 'string' && x.trim().length > 0,
      )
    : Array.isArray(raw['paths'])
      ? (raw['paths'] as unknown[]).filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        )
      : [];

  const presets = Array.isArray(raw['presets'])
    ? (raw['presets'] as unknown[]).filter((x): x is GeneratedPreset =>
        VALID_PRESETS.has(x as GeneratedPreset),
      )
    : [];
  if (Array.isArray(raw['presets'])) {
    for (const [index, preset] of (raw['presets'] as unknown[]).entries()) {
      if (!VALID_PRESETS.has(preset as GeneratedPreset)) {
        diagnostics.push({
          file,
          path: `${path}.presets[${index}]`,
          severity: 'warning',
          message: 'Unknown generated preset. It will be ignored.',
        });
      }
    }
  }

  if (patterns.length === 0 && presets.length === 0) {
    diagnostics.push({
      file,
      path,
      severity: 'warning',
      message: 'Generated policy needs at least one pattern or preset.',
    });
    return null;
  }

  const out: GeneratedPolicy = { mode };
  if (patterns.length > 0) out.patterns = patterns;
  if (presets.length > 0) out.presets = presets;
  return out;
}

function normalizeBundle(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[],
  file: string,
): BundleSettings | null {
  const out: BundleSettings = {};
  if (typeof raw['heavyChunkBytes'] === 'number' && raw['heavyChunkBytes'] >= 0) {
    out.heavyChunkBytes = raw['heavyChunkBytes'];
  }
  if (typeof raw['duplicateMinChunks'] === 'number' && raw['duplicateMinChunks'] >= 2) {
    out.duplicateMinChunks = raw['duplicateMinChunks'];
  }
  if (
    typeof raw['soloHotShare'] === 'number' &&
    raw['soloHotShare'] > 0 &&
    raw['soloHotShare'] <= 1
  ) {
    out.soloHotShare = raw['soloHotShare'];
  }
  for (const [key, value] of Object.entries(raw)) {
    if (!['heavyChunkBytes', 'duplicateMinChunks', 'soloHotShare'].includes(key)) continue;
    if ((out as Record<string, unknown>)[key] !== undefined) continue;
    diagnostics.push({
      file,
      path: `$.bundle.${key}`,
      severity: 'warning',
      message: `Invalid bundle threshold value: ${String(value)}.`,
    });
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeContracts(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[],
  file: string,
  path: string,
): ContractsConfig | null {
  const out: ContractsConfig = {};
  if (Array.isArray(raw['boundaries'])) {
    const rules: BoundaryRule[] = [];
    for (const [index, r] of (raw['boundaries'] as unknown[]).entries()) {
      const rule = normalizeBoundary(r);
      if (rule) {
        rules.push(rule);
      } else {
        diagnostics.push({
          file,
          path: `${path}.boundaries[${index}]`,
          severity: 'warning',
          message: 'Boundary rule requires name, from, to and mode.',
        });
      }
    }
    if (rules.length > 0) out.boundaries = rules;
  } else if (raw['boundaries'] !== undefined) {
    diagnostics.push({
      file,
      path: `${path}.boundaries`,
      severity: 'warning',
      message: 'Expected an array of boundary rules.',
    });
  }
  if (Array.isArray(raw['budgets'])) {
    const rules: BudgetRule[] = [];
    for (const [index, r] of (raw['budgets'] as unknown[]).entries()) {
      const rule = normalizeBudget(r);
      if (rule) {
        rules.push(rule);
      } else {
        diagnostics.push({
          file,
          path: `${path}.budgets[${index}]`,
          severity: 'warning',
          message: 'Budget rule requires name, module and at least one numeric ceiling.',
        });
      }
    }
    if (rules.length > 0) out.budgets = rules;
  } else if (raw['budgets'] !== undefined) {
    diagnostics.push({
      file,
      path: `${path}.budgets`,
      severity: 'warning',
      message: 'Expected an array of budget rules.',
    });
  }
  if (Array.isArray(raw['apiStability'])) {
    const rules: ApiStabilityRule[] = [];
    for (const [index, r] of (raw['apiStability'] as unknown[]).entries()) {
      const rule = normalizeApiStability(r);
      if (rule) {
        rules.push(rule);
      } else {
        diagnostics.push({
          file,
          path: `${path}.apiStability[${index}]`,
          severity: 'warning',
          message: 'API stability rule requires name, module and policy.',
        });
      }
    }
    if (rules.length > 0) out.apiStability = rules;
  } else if (raw['apiStability'] !== undefined) {
    diagnostics.push({
      file,
      path: `${path}.apiStability`,
      severity: 'warning',
      message: 'Expected an array of API stability rules.',
    });
  }
  return out.boundaries || out.budgets || out.apiStability ? out : null;
}

function normalizeBoundary(raw: unknown): BoundaryRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? r['name'] : null;
  const from = typeof r['from'] === 'string' ? r['from'] : null;
  const to = typeof r['to'] === 'string' ? r['to'] : null;
  const mode = r['mode'] === 'must-not' || r['mode'] === 'can-only' ? r['mode'] : null;
  if (!name || !from || !to || !mode) return null;
  const out: BoundaryRule = { name, from, to, mode };
  if (Array.isArray(r['except'])) {
    out.except = (r['except'] as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  if (r['crossInstance'] === true) out.crossInstance = true;
  if (typeof r['description'] === 'string') out.description = r['description'];
  if (r['severity'] === 'error' || r['severity'] === 'warning') out.severity = r['severity'];
  return out;
}

function normalizeBudget(raw: unknown): BudgetRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? r['name'] : null;
  const module_ = typeof r['module'] === 'string' ? r['module'] : null;
  if (!name || !module_) return null;
  const out: BudgetRule = { name, module: module_ };
  // Camel and kebab forms accepted - the YAML example in PLAN uses kebab.
  const maxFanIn = numericField(r, ['maxFanIn', 'max-fan-in']);
  if (maxFanIn !== null) out.maxFanIn = maxFanIn;
  const maxFanOut = numericField(r, ['maxFanOut', 'max-fan-out']);
  if (maxFanOut !== null) out.maxFanOut = maxFanOut;
  const maxLoc = numericField(r, ['maxLoc', 'max-loc']);
  if (maxLoc !== null) out.maxLoc = maxLoc;
  const maxCycles = numericField(r, ['maxCycles', 'max-cycles']);
  if (maxCycles !== null) out.maxCycles = maxCycles;
  if (typeof r['description'] === 'string') out.description = r['description'];
  if (r['severity'] === 'error' || r['severity'] === 'warning') out.severity = r['severity'];
  // A budget with no numeric ceiling is meaningless; drop it.
  if (
    out.maxFanIn === undefined &&
    out.maxFanOut === undefined &&
    out.maxLoc === undefined &&
    out.maxCycles === undefined
  ) {
    return null;
  }
  return out;
}

function normalizeApiStability(raw: unknown): ApiStabilityRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? r['name'] : null;
  const module_ = typeof r['module'] === 'string' ? r['module'] : null;
  const policy = r['policy'] === 'frozen' || r['policy'] === 'additions-only' ? r['policy'] : null;
  if (!name || !module_ || !policy) return null;
  const out: ApiStabilityRule = { name, module: module_, policy };
  if (typeof r['description'] === 'string') out.description = r['description'];
  return out;
}

function numericField(r: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}
