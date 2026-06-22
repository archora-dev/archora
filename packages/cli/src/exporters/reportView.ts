import { canSignalFailCi, type Recommendation, type ScanResult } from '@archora/core';

export type ReportSignal = NonNullable<ScanResult['signals']>[number];
export type ReportStatus = 'clean' | 'review' | 'blocking';

export interface ReportAffectedArea {
  area: string;
  modules: number;
  findings: number;
  riskScore: number;
}

export interface ReportChecklistItem {
  label: string;
  evidence: string;
}

export interface ReportHotspotAction {
  summary: string;
  checklistLabel: string;
  evidence: string;
}

export function isFixtureOnly(modules: readonly string[]): boolean {
  return modules.length > 0 && modules.every(isFixturePath);
}

export function isFixturePath(path: string): boolean {
  return path === 'fixtures' || path.startsWith('fixtures/');
}

export function isGeneratedOnly(modules: readonly string[]): boolean {
  return modules.length > 0 && modules.every(isLikelyGeneratedPath);
}

export function isLikelyGeneratedPath(path: string): boolean {
  const normalized = path.replace(/\\/gu, '/');
  return (
    /(^|\/)(__generated__|generated)(\/|$)/u.test(normalized) ||
    /\.(gen|generated)\.[cm]?[jt]sx?$/u.test(normalized)
  );
}

export function reportRecommendations(scan: ScanResult): Recommendation[] {
  return scan.recommendations.filter(
    (recommendation) =>
      !isFixtureOnly(recommendation.modules) && !isGeneratedOnly(recommendation.modules),
  );
}

export function reportCycles(scan: ScanResult): ScanResult['cycles'] {
  return scan.cycles.filter((cycle) => !isFixtureOnly(cycle.modules));
}

export function reportHotZones(scan: ScanResult): string[] {
  return scan.hotZones.filter(
    (id) =>
      !isFixturePath(id) && !isLikelyGeneratedPath(id) && !isBroadApproximateGlobLoader(scan, id),
  );
}

export function reportLayerViolations(scan: ScanResult): ScanResult['layerViolations'] {
  return scan.layerViolations.filter(
    (violation) => !isFixturePath(violation.from) && !isFixturePath(violation.to),
  );
}

export function reportContractViolations(scan: ScanResult): ScanResult['contractViolations'] {
  return scan.contractViolations.filter((violation) => !isFixtureOnly(violation.modules));
}

export function reportSignals(scan: ScanResult): ReportSignal[] {
  return (scan.signals ?? [])
    .filter((signal) => !isFixtureOnly(signal.modules))
    .filter((signal) => !isGeneratedOnly(signal.modules) || signal.confidence === 'high')
    .sort((a, b) => b.ranking.score - a.ranking.score);
}

export function reportCiSignals(scan: ScanResult): ReportSignal[] {
  return reportSignals(scan).filter((signal) => canSignalFailCi(signal, { minSeverity: 'high' }));
}

export function signalReviewState(signal: ReportSignal): string {
  if (signal.suppressed) {
    return signal.suppressionReason ? `suppressed: ${signal.suppressionReason}` : 'suppressed';
  }
  return signal.status;
}

export function reportStatus(scan: ScanResult): ReportStatus {
  if ((scan.configDiagnostics ?? []).some((diagnostic) => diagnostic.severity === 'error')) {
    return 'blocking';
  }
  if (
    reportContractViolations(scan).some((violation) => violation.severity === 'error') ||
    reportLayerViolations(scan).some((violation) => violation.severity === 'error') ||
    reportCycles(scan).some((cycle) => cycle.severity === 'direct') ||
    scan.archDebt.grade === 'D' ||
    scan.archDebt.grade === 'F'
  ) {
    return 'blocking';
  }
  if (
    reportCycles(scan).length > 0 ||
    reportHotZones(scan).length > 0 ||
    reportSignals(scan).length > 0 ||
    scan.warnings.length > 0
  ) {
    return 'review';
  }
  return 'clean';
}

export function reportStatusLabel(status: ReportStatus): string {
  if (status === 'blocking') return 'blocking';
  if (status === 'review') return 'needs review';
  return 'clean';
}

