import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { analyze } from '@archora/core';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { buildMarkdownReport } from '../exporters/markdown';
import { buildJUnitReport } from '../exporters/junit';
import { buildHtmlReport } from '../exporters/html';
import { buildFixPlan } from '@archora/core';
import { parseFailOn } from '../lib/failOn';
import { buildExplainView, buildImpactView, buildMatrixView } from '@archora/core';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../../..');

// End-to-end: scan a real fixture, exercise every exporter and a check rule.
// No subprocess - cheap and deterministic; catches integration regressions.
describe('cli smoke', () => {
  it('analyze -> report (md/junit/html) -> check on synth-mfe-loader', async () => {
    const projectPath = resolve(REPO_ROOT, 'fixtures/reference/synth-mfe-loader');
    const source = await createNodeFsFileSource({ rootPath: projectPath });
    const scan = await analyze(source);

    expect(scan.modules.length).toBeGreaterThan(0);

    const md = buildMarkdownReport(scan, null);
    expect(md).toContain('Archora -');
    expect(md).toContain('## Review brief');
    expect(md).toContain('| Status |');
    expect(md).toContain('| Affected areas |');
    expect(md).toContain('## Affected areas');
    expect(md).toContain('| Modules |');
    expect(md).toContain('## Risk buckets');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('feedbackEdges=');

    const junit = buildJUnitReport(scan);
    expect(junit).toMatch(/^<\?xml version="1\.0"/u);
    expect(junit).toContain('<testsuite');

    const html = buildHtmlReport(scan);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Archora');
    expect(html).toContain('Repair brief');
    expect(html).toContain('Affected areas');
    expect(html).toContain('CI gate suggestion');
    expect(html).toContain('Verification plan');
    expect(html).not.toContain('[object Object]');

    const matrix = buildMatrixView(scan, 'area');
    expect(matrix.grouping).toBe('area');
    expect(matrix.cells.length).toBeGreaterThan(0);

    const target = scan.modules[0]!.id;
    const impact = buildImpactView(scan, target);
    expect(impact.target).toBe(target);
    expect(Array.isArray(impact.affectedModules)).toBe(true);

    const explain = buildExplainView(scan, { module: target });
    expect(explain.kind).toBe('module');
    expect(explain.title).toBe(target);

    const fixPlan = buildFixPlan(scan, { exportedAt: '2026-05-12T00:00:00.000Z' });
    expect(fixPlan.kind).toBe('archora-fix-plan');
    expect(fixPlan.version).toBe(1);
    expect(Array.isArray(fixPlan.priorityFindings)).toBe(true);
    for (let i = 1; i < fixPlan.priorityFindings.length; i++) {
      expect(fixPlan.priorityFindings[i - 1]!.weight).toBeGreaterThanOrEqual(
        fixPlan.priorityFindings[i]!.weight,
      );
    }
    for (const f of fixPlan.priorityFindings) {
      expect(f.reason).toBeTruthy();
      expect(f.action).toBeTruthy();
      expect(f.verify).toBeTruthy();
    }

    const rule = parseFailOn('grade:F');
    expect(rule.evaluate(scan, null)).toBe(false);
  });
});
