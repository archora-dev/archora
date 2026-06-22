import type { ScanResult } from '@/core/analyzer/types';
import type { ReportEnvelope } from '@/core/report/buildJsonReport';
import type { Snapshot } from './historyStore';

export interface SnapshotRow {
  projectId: string;
  scannedAt: string;
  appVersion: string;
  exportedAt: string;
  /** Serialized ReportEnvelope (schema:1). */
  envelope: string;
}

export function scanToEnvelope(scan: ScanResult, appVersion: string): ReportEnvelope {
  return { schema: 1, app: appVersion, exportedAt: new Date().toISOString(), scan };
}

export function envelopeToRow(projectId: string, envelope: ReportEnvelope): SnapshotRow {
  return {
    projectId,
    scannedAt: envelope.scan.scannedAt,
    appVersion: envelope.app,
    exportedAt: envelope.exportedAt,
    envelope: JSON.stringify(envelope),
  };
}

export function rowToSnapshot(row: SnapshotRow): Snapshot {
  const envelope = JSON.parse(row.envelope) as ReportEnvelope;
  return { scannedAt: row.scannedAt, projectId: row.projectId, scan: envelope.scan };
}
