import type { ScanResult } from '@archora/core';

// JUnit XML: <testsuite> per project, <testcase> per recommendation/cycle.
// Recommendations fail at weight >= 0.6, cycles fail at severity === 'direct'.
export function buildJUnitReport(scan: ScanResult): string {
  const lines: string[] = [];
  const project = scan.project.name;
  const testCount = scan.recommendations.length + scan.cycles.length;
  const failures =
    scan.recommendations.filter((r) => r.weight >= 0.6).length +
    scan.cycles.filter((c) => c.severity === 'direct').length;

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuite name="archora:${escapeXmlAttr(project)}" tests="${testCount}" failures="${failures}" time="${(scan.durationMs / 1000).toFixed(3)}">`,
  );

  for (const r of scan.recommendations) {
    const isFailure = r.weight >= 0.6;
    const name = `${r.kind}/${shortId(r.modules[0] ?? r.id)}`;
    lines.push(
      `  <testcase classname="recommendations.${escapeXmlAttr(r.kind)}" name="${escapeXmlAttr(name)}">`,
    );
    if (isFailure) {
      const message = formatRecommendationMessage(r);
      lines.push(
        `    <failure message="${escapeXmlAttr(message)}">${escapeXmlText(message)}\n${escapeXmlText(r.modules.join('\n'))}</failure>`,
      );
    }
    lines.push('  </testcase>');
  }

  for (const c of scan.cycles) {
    const isFailure = c.severity === 'direct';
    const name = `cycle/${c.id}`;
    lines.push(
      `  <testcase classname="cycles.${escapeXmlAttr(c.severity)}" name="${escapeXmlAttr(name)}">`,
    );
    if (isFailure) {
      const message = `Direct cycle (length ${c.length}): ${c.modules.join(' -> ')}`;
      lines.push(
        `    <failure message="${escapeXmlAttr(message)}">${escapeXmlText(message)}</failure>`,
      );
    }
    lines.push('  </testcase>');
  }

  lines.push('</testsuite>');
  return lines.join('\n');
}

function formatRecommendationMessage(r: ScanResult['recommendations'][number]): string {
  const params = Object.entries(r.params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ');
  return `${r.kind}: ${params}`;
}

function shortId(id: string): string {
  const i = id.lastIndexOf('/');
  return i === -1 ? id : id.slice(i + 1);
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function escapeXmlText(s: string): string {
  return s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}
