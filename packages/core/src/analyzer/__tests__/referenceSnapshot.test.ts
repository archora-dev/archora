import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../index';
import { createNodeFsFileSource } from '../sources/nodeFsFileSource';
import { fixturePath } from './_paths';

/**
 * Snapshot tests on the benchmark reference corpus.
 *
 * We pin two things per reference project: the count of recommendations
 * per kind, and the total number of modules / edges. This separates
 * regressions in the heuristics (changes to recommendation counts) from
 * changes to ground-truth annotations (which only affect bench TP/FP/FN).
 *
 * If a heuristic intentionally changes, `npm test -- -u` regenerates the
 * snapshot. The change must be co-justified with bench numbers in the PR.
 */
const REFERENCE_ROOT = fixturePath('../fixtures/reference');

function listReferenceProjects(): string[] {
  try {
    return readdirSync(REFERENCE_ROOT)
      .filter((name) => {
        try {
          return statSync(join(REFERENCE_ROOT, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

const projects = listReferenceProjects();

describe.skipIf(projects.length === 0)('reference corpus snapshots', () => {
  for (const name of projects) {
    it(`${name}: stable summary`, async () => {
      const source = await createNodeFsFileSource({ rootPath: join(REFERENCE_ROOT, name) });
      const result = await analyze(source);
      const byKind: Record<string, number> = {};
      for (const r of result.recommendations) {
        byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      }
      // stable order
      const sortedByKind = Object.fromEntries(
        Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b)),
      );
      expect({
        project: name,
        modules: result.modules.length,
        edges: result.edges.length,
        cycles: result.cycles.length,
        recommendations: result.recommendations.length,
        recommendationsByKind: sortedByKind,
        archDebtGrade: result.archDebt.grade,
      }).toMatchSnapshot();
    });
  }
});