export function reportAffectedAreas(scan: ScanResult): ReportAffectedArea[] {
  const areas = new Map<string, ReportAffectedArea & { ids: Set<string> }>();
  const findingModules = new Set<string>();
  const addModule = (id: string, finding = false): void => {
    if (isFixturePath(id)) return;
    const area = areaOf(id);
    const current = areas.get(area) ?? {
      area,
      modules: 0,
      findings: 0,
      riskScore: 0,
      ids: new Set<string>(),
    };
    if (!current.ids.has(id)) {
      current.ids.add(id);
      current.modules++;
      const metrics = scan.metrics[id];
      current.riskScore +=
        (metrics?.hotnessScore ?? 0) +
        (metrics?.couplingScore ?? 0) +
        (metrics?.fanIn ?? 0) +
        (metrics?.fanOut ?? 0);
    }
    if (finding && !findingModules.has(id)) {
      findingModules.add(id);
      current.findings++;
      current.riskScore += 10;
    }
    areas.set(area, current);
  };

  for (const module of scan.modules) addModule(module.id);
  for (const id of reportHotZones(scan)) addModule(id, true);
  for (const cycle of reportCycles(scan)) {
    for (const id of cycle.modules) addModule(id, true);
  }
  for (const violation of reportLayerViolations(scan)) {
    addModule(violation.from, true);
    addModule(violation.to, true);
  }
  for (const violation of reportContractViolations(scan)) {
    for (const id of violation.modules) addModule(id, true);
    if (violation.edge) {
      addModule(violation.edge.from, true);
      addModule(violation.edge.to, true);
    }
  }

  return [...areas.values()]
    .map(({ ids: _ids, ...area }) => area)
    .sort(
      (a, b) =>
        b.findings - a.findings || b.riskScore - a.riskScore || a.area.localeCompare(b.area),
    );
}

export function hiddenFixtureFindingCount(scan: ScanResult): number {
  return (
    scan.recommendations.filter((recommendation) => isFixtureOnly(recommendation.modules)).length +
    scan.cycles.filter((cycle) => isFixtureOnly(cycle.modules)).length +
    scan.hotZones.filter(isFixturePath).length
  );
}

export function hiddenGeneratedFindingCount(scan: ScanResult): number {
  return scan.recommendations.filter((recommendation) => isGeneratedOnly(recommendation.modules))
    .length;
}

export function isBroadApproximateGlobLoader(scan: ScanResult, id: string): boolean {
  const outgoing = scan.edges.filter((edge) => edge.from === id);
  if (outgoing.length < 20) return false;
  const globEdges = outgoing.filter(
    (edge) => edge.resolutionKind === 'glob' && edge.approximate === true,
  );
  return globEdges.length / outgoing.length >= 0.8;
}

export function reportHotspotAction(scan: ScanResult, id: string): ReportHotspotAction {
  const metrics = scan.metrics[id];
  const fanIn = metrics?.fanIn ?? 0;
  const fanOut = metrics?.fanOut ?? 0;
  const summary = `inspect impact for \`${id}\` before changing its public surface`;
  const command = `archora impact --module ${id}`;
  const pressure =
    fanIn >= fanOut
      ? `fan-in ${fanIn}: check top importers before splitting or renaming exports`
      : `fan-out ${fanOut}: check outgoing dependencies before moving this module`;
  return {
    summary,
    checklistLabel: `Inspect impact for hotspot ${id}`,
    evidence: `${command}; ${pressure}.`,
  };
}

