import type { ModuleId, ScanResult } from '@/core/analyzer/types';
import { buildJsonReport } from '@/core/report/buildJsonReport';
import { escapeHtml, escapeAttr } from './escapeHtml';

export interface BuildHtmlReportOptions {
  appVersion?: string;
  exportedAt?: string;
}

type PriorityItem = {
  id: string;
  label: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  action: string;
  score: number;
};

type VerificationStep = {
  label: string;
  target: string;
  reason: string;
};

export function buildHtmlReport(scan: ScanResult, options: BuildHtmlReportOptions = {}): string {
  const appVersion = options.appVersion ?? 'archora';
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const json = buildJsonReport(scan, { appVersion, exportedAt, pretty: false });
  const projectName = escapeHtml(scan.project.name);
  const priority = buildPriorityQueue(scan);
  const verificationPlan = buildVerificationPlan(scan, priority);
  const topModules = rankedModules(scan).slice(0, 25);
  const layerViolations = scan.layerViolations.slice(0, 30);
  const contractViolations = scan.contractViolations.slice(0, 30);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Archora report - ${projectName}</title>
<style>
  :root {
    --bg: #080d14;
    --surface: #0d1521;
    --surface-2: #111d2d;
    --surface-3: #17263a;
    --line: #213149;
    --line-strong: #314867;
    --text: #e7eefb;
    --muted: #91a3bb;
    --subtle: #6f829b;
    --indigo: #6f7cff;
    --teal: #4cc7bd;
    --red: #f26d65;
    --amber: #f0b04f;
    --green: #54c88f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 13px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 24px;
    align-items: end;
    padding: 28px 32px 24px;
    border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, #101b2a 0%, #0a111b 100%);
  }
  h1, h2, h3, p, dl { margin: 0; }
  h1 { font-size: 24px; line-height: 1.1; letter-spacing: 0; }
  h2 { font-size: 15px; letter-spacing: 0; }
  h3 { color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  main { display: grid; gap: 18px; padding: 22px 32px 34px; }
  .lead {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, .36fr);
    gap: 12px;
  }
  section {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .meta { color: var(--muted); font-size: 12px; }
  .grade {
    display: grid;
    min-width: 128px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    padding: 12px 16px;
    background: #0b1421;
    text-align: right;
  }
  .grade span { color: var(--subtle); font-size: 11px; text-transform: uppercase; }
  .grade strong { color: var(--text); font: 800 30px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
    padding: 14px;
  }
  .metric {
    min-width: 0;
    border: 1px solid rgba(126,159,204,.14);
    border-radius: 7px;
    padding: 11px 12px;
    background: var(--surface-2);
  }
  .metric dt { color: var(--subtle); font-size: 10px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  .metric dd { margin: 2px 0 0; color: var(--text); font: 800 20px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; }
  .section-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 13px 15px;
    border-bottom: 1px solid var(--line);
  }
  .section-head p { color: var(--muted); font-size: 12px; }
  .brief {
    display: grid;
    gap: 14px;
    padding: 16px;
  }
  .brief h2 { margin-top: 4px; font-size: 18px; }
  .brief-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .brief-card {
    min-width: 0;
    border: 1px solid rgba(126,159,204,.14);
    border-radius: 7px;
    padding: 12px;
    background: var(--surface-2);
  }
  .brief-card b {
    display: block;
    margin-top: 5px;
    overflow: hidden;
    color: var(--text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .brief-card p { margin-top: 6px; color: var(--muted); }
  .diagnosis {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr);
    gap: 12px;
    padding: 14px;
  }
  .diagnosis-card {
    min-width: 0;
    border: 1px solid rgba(111,124,255,.34);
    border-radius: 8px;
    padding: 16px;
    background: linear-gradient(135deg, rgba(111,124,255,.16), rgba(76,199,189,.06));
  }
  .diagnosis-card strong { display: block; margin-top: 5px; font-size: 18px; line-height: 1.25; }
  .diagnosis-card p { margin-top: 8px; color: var(--muted); }
  .queue { display: grid; gap: 8px; }
  .queue-item {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr) 64px;
    gap: 12px;
    align-items: center;
    border: 1px solid rgba(126,159,204,.14);
    border-radius: 7px;
    padding: 10px 12px;
    background: #0b1420;
  }
  .queue-item code,
  td code {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    color: #dce8fb;
    font: 12px/1.35 ui-monospace, SFMono-Regular, Consolas, monospace;
    text-overflow: ellipsis;
    vertical-align: bottom;
    white-space: nowrap;
  }
  .queue-main { min-width: 0; }
  .queue-main b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .queue-main small { display: block; margin-top: 2px; color: var(--muted); }
  .score { text-align: right; font: 800 16px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
  .verification {
    display: grid;
    gap: 8px;
    padding: 14px;
  }
  .verification-item {
    display: grid;
    grid-template-columns: 28px minmax(0, .8fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    border: 1px solid rgba(126,159,204,.14);
    border-radius: 7px;
    padding: 11px 12px;
    background: #0b1420;
  }
  .step-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    color: var(--text);
    background: rgba(111,124,255,.18);
    font: 800 11px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  .verification-item b { display: block; color: var(--text); }
  .verification-item small,
  .verification-item p { color: var(--muted); }
  .tag {
    display: inline-flex;
    justify-content: center;
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .critical { color: var(--red); background: rgba(242,109,101,.1); }
  .high { color: var(--amber); background: rgba(240,176,79,.1); }
  .medium { color: #f4d66a; background: rgba(244,214,106,.09); }
  .low { color: var(--green); background: rgba(84,200,143,.09); }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { padding: 9px 12px; border-bottom: 1px solid rgba(126,159,204,.1); text-align: left; }
  th { color: var(--subtle); font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  td { color: var(--muted); }
  td:first-child { color: var(--text); }
  .num { color: var(--text); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; text-align: right; }
  .empty { padding: 18px 15px; color: var(--muted); }
  details { border-top: 1px solid var(--line); }
  summary { cursor: pointer; padding: 12px 15px; color: var(--muted); font-weight: 700; }
  pre {
    max-height: 360px;
    margin: 0;
    overflow: auto;
    padding: 14px 15px;
    color: var(--muted);
    background: #060a10;
    font: 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  footer { padding: 16px 32px 24px; color: var(--subtle); font-size: 12px; }
  @media (max-width: 1100px) {
    header,
    .lead,
    .diagnosis { grid-template-columns: 1fr; }
    .grade { text-align: left; }
    .summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .brief-grid { grid-template-columns: 1fr; }
  }
  @media print {
    body { background: #fff; color: #111827; }
    section, .metric, .diagnosis-card, .queue-item { break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
  <div>
    <h1>${projectName}</h1>
    <p class="meta">Exported ${escapeHtml(exportedAt)} · scanned in ${scan.durationMs} ms · ${escapeHtml(appVersion)}</p>
  </div>
  <div class="grade">
    <span>Architecture grade</span>
    <strong>${escapeHtml(scan.archDebt.grade)}</strong>
  </div>
</header>
<main>
  <div class="lead">
    <section>${repairBriefHtml(priority[0], verificationPlan[0], scan)}</section>
    <section><div class="summary-grid">${summaryHtml(scan)}</div></section>
  </div>

  <section>
    <div class="section-head">
      <div>
        <h2>What to fix first</h2>
        <p>Prioritized from cycles, violations and module risk.</p>
      </div>
    </div>
    <div class="diagnosis">
      ${diagnosisHtml(priority[0], scan)}
      <div class="queue">${priorityHtml(priority)}</div>
    </div>
  </section>

  <section>
    <div class="section-head"><h2>Verification plan</h2><p>Run these checks after each fix to prove impact safely.</p></div>
    ${verificationPlanHtml(verificationPlan)}
  </section>

  <section>
    <div class="section-head"><h2>Hot zones</h2><p>Top change-risk modules.</p></div>
    ${hotZonesHtml(scan)}
  </section>

  <section>
    <div class="section-head"><h2>Cycles</h2><p>Repair queue, not a graph.</p></div>
    ${cyclesHtml(scan)}
  </section>

  <section>
    <div class="section-head"><h2>Rule violations</h2><p>Layer and contract boundaries.</p></div>
    ${violationsHtml(layerViolations, contractViolations)}
  </section>

  <section>
    <div class="section-head"><h2>Module risk table</h2><p>Highest structural risk first.</p></div>
    ${moduleRiskHtml(topModules)}
  </section>

  <section>
    <details>
      <summary>Raw report data</summary>
      <pre>${escapeHtml(json)}</pre>
    </details>
  </section>
</main>
<footer>Archora analyzer-first report</footer>
</body>
</html>`;
}

function repairBriefHtml(
  item: PriorityItem | undefined,
  firstStep: VerificationStep | undefined,
  scan: ScanResult,
): string {
  const status = item
    ? {
        title: item.label,
        reason: item.reason,
        action: item.action,
      }
    : {
        title: 'No priority repair needed',
        reason: 'This scan has no cycles, hot zones or rule violations in the priority queue.',
        action: 'Keep the baseline and re-run Archora after the next architectural change.',
      };

  return `<div class="brief">
    <div>
      <h3>Repair brief</h3>
      <h2>${escapeHtml(status.title)}</h2>
      <p class="meta">${escapeHtml(scan.project.rootPath)}</p>
    </div>
    <div class="brief-grid">
      <div class="brief-card">
        <h3>Problem</h3>
        <b>${escapeHtml(status.reason)}</b>
        <p>Debt score ${escapeHtml(scan.archDebt.score.toFixed(1))}, grade ${escapeHtml(
          scan.archDebt.grade,
        )}.</p>
      </div>
      <div class="brief-card">
        <h3>Suggested fix</h3>
        <b>${escapeHtml(status.action)}</b>
        <p>Apply the smallest boundary change first, then re-scan.</p>
      </div>
      <div class="brief-card">
        <h3>Verify safely</h3>
        <b>${escapeHtml(firstStep?.label ?? 'Run project test suite')}</b>
        <p>${escapeHtml(firstStep?.reason ?? 'No high-priority architecture findings detected.')}</p>
      </div>
    </div>
  </div>`;
}

function summaryHtml(scan: ScanResult): string {
  const avgFanOut =
    scan.modules.length === 0
      ? 0
      : scan.modules.reduce((acc, module) => acc + (scan.metrics[module.id]?.fanOut ?? 0), 0) /
        scan.modules.length;
  const metrics = [
    ['Modules', scan.modules.length],
    ['Edges', scan.edges.length],
    ['Cycles', scan.cycles.length],
    ['Hot zones', scan.hotZones.length],
    ['Violations', scan.layerViolations.length + scan.contractViolations.length],
    ['Avg fan-out', avgFanOut.toFixed(2)],
  ];
  return metrics
    .map(
      ([label, value]) =>
        `<dl class="metric"><dt>${label}</dt><dd>${escapeHtml(String(value))}</dd></dl>`,
    )
    .join('');
}

function diagnosisHtml(item: PriorityItem | undefined, scan: ScanResult): string {
  if (!item) {
    return `<div class="diagnosis-card">
      <h3>Current diagnosis</h3>
      <strong>No critical architecture queue</strong>
      <p>No cycles, hot zones or rule violations were detected in this scan.</p>
    </div>`;
  }
  return `<div class="diagnosis-card">
    <h3>Current diagnosis</h3>
    <strong>${escapeHtml(item.label)}</strong>
    <p>${escapeHtml(item.reason)}</p>
    <p><b>Next action:</b> ${escapeHtml(item.action)}</p>
    <p><b>Impact check:</b> verify touched modules before refactoring. Debt score: ${escapeHtml(
      scan.archDebt.score.toFixed(1),
    )}.</p>
  </div>`;
}

function priorityHtml(items: PriorityItem[]): string {
  if (items.length === 0) return '<div class="empty">No priority findings.</div>';
  return items
    .slice(0, 8)
    .map(
      (item) => `<div class="queue-item">
        <span class="tag ${item.severity}">${item.severity}</span>
        <div class="queue-main">
          <b><code title="${escapeAttr(item.id)}">${escapeHtml(item.label)}</code></b>
          <small>${escapeHtml(item.reason)} · ${escapeHtml(item.action)}</small>
        </div>
        <span class="score">${escapeHtml(item.score.toFixed(0))}</span>
      </div>`,
    )
    .join('');
}

function verificationPlanHtml(items: VerificationStep[]): string {
  if (items.length === 0) return '<div class="empty">Run project test suite after changes.</div>';
  return `<div class="verification">${items
    .map(
      (item, index) => `<div class="verification-item">
        <span class="step-index">${index + 1}</span>
        <div>
          <b>${escapeHtml(item.label)}</b>
          <small><code title="${escapeAttr(item.target)}">${escapeHtml(item.target)}</code></small>
        </div>
        <p>${escapeHtml(item.reason)}</p>
      </div>`,
    )
    .join('')}</div>`;
}

function hotZonesHtml(scan: ScanResult): string {
  const rows = scan.hotZones
    .slice(0, 25)
    .map((id, index) => {
      const module = scan.modules.find((item) => item.id === id);
      const metric = scan.metrics[id];
      if (!module || !metric) return '';
      return `<tr>
        <td class="num">${index + 1}</td>
        <td><code title="${escapeAttr(module.id)}">${escapeHtml(module.id)}</code></td>
        <td>${escapeHtml(module.kind)}</td>
        <td class="num">${metric.fanIn}</td>
        <td class="num">${metric.fanOut}</td>
        <td class="num">${riskScore(metric.hotnessScore).toFixed(1)}</td>
      </tr>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '<div class="empty">No hot zones detected.</div>';
  return `<table>
    <thead><tr><th>#</th><th>Hotspot</th><th>Type</th><th>Fan-in</th><th>Fan-out</th><th>Risk</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function cyclesHtml(scan: ScanResult): string {
  const rows = scan.cycles
    .slice(0, 30)
    .map((cycle) => {
      const breakPoint =
        cycle.modules[0] && cycle.modules[1]
          ? `${cycle.modules[0]} -> ${cycle.modules[1]}`
          : cycle.id;
      return `<tr>
        <td><span class="tag ${cycle.severity === 'direct' ? 'critical' : 'high'}">${escapeHtml(
          cycle.severity,
        )}</span></td>
        <td><code title="${escapeAttr(cycle.modules.join(' -> '))}">${escapeHtml(
          cycle.modules.join(' -> '),
        )}</code></td>
        <td><code title="${escapeAttr(breakPoint)}">${escapeHtml(breakPoint)}</code></td>
        <td class="num">${cycle.length}</td>
      </tr>`;
    })
    .join('');
  if (!rows) return '<div class="empty">No cyclic dependencies.</div>';
  return `<table>
    <thead><tr><th>Severity</th><th>Dependency chain</th><th>Suggested breakpoint</th><th>Modules</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function violationsHtml(
  layerViolations: ScanResult['layerViolations'],
  contractViolations: ScanResult['contractViolations'],
): string {
  const layerRows = layerViolations.map(
    (violation) => `<tr>
      <td><span class="tag ${violation.severity === 'error' ? 'critical' : 'high'}">${escapeHtml(
        violation.severity,
      )}</span></td>
      <td><code title="${escapeAttr(violation.from)}">${escapeHtml(violation.from)}</code></td>
      <td><code title="${escapeAttr(violation.to)}">${escapeHtml(violation.to)}</code></td>
      <td>${escapeHtml(`${violation.fromLayer} -> ${violation.toLayer}`)}</td>
    </tr>`,
  );
  const contractRows = contractViolations.map(
    (violation) => `<tr>
      <td><span class="tag ${violation.severity === 'error' ? 'critical' : 'high'}">${escapeHtml(
        violation.severity,
      )}</span></td>
      <td><code title="${escapeAttr(violation.modules[0] ?? violation.id)}">${escapeHtml(
        violation.modules[0] ?? violation.id,
      )}</code></td>
      <td><code title="${escapeAttr(violation.modules[1] ?? violation.ruleName)}">${escapeHtml(
        violation.modules[1] ?? violation.ruleName,
      )}</code></td>
      <td>${escapeHtml(violation.message)}</td>
    </tr>`,
  );
  const rows = [...layerRows, ...contractRows].join('');
  if (!rows) return '<div class="empty">No rule violations.</div>';
  return `<table>
    <thead><tr><th>Risk</th><th>Source</th><th>Target</th><th>What happened</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function moduleRiskHtml(items: ReturnType<typeof rankedModules>): string {
  if (items.length === 0) return '<div class="empty">No modules in scan.</div>';
  const rows = items
    .map(
      ({ id, kind, metric, score }) => `<tr>
        <td><code title="${escapeAttr(id)}">${escapeHtml(id)}</code></td>
        <td>${escapeHtml(kind)}</td>
        <td class="num">${metric.fanIn}</td>
        <td class="num">${metric.fanOut}</td>
        <td class="num">${metric.inCycle ? '1' : '0'}</td>
        <td class="num">${score.toFixed(1)}</td>
      </tr>`,
    )
    .join('');
  return `<table>
    <thead><tr><th>Module</th><th>Type</th><th>Fan-in</th><th>Fan-out</th><th>Cycle</th><th>Risk</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildVerificationPlan(scan: ScanResult, priority: PriorityItem[]): VerificationStep[] {
  const steps: VerificationStep[] = [];
  const firstCycle = scan.cycles[0];
  const firstViolation = scan.layerViolations[0];
  const firstHotZone = scan.hotZones[0];

  if (firstCycle) {
    steps.push({
      label: 'Re-run Cycles after the breakpoint change',
      target: firstCycle.modules.join(' -> '),
      reason: 'The selected cycle should disappear or shrink before broader refactoring continues.',
    });
  }
  if (firstViolation) {
    steps.push({
      label: 'Re-run Rules for the violated boundary',
      target: `${firstViolation.fromLayer} -> ${firstViolation.toLayer}`,
      reason: 'The import direction must become allowed or move behind an explicit adapter.',
    });
  }
  if (firstHotZone) {
    const metric = scan.metrics[firstHotZone];
    steps.push({
      label: 'Run Impact on the top hotspot',
      target: firstHotZone,
      reason: metric
        ? `Check ${metric.fanIn} incoming and ${metric.fanOut} outgoing dependencies before editing.`
        : 'Check consumers before editing this module.',
    });
  }
  if (scan.contractViolations[0]) {
    const violation = scan.contractViolations[0];
    steps.push({
      label: 'Review contract violation',
      target: violation.ruleName,
      reason: violation.message,
    });
  }
  if (steps.length === 0 && priority[0]) {
    steps.push({
      label: 'Verify selected priority item',
      target: priority[0].id,
      reason: priority[0].action,
    });
  }
  if (steps.length === 0) {
    steps.push({
      label: 'Run project test suite',
      target: scan.project.name,
      reason: 'No high-risk structural findings were detected in this scan.',
    });
  }

  return steps.slice(0, 5);
}

function buildPriorityQueue(scan: ScanResult): PriorityItem[] {
  const items: PriorityItem[] = [];
  for (const cycle of scan.cycles.slice(0, 6)) {
    items.push({
      id: cycle.id,
      label: cycle.modules[0] ?? cycle.id,
      severity: cycle.severity === 'direct' ? 'critical' : 'high',
      reason: `${cycle.length} modules close a dependency cycle.`,
      action: 'Break one import in the cycle and re-run impact analysis.',
      score: cycle.severity === 'direct' ? 95 : 82,
    });
  }
  for (const violation of scan.layerViolations.slice(0, 6)) {
    items.push({
      id: violation.edgeId,
      label: violation.from,
      severity: violation.severity === 'error' ? 'critical' : 'high',
      reason: `${violation.fromLayer} imports ${violation.toLayer}.`,
      action: 'Move the dependency to an allowed boundary or introduce an adapter.',
      score: violation.severity === 'error' ? 88 : 68,
    });
  }
  for (const id of scan.hotZones.slice(0, 8)) {
    const metric = scan.metrics[id];
    if (!metric) continue;
    items.push({
      id,
      label: id,
      severity: metric.fanIn > 20 ? 'high' : 'medium',
      reason: `${metric.fanIn} incoming and ${metric.fanOut} outgoing dependencies.`,
      action: 'Stabilize public API before changing this module.',
      score: riskScore(metric.hotnessScore),
    });
  }
  return items.sort((a, b) => b.score - a.score);
}

function rankedModules(scan: ScanResult): Array<{
  id: ModuleId;
  kind: string;
  metric: NonNullable<ScanResult['metrics'][ModuleId]>;
  score: number;
}> {
  return scan.modules
    .map((module) => {
      const metric = scan.metrics[module.id];
      if (!metric) return null;
      return {
        id: module.id,
        kind: module.kind,
        metric,
        score:
          metric.couplingScore +
          metric.hotnessScore * 10 +
          metric.fanIn * 0.45 +
          metric.fanOut * 0.25 +
          (metric.inCycle ? 18 : 0),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.score - a.score);
}

function riskScore(value: number): number {
  return Math.max(0, Math.min(100, value * 10));
}
