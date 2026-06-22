import type { ScanResult } from '@/core/analyzer/types';
import { buildFixPlan, type FixPlanFinding, type FixPlanReport } from '@archora/core';
import { escapeHtml, escapeAttr } from './escapeHtml';

export interface BuildFixPlanHtmlReportOptions {
  appVersion?: string;
  exportedAt?: string;
}

/**
 * Human-readable counterpart to the JSON fix plan. The desktop export bar saves
 * this so a tech lead can open the remediation plan in a browser and read it as
 * an ordered checklist, instead of parsing the raw JSON the CLI emits for CI.
 * Renders the same `buildFixPlan` output the CLI uses, so the two never drift.
 */
export function buildFixPlanHtmlReport(
  scan: ScanResult,
  options: BuildFixPlanHtmlReportOptions = {},
): string {
  const plan = buildFixPlan(scan, options);
  const projectName = escapeHtml(plan.project.name);
  const byId = new Map(plan.priorityFindings.map((finding) => [finding.id, finding]));
  const json = JSON.stringify(plan, null, 2);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Archora fix plan - ${projectName}</title>
<style>
  :root {
    --bg: #080d14;
    --surface: #0d1521;
    --surface-2: #111d2d;
    --line: #213149;
    --line-strong: #314867;
    --text: #e7eefb;
    --muted: #91a3bb;
    --subtle: #6f829b;
    --indigo: #6f7cff;
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
  h1, h2, h3, p, ol, ul, dl { margin: 0; }
  h1 { font-size: 24px; line-height: 1.1; }
  h2 { font-size: 15px; }
  h3 { color: var(--muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  main { display: grid; gap: 18px; padding: 22px 32px 34px; }
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
    flex-direction: column;
    gap: 2px;
    padding: 13px 15px;
    border-bottom: 1px solid var(--line);
  }
  .section-head p { color: var(--muted); font-size: 12px; }
  .findings { display: grid; gap: 10px; padding: 14px; list-style: none; counter-reset: step; }
  .finding {
    min-width: 0;
    border: 1px solid rgba(126,159,204,.14);
    border-radius: 7px;
    padding: 12px 14px 12px 44px;
    background: #0b1420;
    position: relative;
  }
  .finding::before {
    counter-increment: step;
    content: counter(step);
    position: absolute;
    top: 12px;
    left: 12px;
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
  .finding-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .finding-head b { color: var(--text); font-size: 14px; }
  .finding p { margin-top: 6px; color: var(--muted); }
  .finding p b { color: var(--text); }
  .finding .targets { margin-top: 8px; }
  .finding code {
    color: #dce8fb;
    font: 12px/1.35 ui-monospace, SFMono-Regular, Consolas, monospace;
    word-break: break-all;
  }
  .batches { display: grid; gap: 12px; padding: 14px; }
  .batch {
    border: 1px solid rgba(111,124,255,.28);
    border-radius: 8px;
    padding: 12px 14px;
    background: linear-gradient(135deg, rgba(111,124,255,.12), rgba(76,199,189,.04));
  }
  .batch h3 { color: var(--text); font-size: 13px; letter-spacing: 0; text-transform: none; }
  .batch p { margin-top: 4px; color: var(--muted); }
  .batch ul { margin-top: 8px; padding-left: 18px; color: var(--muted); }
  .batch li { margin-bottom: 3px; }
  .order { display: grid; gap: 6px; padding: 14px; counter-reset: vstep; list-style: none; }
  .order li {
    padding: 9px 12px 9px 40px;
    border: 1px solid rgba(126,159,204,.14);
    border-radius: 7px;
    background: #0b1420;
    color: var(--text);
    position: relative;
  }
  .order li::before {
    counter-increment: vstep;
    content: counter(vstep);
    position: absolute;
    left: 10px;
    top: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: rgba(84,200,143,.18);
    color: var(--text);
    font: 800 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  .tag {
    display: inline-flex;
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
  .muted-tag { color: var(--subtle); background: rgba(126,159,204,.1); }
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
    header { grid-template-columns: 1fr; }
    .grade { text-align: left; }
    .summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media print {
    body { background: #fff; color: #111827; }
    section, .metric, .finding, .batch { break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
  <div>
    <h1>Fix plan — ${projectName}</h1>
    <p class="meta">Exported ${escapeHtml(plan.exportedAt)} · scanned ${escapeHtml(
      plan.scannedAt,
    )} · ${escapeHtml(plan.appVersion)}</p>
  </div>
  <div class="grade">
    <span>Architecture grade</span>
    <strong>${escapeHtml(plan.architectureDebt.grade)}</strong>
  </div>
</header>
<main>
  <section><div class="summary-grid">${summaryHtml(plan)}</div></section>

  <section>
    <div class="section-head">
      <h2>Repair order</h2>
      <p>Highest-weight findings first. Each carries a concrete action and the check that proves it.</p>
    </div>
    ${repairOrderHtml(plan.priorityFindings)}
  </section>

  <section>
    <div class="section-head">
      <h2>Suggested batches</h2>
      <p>Group the work by blast radius — start with the safe batch, review the rest before editing.</p>
    </div>
    ${batchesHtml(plan, byId)}
  </section>

  <section>
    <div class="section-head">
      <h2>Verification order</h2>
      <p>Run these checks in order to prove each fix landed without regressions.</p>
    </div>
    ${verificationOrderHtml(plan.verificationOrder)}
  </section>

  <section>
    <details>
      <summary>Raw fix plan (JSON)</summary>
      <pre>${escapeHtml(json)}</pre>
    </details>
  </section>
</main>
<footer>Archora analyzer-first fix plan</footer>
</body>
</html>`;
}

function summaryHtml(plan: FixPlanReport): string {
  const metrics: Array<[string, number | string]> = [
    ['Cycles', plan.summary.cycles],
    ['Layer violations', plan.summary.layerViolations],
    ['Contract violations', plan.summary.contractViolations],
    ['Hot zones', plan.summary.hotZones],
    ['Generated', plan.summary.generatedModules],
    ['Debt score', plan.architectureDebt.score.toFixed(1)],
  ];
  return metrics
    .map(
      ([label, value]) =>
        `<dl class="metric"><dt>${label}</dt><dd>${escapeHtml(String(value))}</dd></dl>`,
    )
    .join('');
}

function repairOrderHtml(findings: readonly FixPlanFinding[]): string {
  if (findings.length === 0) {
    return '<div class="empty">No priority findings. Keep the baseline and re-scan after the next change.</div>';
  }
  return `<ol class="findings">${findings.map(findingHtml).join('')}</ol>`;
}

function findingHtml(finding: FixPlanFinding): string {
  const targets = finding.targets
    .slice(0, 6)
    .map((target) => `<code title="${escapeAttr(target)}">${escapeHtml(target)}</code>`)
    .join(', ');
  const generated = finding.generated ? '<span class="tag muted-tag">generated</span>' : '';
  return `<li class="finding">
    <div class="finding-head">
      <span class="tag ${severityClass(finding.weight)}">weight ${escapeHtml(
        String(Math.round(finding.weight)),
      )}</span>
      <b>${escapeHtml(finding.title)}</b>
      ${generated}
    </div>
    <p>${escapeHtml(finding.reason)}</p>
    <p><b>Action:</b> ${escapeHtml(finding.action)}</p>
    <p><b>Verify:</b> ${escapeHtml(finding.verify)}</p>
    ${targets ? `<p class="targets"><b>Targets:</b> ${targets}</p>` : ''}
  </li>`;
}

function batchesHtml(plan: FixPlanReport, byId: Map<string, FixPlanFinding>): string {
  const groups = plan.repairGroups.filter((group) => group.findings.length > 0);
  if (groups.length === 0) {
    return '<div class="empty">No batched repair candidates in this scan.</div>';
  }
  return `<div class="batches">${groups
    .map((group) => {
      const items = group.findings
        .map((id) => byId.get(id))
        .filter((finding): finding is FixPlanFinding => Boolean(finding))
        .map((finding) => `<li>${escapeHtml(finding.title)}</li>`)
        .join('');
      return `<div class="batch">
        <h3>${escapeHtml(group.title)}</h3>
        <p>${escapeHtml(group.description)}</p>
        <ul>${items}</ul>
      </div>`;
    })
    .join('')}</div>`;
}

function verificationOrderHtml(order: readonly string[]): string {
  if (order.length === 0) {
    return '<div class="empty">Run the project test suite after changes.</div>';
  }
  return `<ol class="order">${order.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`;
}

function severityClass(weight: number): string {
  if (weight >= 80) return 'critical';
  if (weight >= 60) return 'high';
  if (weight >= 40) return 'medium';
  return 'low';
}