export function reportReviewChecklist(scan: ScanResult): ReportChecklistItem[] {
  const items: ReportChecklistItem[] = [];
  const configError = (scan.configDiagnostics ?? []).find(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (configError) {
    items.push({
      label: 'Fix rules config before trusting rule gates',
      evidence: `${configError.file}${configError.path}: ${configError.message}`,
    });
  }

  const contractError = reportContractViolations(scan).find(
    (violation) => violation.severity === 'error',
  );
  if (contractError) {
    items.push({
      label: `Resolve contract ${contractError.ruleName}`,
      evidence:
        contractError.edge != null
          ? `${contractError.edge.from} -> ${contractError.edge.to}`
          : contractError.modules.slice(0, 3).join(', '),
    });
  }

  const layerError = reportLayerViolations(scan).find(
    (violation) => violation.severity === 'error',
  );
  if (layerError) {
    items.push({
      label: `Move dependency behind allowed ${layerError.fromLayer} -> ${layerError.toLayer} boundary`,
      evidence: `${layerError.from} -> ${layerError.to}`,
    });
  }

  const directCycle = reportCycles(scan).find((cycle) => cycle.severity === 'direct');
  if (directCycle) {
    items.push({
      label: `Break direct cycle ${directCycle.id}`,
      evidence: directCycle.modules.slice(0, 4).join(' -> '),
    });
  }

  const ciSignal = reportCiSignals(scan)[0];
  if (ciSignal) {
    items.push({
      label: `Review CI-safe signal: ${ciSignal.title}`,
      evidence: ciSignal.evidence[0]?.message ?? ciSignal.modules.slice(0, 3).join(', '),
    });
  }

  const hotspot = reportHotZones(scan)[0];
  if (hotspot) {
    const action = reportHotspotAction(scan, hotspot);
    items.push({
      label: action.checklistLabel,
      evidence: action.evidence,
    });
  }

  return items.slice(0, 5);
}

function areaOf(id: string): string {
  const parts = id.replace(/\\/gu, '/').split('/').filter(Boolean);
  const packagesIndex = parts.indexOf('packages');
  if (packagesIndex !== -1 && parts[packagesIndex + 1]) {
    return `packages/${parts[packagesIndex + 1]}`;
  }
  const appsIndex = parts.indexOf('apps');
  if (appsIndex !== -1 && parts[appsIndex + 1]) {
    return `apps/${parts[appsIndex + 1]}`;
  }
  const srcIndex = parts.indexOf('src');
  const scope = srcIndex === -1 ? parts : parts.slice(srcIndex + 1);
  const first = scope[0];
  if (!first) return 'project';
  if (/^(App|app|main|index)\.[cm]?[jt]sx?$/u.test(first) || /^(App|app)\.vue$/u.test(first)) {
    return 'app';
  }
  if (isDomainRoot(first) && scope[1] && !isSourceFile(scope[1])) return `${first}/${scope[1]}`;
  return first.replace(/\.[^.]+$/u, '');
}

function isDomainRoot(part: string): boolean {
  return [
    'domains',
    'entities',
    'features',
    'mfes',
    'modules',
    'pages',
    'services',
    'shared',
    'widgets',
  ].includes(part);
}

function isSourceFile(part: string): boolean {
  return /\.[cm]?[jt]sx?$/u.test(part) || /\.(vue|svelte)$/u.test(part);
}

export function recommendationTitle(recommendation: Recommendation): string {
  const p = recommendation.params;
  switch (recommendation.kind) {
    case 'contract-violation':
      return `${p['severity'] ?? 'violation'} contract "${p['rule'] ?? 'unknown'}"`;
    case 'cycle-break-cluster':
      return `${p['severity'] ?? 'cycle'} cycle, ${p['sccLength'] ?? recommendation.modules.length} modules`;
    case 'split-god-module':
      return `Split ${p['name'] ?? recommendation.modules[0]}`;
    case 'misplaced-by-layer':
      return p['targetLayer']
        ? `Move ${p['name'] ?? recommendation.modules[0]} toward ${p['targetLayer']}`
        : `Review layer ownership for ${p['name'] ?? recommendation.modules[0]}`;
    case 'type-only-candidate':
      return `Convert ${p['from'] ?? recommendation.modules[0]} -> ${p['to'] ?? recommendation.modules[1]} to type-only`;
    case 'bundle-bloat':
      return `${p['severity'] ?? 'bundle'} bundle issue`;
    case 'temporal-coupling':
      return `Hidden temporal coupling: ${p['aShort'] ?? p['a']} + ${p['bShort'] ?? p['b']}`;
    case 'unused-utility':
      return `Remove or wire unused utility ${p['name'] ?? recommendation.modules[0]}`;
    case 'isolated-cluster':
      return `Review isolated cluster (${p['count'] ?? recommendation.modules.length} modules)`;
    case 'cycle-break-candidate':
      return 'Break cycle candidate';
  }
}

export function recommendationAction(recommendation: Recommendation): string {
  const p = recommendation.params;
  switch (recommendation.kind) {
    case 'contract-violation':
      return typeof p['message'] === 'string'
        ? p['message']
        : 'Move the import behind an allowed boundary or update the contract explicitly.';
    case 'cycle-break-cluster': {
      const edge = firstFeedbackEdge(recommendation);
      return edge
        ? `Try breaking ${edge.from} -> ${edge.to}.`
        : 'Break the smallest feedback edge in this cycle.';
    }
    case 'split-god-module':
      return `Fan-in ${p['fanIn'] ?? '-'}, LOC ${p['loc'] ?? '-'}. Extract stable submodules around consumer groups.`;
    case 'misplaced-by-layer':
      return p['targetLayer']
        ? `${p['majority'] ?? 'Most'} of ${p['total'] ?? 'the'} dependents live in ${p['targetLayer']}; move or add a narrow adapter.`
        : 'This module is repeatedly involved in layer violations; move the dependency or narrow the public API.';
    case 'type-only-candidate':
      return `Use import type for ${p['bindings'] ?? 'type-only bindings'} from ${p['specifier'] ?? 'this import'}.`;
    case 'bundle-bloat':
      return typeof p['message'] === 'string'
        ? p['message']
        : 'Move heavy imports behind lazy boundaries or split the chunk.';
    case 'temporal-coupling':
      return `${p['coOccurrences'] ?? '-'} co-changes, score ${p['score'] ?? '-'}. Check whether ownership or API boundaries should move.`;
    case 'unused-utility':
      return 'Delete it if unused, or add an explicit entry/import if it is intentionally public.';
    case 'isolated-cluster':
      return `Sample: ${p['sample'] ?? recommendation.modules.slice(0, 3).join(', ')}. Check whether this is test/demo code or missing entry wiring.`;
    case 'cycle-break-candidate':
      return 'Review the cycle and move one dependency behind a stable boundary.';
  }
}

export function firstFeedbackEdge(
  recommendation: Recommendation,
): { from: string; to: string } | null {
  const edges = recommendation.params['feedbackEdges'];
  if (!Array.isArray(edges)) return null;
  const first = edges[0];
  if (!first || typeof first !== 'object') return null;
  const from = 'from' in first ? first.from : null;
  const to = 'to' in first ? first.to : null;
  return typeof from === 'string' && typeof to === 'string' ? { from, to } : null;
}
