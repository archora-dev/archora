import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import { buildCommandItems } from './buildCommandItems';

const labels = {
  surfaces: {
    explorer: 'Explorer',
    impact: 'Impact',
    rules: 'Rules',
    'scan-info': 'Scan info',
    'change-risk': 'Change risk',
    'dead-code': 'Dead code',
    ownership: 'Area risk',
  },
};

function scan(): ScanResult {
  return {
    project: { id: 'p', name: 'p', rootPath: '/x', detectedFramework: 'vue' },
    modules: [
      {
        id: 'src/a.ts',
        absPath: '/a',
        kind: 'module',
        language: 'ts',
        loc: 1,
        exports: [],
        isInfra: false,
      },
    ],
    edges: [],
    cycles: [],
    metrics: {},
    hotZones: [],
    layerViolations: [],
    archDebt: {
      score: 0,
      grade: 'A',
      breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
    },
    recommendations: [],
    contractViolations: [],
    scannedAt: 't',
    durationMs: 1,
    warnings: [],
  };
}

describe('buildCommandItems', () => {
  it('lists the global surfaces, but not the per-module Impact surface', () => {
    const items = buildCommandItems(scan(), labels);
    const surfaces = items.filter((i) => i.action.kind === 'surface').map((i) => i.value);
    expect(surfaces).toEqual([
      'surface:change-risk',
      'surface:dead-code',
      'surface:ownership',
      'surface:explorer',
      'surface:rules',
      'surface:scan-info',
    ]);
    expect(surfaces).not.toContain('surface:impact');
  });

  it('includes a jump entry per module', () => {
    const items = buildCommandItems(scan(), labels);
    expect(items.find((i) => i.value === 'module:src/a.ts')).toMatchObject({
      action: { kind: 'module', moduleId: 'src/a.ts' },
    });
  });

  it('returns no items when no project is scanned (palette shows empty text)', () => {
    expect(buildCommandItems(null, labels)).toEqual([]);
  });
});
