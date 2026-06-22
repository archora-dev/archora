import type { ScanResult } from '../analyzer/types';

export interface ReportEnvelope {
  /** Schema/format version for forward-compat. Bump if shape changes. */
  schema: 1;
  /** Application version that produced the report. */
  app: string;
  /** ISO timestamp of export. */
  exportedAt: string;
  scan: ScanResult;
}

export interface BuildReportOptions {
  appVersion?: string;
  exportedAt?: string;
  pretty?: boolean;
}

export function buildJsonReport(scan: ScanResult, options: BuildReportOptions = {}): string {
  const envelope: ReportEnvelope = {
    schema: 1,
    app: options.appVersion ?? 'archora',
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    scan,
  };
  return options.pretty === false ? JSON.stringify(envelope) : JSON.stringify(envelope, null, 2);
}
