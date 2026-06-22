import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@/core/analyzer/types';
import { envelopeToRow, rowToSnapshot, scanToEnvelope } from './snapshotRecord';

function scanFixture(scannedAt = '2026-06-20T10:00:00.000Z'): ScanResult {
  return {
    project: { id: 'proj-1', name: 'demo', rootPath: '/x', detectedFramework: 'vue' },
    modules: [],
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
    scannedAt,
    durationMs: 12,
    warnings: [],
  };
}

describe('snapshotRecord', () => {
  it('wraps a scan into a schema:1 envelope', () => {
    const env = scanToEnvelope(scanFixture(), '1.3.0');
    expect(env).toMatchObject({ schema: 1, app: '1.3.0', scan: { project: { id: 'proj-1' } } });
    expect(typeof env.exportedAt).toBe('string');
  });

  it('maps an envelope to a flat row keyed by project and scan time', () => {
    const env = scanToEnvelope(scanFixture('2026-06-20T10:00:00.000Z'), '1.3.0');
    const row = envelopeToRow('proj-1', env);
    expect(row).toMatchObject({
      projectId: 'proj-1',
      scannedAt: '2026-06-20T10:00:00.000Z',
      appVersion: '1.3.0',
    });
    expect(JSON.parse(row.envelope).schema).toBe(1);
  });

  it('round-trips a row back into a Snapshot', () => {
    const env = scanToEnvelope(scanFixture('2026-06-20T10:00:00.000Z'), '1.3.0');
    const snap = rowToSnapshot(envelopeToRow('proj-1', env));
    expect(snap).toMatchObject({ projectId: 'proj-1', scannedAt: '2026-06-20T10:00:00.000Z' });
    expect(snap.scan.project.id).toBe('proj-1');
  });
});
