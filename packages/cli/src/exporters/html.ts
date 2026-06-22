import {
  buildFixPlan,
  buildLifecycleHygieneView,
  buildReviewRiskView,
  type FixPlanFinding,
  type ScanResult,
} from '@archora/core';
import {
  hiddenFixtureFindingCount,
  hiddenGeneratedFindingCount,
  isFixtureOnly,
  isFixturePath,
  isGeneratedOnly,
  reportAffectedAreas,
  recommendationAction,
  recommendationTitle,
  reportStatus,
  reportStatusLabel,
  reportCiSignals,
  reportContractViolations,
  reportCycles,
  reportHotZones,
  reportHotspotAction,
  reportLayerViolations,
  reportRecommendations,
  reportSignals,
  signalReviewState,
} from './reportView';
import {
  memoryRiskEvidenceText,
  memoryRiskKindLabel,
  memoryRiskRemediationText,
  memoryRiskSource,
} from '../lib/memoryRiskText';
import {
  asyncLifecycleRiskEvidenceText,
  asyncLifecycleRiskKindLabel,
  asyncLifecycleRiskRemediationText,
  asyncLifecycleRiskSource,
} from '../lib/asyncLifecycleRiskText';

// Single-file HTML summary. No JS, no graph. Mirrors the desktop fix-plan
// layout: repair brief, prioritised findings with reason/action/verify,
// supporting evidence and a verification plan. Use the desktop app for the
// interactive workspace.
export function buildHtmlReport(scan: ScanResult): string {
  const plan = buildFixPlan(scan);
  const top = plan.priorityFindings
    .filter((finding) => !isFixtureOnly(finding.targets) && !isGeneratedOnly(finding.targets))
    .slice(0, 10);
  const debt = scan.archDebt;
  const summary = plan.summary;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Archora - ${esc(scan.project.name)}</title>
<style>${STYLES}</style>
</head>
<body>
  <header>
    <h1>Archora - ${esc(scan.project.name)}</h1>
    <p class="meta">Scanned ${esc(scan.scannedAt)} - ${scan.durationMs} ms - framework: ${esc(scan.project.detectedFramework)}</p>
  </header>

  <section class="brief">
    <h2>Repair brief</h2>
    <dl class="brief-grid">
      <dt>Architecture grade</dt>
      <dd><span class="grade grade-${debt.grade}">${debt.grade}</span> <span class="muted">(score ${debt.score}/100)</span></dd>
      <dt>Status</dt><dd>${esc(reportStatusLabel(reportStatus(scan)))}</dd>
      <dt>Fix first</dt><dd>${esc(firstAction(scan))}</dd>
      <dt>Affected areas</dt><dd>${renderAffectedAreaList(scan)}</dd>
      <dt>CI gate suggestion</dt><dd><code>${esc(ciGateCandidate(scan))}</code></dd>
      <dt>Cycles</dt><dd>${summary.cycles}</dd>
      <dt>Layer violations</dt><dd>${summary.layerViolations}</dd>
      <dt>Contract violations</dt><dd>${summary.contractViolations}</dd>
      <dt>Rules config</dt><dd>${esc(rulesConfigLabel(scan))}</dd>
      <dt>Signals</dt><dd>${scan.signals?.length ?? 0}</dd>
      <dt>Hot zones</dt><dd>${summary.hotZones}</dd>
      <dt>Modules / edges</dt><dd>${scan.modules.length} / ${scan.edges.length}</dd>
      ${
        hiddenFixtureFindingCount(scan) > 0
          ? `<dt>Hidden fixture-only findings</dt><dd>${hiddenFixtureFindingCount(scan)}</dd>`
          : ''
      }
      ${
        hiddenGeneratedFindingCount(scan) > 0
          ? `<dt>Hidden generated-only findings</dt><dd>${hiddenGeneratedFindingCount(scan)}</dd>`
          : ''
      }
      ${
        summary.generatedModules > 0
          ? `<dt>Generated modules</dt><dd>${summary.generatedModules} <span class="muted">(de-prioritised)</span></dd>`
          : ''
      }
    </dl>
    ${renderFixFirst(top[0])}
  </section>

  ${renderGuidedReview(scan)}
  ${renderPriorityQueue(top)}

  ${renderAffectedAreas(scan)}
  ${renderRiskBuckets(scan)}
  ${renderActionableSignals(scan)}
  ${renderLifecycleHygiene(scan)}
  ${renderMemoryRisks(scan)}
  ${renderAsyncLifecycleRisks(scan)}
  ${renderRecommendations(scan)}
  ${renderConfigDiagnostics(scan)}
  ${renderCycles(scan)}
  ${renderHotspots(scan)}
  ${renderRules(scan)}
  ${renderImpactSummary(scan)}

  <section>
    <h2>Verification plan</h2>
    <ol>${plan.verificationOrder.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
  </section>

  <footer class="meta">Archora CLI report. For the interactive workspace use the desktop application.</footer>
</body>
</html>
`;
}

function renderRiskBuckets(scan: ScanResult): string {
  const layer = reportLayerViolations(scan);
  const contracts = reportContractViolations(scan);
  const cycles = reportCycles(scan);
  const hotZones = reportHotZones(scan);
  const high = [
    ...contracts.filter((violation) => violation.severity === 'error'),
    ...layer.filter((violation) => violation.severity === 'error'),
  ].length;
  const medium =
    cycles.length +
    layer.filter((violation) => violation.severity === 'warning').length +
    contracts.filter((violation) => violation.severity === 'warning').length;
  const low = hotZones.length;
  return `<section>
    <h2>Risk buckets</h2>
    <table>
      <thead><tr><th>Bucket</th><th>Count</th><th>Meaning</th></tr></thead>
      <tbody>
        <tr><td><span class="finding-type type-layer-violation">High</span></td><td>${high}</td><td>Contract or layer errors that can block CI.</td></tr>
        <tr><td><span class="finding-type type-cycle">Medium</span></td><td>${medium}</td><td>Cycles and warning-level architecture issues.</td></tr>
        <tr><td><span class="finding-type">Low</span></td><td>${low}</td><td>Hotspots to review after blocking issues.</td></tr>
      </tbody>
    </table>
  </section>`;
}

function renderGuidedReview(scan: ScanResult): string {
  const actions = buildReviewRiskView(scan).guidedActions;
  if (actions.length === 0) return '';
  const rows = actions
    .map(
      (item) => `<tr>
        <td>${esc(item.title)}</td>
        <td><code>${esc(item.target)}</code></td>
        <td>${esc(item.action)}</td>
        <td>${esc(item.evidence)}</td>
        <td>${esc(item.verify)}</td>
      </tr>`,
    )
    .join('');
  return `<section>
    <h2>Guided review</h2>
    <table>
      <thead><tr><th>Step</th><th>Target</th><th>Action</th><th>Evidence</th><th>Verify</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderAffectedAreaList(scan: ScanResult): string {
  const areas = reportAffectedAreas(scan).slice(0, 4);
  if (areas.length === 0) return 'none';
  return areas.map((area) => `<code>${esc(area.area)}</code>`).join(', ');
}

function renderAffectedAreas(scan: ScanResult): string {
  const areas = reportAffectedAreas(scan).slice(0, 10);
  if (areas.length === 0) return '';
  const rows = areas
    .map(
      (area) => `<tr>
        <td><code>${esc(area.area)}</code></td>
        <td>${area.modules}</td>
        <td>${area.findings}</td>
        <td>${area.riskScore.toFixed(1)}</td>
      </tr>`,
    )
    .join('');
  return `<section>
    <h2>Affected areas</h2>
    <table>
      <thead><tr><th>Area</th><th>Modules</th><th>Findings</th><th>Risk</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderActionableSignals(scan: ScanResult): string {
  const ciSignals = reportCiSignals(scan);
  const signals = reportSignals(scan);
  if (ciSignals.length === 0 && signals.length === 0) return '';
  const lowerConfidence = signals.filter((signal) => signal.confidence !== 'high').length;
  const rows = signals
    .slice(0, 10)
    .map((signal) => {
      const modules = signal.modules.slice(0, 3).map(esc).join(', ');
      const evidence = signal.evidence[0]?.message ?? '';
      return `<tr>
        <td>${esc(signal.severity)}</td>
        <td>${esc(signal.confidence)}</td>
        <td>${esc(signalReviewState(signal))}</td>
        <td>${esc(signal.title)}</td>
        <td>${modules}</td>
        <td>${esc(evidence)}</td>
      </tr>`;
    })
    .join('');
  return `<section>
    <h2>Signal review</h2>
    <p class="muted">CI-safe high+ signals: <strong>${ciSignals.length}</strong>${
      lowerConfidence > 0
        ? `; lower-confidence signals kept out of CI gates: ${lowerConfidence}`
        : ''
    }.</p>
    ${
      rows
        ? `<table>
      <thead><tr><th>Severity</th><th>Confidence</th><th>State</th><th>Signal</th><th>Modules</th><th>Evidence</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
        : ''
    }
  </section>`;
}

function renderMemoryRisks(scan: ScanResult): string {
  const risks = scan.memoryRisks ?? [];
  if (risks.length === 0) return '';
  const rows = risks
    .slice(0, 10)
    .map((risk) => {
      return `<tr>
        <td>${esc(memoryRiskKindLabel(risk.kind))}</td>
        <td>${esc(risk.confidence)}</td>
        <td><code>${esc(memoryRiskSource(risk))}</code></td>
        <td>${esc(memoryRiskEvidenceText(risk))}</td>
        <td>${esc(memoryRiskRemediationText(risk))}</td>
      </tr>`;
    })
    .join('');
  return `<section>
    <h2>Memory risk</h2>
    <p class="muted">static risk, not runtime proof.</p>
    <table>
      <thead><tr><th>Kind</th><th>Confidence</th><th>Module</th><th>Evidence</th><th>Remediation</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderLifecycleHygiene(scan: ScanResult): string {
  const view = buildLifecycleHygieneView(scan);
  if (view.summary.memoryRisks === 0 && view.summary.asyncLifecycleRisks === 0) return '';
  const ownerRows = view.sideEffectOwners
    .slice(0, 10)
    .map(
      (item) => `<tr>
        <td><code>${esc(item.id)}</code></td>
        <td>${esc(item.owner)}</td>
        <td>${esc(item.layer)}</td>
        <td>${esc(item.kind)}</td>
        <td>${esc(item.placement)}</td>
        <td>${item.memoryRisks}</td>
        <td>${item.asyncLifecycleRisks}</td>
      </tr>`,
    )
    .join('');
  const rows = view.lifecycleRiskModules
    .slice(0, 10)
    .map(
      (item) => `<tr>
        <td><code>${esc(item.id)}</code></td>
        <td>${item.memoryRisks}</td>
        <td>${item.asyncLifecycleRisks}</td>
        <td>${esc(item.confidence)}</td>
        <td>${esc(item.severity)}</td>
      </tr>`,
    )
    .join('');
  return `<section>
    <h2>Lifecycle hygiene</h2>
    <dl class="metric-grid">
      <div>
        <dt>Memory risks</dt>
        <dd>${view.summary.memoryRisks}</dd>
      </div>
      <div>
        <dt>Async lifecycle risks</dt>
        <dd>${view.summary.asyncLifecycleRisks}</dd>
      </div>
      <div>
        <dt>Lifecycle risk modules</dt>
        <dd>${view.summary.lifecycleRiskModules}</dd>
      </div>
      <div>
        <dt>Side-effect owners</dt>
        <dd>${view.summary.sideEffectOwners}</dd>
      </div>
    </dl>
    ${
      ownerRows
        ? `<h2>Side-effect ownership</h2>
    <table>
      <thead><tr><th>Module</th><th>Owner</th><th>Layer</th><th>Role</th><th>Placement</th><th>Memory</th><th>Async lifecycle</th></tr></thead>
      <tbody>${ownerRows}</tbody>
    </table>`
        : ''
    }
    ${
      rows
        ? `<table>
      <thead><tr><th>Module</th><th>Memory</th><th>Async lifecycle</th><th>Confidence</th><th>Severity</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
        : ''
    }
  </section>`;
}

function renderAsyncLifecycleRisks(scan: ScanResult): string {
  const risks = scan.asyncLifecycleRisks ?? [];
  if (risks.length === 0) return '';
  const rows = risks
    .slice(0, 10)
    .map(
      (risk) => `<tr>
        <td>${esc(asyncLifecycleRiskKindLabel(risk.kind))}</td>
        <td>${esc(risk.confidence)}</td>
        <td><code>${esc(asyncLifecycleRiskSource(risk))}</code></td>
        <td>${esc(asyncLifecycleRiskEvidenceText(risk))}</td>
        <td>${esc(asyncLifecycleRiskRemediationText(risk))}</td>
      </tr>`,
    )
    .join('');
  return `<section>
    <h2>Async lifecycle risk</h2>
    <p class="muted">static async lifecycle risk, not runtime proof.</p>
    <table>
      <thead><tr><th>Kind</th><th>Confidence</th><th>Module</th><th>Evidence</th><th>Remediation</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderConfigDiagnostics(scan: ScanResult): string {
  const diagnostics = scan.configDiagnostics ?? [];
  if (diagnostics.length === 0) return '';
  const rows = diagnostics
    .slice(0, 30)
    .map(
      (diagnostic) =>
        `<tr><td>${esc(diagnostic.severity)}</td><td><code>${esc(diagnostic.file)}${esc(diagnostic.path)}</code></td><td>${esc(diagnostic.message)}</td></tr>`,
    )
    .join('');
  return `<section>
    <h2>Rules config diagnostics</h2>
    <table>
      <thead><tr><th>Severity</th><th>Path</th><th>Message</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function rulesConfigLabel(scan: ScanResult): string {
  const diagnostics = scan.configDiagnostics ?? [];
  if (diagnostics.length > 0) return `invalid (${diagnostics.length} diagnostics)`;
  if (scan.configStatus?.state === 'loaded') {
    return `loaded (${scan.configStatus.file ?? 'config'})`;
  }
  return 'not configured';
}

function firstAction(scan: ScanResult): string {
  if ((scan.configDiagnostics?.length ?? 0) > 0) return 'fix rules config diagnostics';
  const contractError = reportContractViolations(scan).find(
    (violation) => violation.severity === 'error',
  );
  if (contractError) return `resolve contract "${contractError.ruleName}"`;
  const directCycle = reportCycles(scan).find((cycle) => cycle.severity === 'direct');
  if (directCycle) return `break cycle "${directCycle.id}"`;
  const hotspot = reportHotZones(scan)[0];
  if (hotspot) return reportHotspotAction(scan, hotspot).summary.replace(/`/gu, '');
  return 'keep the current baseline and watch for regressions';
}

function ciGateCandidate(scan: ScanResult): string {
  if (reportContractViolations(scan).length > 0) return 'contract-errors:0';
  if (reportCycles(scan).length > 0) return 'new-cycles:0';
  if (reportCiSignals(scan).length > 0) return 'new-signals:high';
  return 'grade:D';
}

function renderFixFirst(finding: FixPlanFinding | undefined): string {
  if (!finding) {
    return `<p class="empty">No findings. Architecture is clean for the current rules.</p>`;
  }
  return `<div class="fix-first">
    <p class="eyebrow">Fix first</p>
    <h3>${esc(finding.title)}</h3>
    <p class="finding-action"><strong>Action.</strong> ${esc(finding.action)}</p>
    <p class="finding-reason"><strong>Why.</strong> ${esc(finding.reason)}</p>
    <p class="finding-verify"><strong>Verify.</strong> ${esc(finding.verify)}</p>
    ${renderTargets(finding.targets)}
  </div>`;
}

function renderPriorityQueue(findings: FixPlanFinding[]): string {
  if (findings.length === 0) return '';
  const rows = findings
    .map(
      (f, i) => `<tr>
        <td class="rank">${i + 1}</td>
        <td><span class="finding-type type-${esc(f.type)}">${esc(f.type)}</span>${f.generated ? ' <span class="finding-tag tag-generated">generated</span>' : ''}</td>
        <td>${Math.round(f.weight)}</td>
        <td>
          <div class="finding-title">${esc(f.title)}</div>
          <div class="finding-action">${esc(f.action)}</div>
          <div class="finding-reason muted">${esc(f.reason)}</div>
        </td>
        <td class="targets">${renderTargetList(f.targets)}</td>
      </tr>`,
    )
    .join('');
  return `<section>
    <h2>Top priority (${findings.length})</h2>
    <table class="priority">
      <thead><tr><th>#</th><th>Type</th><th>Weight</th><th>Finding</th><th>Targets</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderCycles(scan: ScanResult): string {
  const cycles = reportCycles(scan);
  if (cycles.length === 0) return '';
  const rows = cycles
    .slice(0, 20)
    .map((c) => {
      const bp = c.suggestedBreakpoint
        ? `${esc(c.suggestedBreakpoint.from)} → ${esc(c.suggestedBreakpoint.to)}`
        : '-';
      const sample = c.modules.slice(0, 3).map(esc).join(', ');
      const more =
        c.modules.length > 3 ? ` <span class="muted">+${c.modules.length - 3} more</span>` : '';
      return `<tr>
        <td><code>${esc(c.id)}</code></td>
        <td>${esc(c.severity)}</td>
        <td>${c.length}</td>
        <td><code>${bp}</code></td>
        <td>${sample}${more}</td>
      </tr>`;
    })
    .join('');
  return `<section>
    <h2>Cycles (top ${Math.min(20, cycles.length)} of ${cycles.length})</h2>
    <table>
      <thead><tr><th>Id</th><th>Severity</th><th>Length</th><th>Suggested break</th><th>Modules</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderHotspots(scan: ScanResult): string {
  const hotZones = reportHotZones(scan);
  if (hotZones.length === 0) return '';
  const rows = hotZones
    .slice(0, 20)
    .map((id) => {
      const m = scan.metrics[id];
      const fanIn = m?.fanIn ?? '-';
      const fanOut = m?.fanOut ?? '-';
      const inCycle = m?.inCycle ? 'yes' : 'no';
      const hotness = m ? m.hotnessScore.toFixed(2) : '-';
      return `<tr>
        <td>${esc(id)}</td>
        <td>${fanIn}</td>
        <td>${fanOut}</td>
        <td>${inCycle}</td>
        <td>${hotness}</td>
      </tr>`;
    })
    .join('');
  return `<section>
    <h2>Hotspots (top ${Math.min(20, hotZones.length)} of ${hotZones.length})</h2>
    <table>
      <thead><tr><th>Module</th><th>Fan in</th><th>Fan out</th><th>In cycle</th><th>Hotness</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderRules(scan: ScanResult): string {
  const layer = reportLayerViolations(scan);
  const contracts = reportContractViolations(scan);
  if (layer.length === 0 && contracts.length === 0) {
    return `<section>
      <h2>Rule violations</h2>
      <p class="empty">No layer or contract violations.</p>
    </section>`;
  }
  const layerRows = layer
    .slice(0, 30)
    .map(
      (v) =>
        `<tr><td>${esc(v.severity)}</td><td>${esc(v.fromLayer)} → ${esc(v.toLayer)}</td><td>${esc(v.from)}</td><td>${esc(v.to)}</td></tr>`,
    )
    .join('');
  const contractRows = contracts
    .slice(0, 30)
    .map(
      (v) =>
        `<tr><td>${esc(v.severity)}</td><td>${esc(v.ruleName)}</td><td>${esc(v.message)}</td><td>${v.modules.slice(0, 2).map(esc).join(', ')}</td></tr>`,
    )
    .join('');
  return `<section>
    <h2>Rule violations</h2>
    ${
      layer.length > 0
        ? `<h3>Layer (${layer.length})</h3>
    <table>
      <thead><tr><th>Severity</th><th>Direction</th><th>From</th><th>To</th></tr></thead>
      <tbody>${layerRows}</tbody>
    </table>`
        : ''
    }
    ${
      contracts.length > 0
        ? `<h3>Contracts (${contracts.length})</h3>
    <table>
      <thead><tr><th>Severity</th><th>Rule</th><th>Message</th><th>Modules</th></tr></thead>
      <tbody>${contractRows}</tbody>
    </table>`
        : ''
    }
  </section>`;
}

function renderRecommendations(scan: ScanResult): string {
  const recommendations = reportRecommendations(scan);
  if (recommendations.length === 0) return '';
  const rows = recommendations
    .slice(0, 12)
    .map(
      (recommendation) => `<tr>
        <td><span class="finding-type type-${esc(recommendation.kind)}">${esc(recommendation.kind)}</span></td>
        <td>${Math.round(recommendation.weight * 100)}</td>
        <td>
          <div class="finding-title">${esc(recommendationTitle(recommendation))}</div>
          <div class="finding-action">${esc(recommendationAction(recommendation))}</div>
        </td>
        <td class="targets">${renderTargetList(recommendation.modules)}</td>
      </tr>`,
    )
    .join('');
  return `<section>
    <h2>Recommendations</h2>
    <table class="priority">
      <thead><tr><th>Type</th><th>Weight</th><th>Recommendation</th><th>Targets</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderImpactSummary(scan: ScanResult): string {
  // Surface the few highest-impact targets so the reader knows where a change
  // ripples furthest. Uses fan-in directly to avoid recomputing transitive
  // closure inside the exporter.
  const ranked = [...scan.modules]
    .map((m) => ({ id: m.id, fanIn: scan.metrics[m.id]?.fanIn ?? 0 }))
    .filter((m) => m.fanIn > 0 && !isFixturePath(m.id))
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 10);
  if (ranked.length === 0) return '';
  const rows = ranked.map((m) => `<tr><td>${esc(m.id)}</td><td>${m.fanIn}</td></tr>`).join('');
  return `<section>
    <h2>Impact summary</h2>
    <p class="muted">Modules with the largest direct importer set - changes here ripple widest.</p>
    <table>
      <thead><tr><th>Module</th><th>Direct importers</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderTargets(targets: readonly string[]): string {
  if (targets.length === 0) return '';
  return `<p class="targets-line"><strong>Targets.</strong> ${renderTargetList(targets)}</p>`;
}

function renderTargetList(targets: readonly string[]): string {
  const head = targets
    .slice(0, 3)
    .map((t) => `<code>${esc(t)}</code>`)
    .join(' ');
  const more = targets.length > 3 ? ` <span class="muted">+${targets.length - 3} more</span>` : '';
  return `${head}${more}`;
}

function esc(value: string): string {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

// Self-contained styles: no web fonts, no JS — the report has to render the
// same offline, in an email preview, or printed to PDF. Severity hues match the
// desktop token palette so a finding reads identically across surfaces, and the
// Repair brief is the one element carrying weight; everything else stays quiet.
const STYLES = `
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #1a1d21; --muted: #586170; --faint: #828b98;
    --surface: #f6f7f9; --surface-2: #eef0f3;
    --border: #e4e7ec; --border-strong: #cfd4dc;
    --accent: #4f46e5;
    --sev-critical: #b42318; --sev-high: #c4320a; --sev-medium: #b54708;
    --sev-low: #1455c4; --sev-info: #475467; --sev-ok: #067647;
    --radius: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0e1217; --fg: #e6e9ee; --muted: #99a2b0; --faint: #6b7480;
      --surface: #161b22; --surface-2: #1c222b;
      --border: #283039; --border-strong: #39424d;
      --accent: #8b8bf5;
      --sev-critical: #ff6b6b; --sev-high: #fb9a5a; --sev-medium: #ffb454;
      --sev-low: #6cb6ff; --sev-info: #aab2c0; --sev-ok: #5bd99a;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    max-width: 940px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem;
    line-height: 1.55; color: var(--fg); background: var(--bg);
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  }
  h1 { font-size: 1.7rem; line-height: 1.2; letter-spacing: -.02em; margin: 0 0 .2rem; }
  h2 {
    font-size: 1.05rem; letter-spacing: -.01em; margin: 2.5rem 0 .65rem;
    padding-bottom: .4rem; border-bottom: 1px solid var(--border);
  }
  h3 { font-size: .95rem; margin: 1.4rem 0 .5rem; color: var(--muted); }
  p { margin: .5rem 0; }
  header .meta { color: var(--muted); font-size: .88rem; margin: 0 0 .5rem; }
  footer.meta {
    color: var(--faint); font-size: .82rem; margin-top: 3.5rem;
    padding-top: .85rem; border-top: 1px solid var(--border);
  }
  .muted { color: var(--muted); }
  .empty { color: var(--faint); font-style: italic; }
  .eyebrow {
    color: var(--faint); font-size: .72rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: .08em; margin: 0 0 .35rem;
  }
  a { color: var(--accent); }
  table {
    border-collapse: collapse; width: 100%; margin: .65rem 0 1.25rem;
    font-size: .88rem; font-variant-numeric: tabular-nums;
  }
  th, td { border-bottom: 1px solid var(--border); padding: .5rem .7rem; text-align: left; vertical-align: top; }
  th {
    font-weight: 600; font-size: .76rem; text-transform: uppercase;
    letter-spacing: .04em; color: var(--muted); border-bottom: 1px solid var(--border-strong);
  }
  tbody tr:hover { background: var(--surface); }
  code {
    font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code', monospace;
    background: var(--surface-2); padding: .05rem .3rem; border-radius: 4px; font-size: .82em;
  }
  ol { padding-left: 1.3rem; }

  /* Signature element: the Repair brief carries the verdict at a glance. */
  .brief {
    position: relative; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.25rem 1.4rem; margin-top: 1.25rem;
    overflow: hidden;
  }
  .brief::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
    background: var(--accent);
  }
  .brief h2 { margin-top: 0; border: none; padding: 0; font-size: 1rem; }
  .brief-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: .65rem 1.5rem; margin: .85rem 0 0;
  }
  .brief-grid dt { color: var(--faint); font-size: .74rem; text-transform: uppercase; letter-spacing: .05em; }
  .brief-grid dd { margin: .15rem 0 0; font-weight: 600; }
  .metric-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: .65rem; margin: .65rem 0 1rem;
  }
  .metric-grid div {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: .7rem .85rem;
  }
  .metric-grid dt { color: var(--faint); font-size: .74rem; text-transform: uppercase; letter-spacing: .05em; }
  .metric-grid dd { margin: .25rem 0 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -.02em; }

  .fix-first {
    background: color-mix(in srgb, var(--sev-medium) 9%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--sev-medium) 28%, transparent);
    border-left: 3px solid var(--sev-medium);
    padding: .85rem 1.1rem; border-radius: 0 8px 8px 0; margin: 1rem 0;
  }
  .fix-first h3 { margin: 0 0 .4rem; color: inherit; font-size: .95rem; }
  .fix-first p { margin: .25rem 0; font-size: .9rem; }

  .grade {
    display: inline-flex; align-items: center; padding: .2rem .6rem;
    border-radius: 999px; font-weight: 700; font-size: .85rem; letter-spacing: .01em;
  }
  .grade-A, .grade-B { background: color-mix(in srgb, var(--sev-ok) 16%, transparent); color: var(--sev-ok); }
  .grade-C { background: color-mix(in srgb, var(--sev-medium) 16%, transparent); color: var(--sev-medium); }
  .grade-D { background: color-mix(in srgb, var(--sev-high) 16%, transparent); color: var(--sev-high); }
  .grade-F { background: color-mix(in srgb, var(--sev-critical) 16%, transparent); color: var(--sev-critical); }

  .priority td.rank { color: var(--faint); width: 2rem; font-weight: 600; }
  .priority td.targets { font-size: .8rem; max-width: 30%; }

  /* Severity badges — one shared vocabulary for finding types and tags. */
  .finding-type, .finding-tag {
    display: inline-block; border-radius: 5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .04em; white-space: nowrap;
    background: var(--surface-2); color: var(--muted);
  }
  .finding-type { padding: .12rem .5rem; font-size: .72rem; }
  .finding-tag { padding: .1rem .42rem; font-size: .68rem; margin-left: .3rem; }
  .finding-type.type-cycle, .finding-type.type-barrel-cycle { background: color-mix(in srgb, var(--sev-high) 14%, transparent); color: var(--sev-high); }
  .finding-type.type-layer-violation, .finding-type.type-move-module { background: color-mix(in srgb, var(--sev-critical) 14%, transparent); color: var(--sev-critical); }
  .finding-type.type-contract-violation { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
  .finding-type.type-hot-zone { background: color-mix(in srgb, var(--sev-medium) 16%, transparent); color: var(--sev-medium); }
  .finding-tag.tag-generated { background: color-mix(in srgb, var(--sev-low) 14%, transparent); color: var(--sev-low); }

  .finding-title { font-weight: 600; }
  .finding-action { font-size: .9rem; }
  .finding-reason { font-size: .82rem; color: var(--muted); }
  .finding-verify { font-size: .82rem; color: var(--muted); }
  .targets-line { font-size: .85rem; }

  @media (max-width: 600px) {
    body { padding: 1.5rem 1rem 3rem; }
    table { font-size: .82rem; }
    th, td { padding: .4rem .5rem; }
  }

  /* Printed / shared as PDF: keep cards intact, drop hovers, tighten margins. */
  @media print {
    body { max-width: none; padding: 0; font-size: 11pt; }
    tbody tr:hover { background: transparent; }
    .brief, .metric-grid div, .fix-first, table, tr { break-inside: avoid; }
    h2 { break-after: avoid; }
    a { color: inherit; text-decoration: none; }
  }
`;
