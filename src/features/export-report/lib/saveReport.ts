import type { ScanResult } from '@/core/analyzer/types';
import { buildJsonReport } from '@/core/report/buildJsonReport';
import { useExportHistoryStore } from '@/entities/exportHistory';
import { isTauri, tauriInvoke } from '@/shared/lib';

export type ReportFormat = 'json' | 'html';
export type ReportScope = 'full' | 'fix-plan';

export class SaveReportCancelledError extends Error {
  constructor() {
    super('Save was cancelled');
    this.name = 'SaveReportCancelledError';
  }
}

export interface SaveReportInput {
  scan: ScanResult;
  format: ReportFormat;
  scope?: ReportScope;
  appVersion?: string;
}

export interface SaveReportOutput {
  exportedAt: string;
  fileName: string;
  format: ReportFormat;
  scope: ReportScope;
  path?: string;
}

export async function saveReport(input: SaveReportInput): Promise<SaveReportOutput> {
  const { scan, format, appVersion, scope = 'full' } = input;
  const exportedAt = new Date().toISOString();
  const slug = sanitize(scan.project.name) || 'report';
  const stamp = exportedAt.replace(/[:.]/g, '-');
  const scopeSlug = scope === 'fix-plan' ? 'fix-plan' : 'report';
  const fileName = `archora-${slug}-${scopeSlug}-${stamp}.${format}`;

  const reportOptions = { exportedAt, ...(appVersion !== undefined ? { appVersion } : {}) };
  let content: string;
  if (scope === 'fix-plan') {
    if (format === 'html') {
      const { buildFixPlanHtmlReport } = await import('./buildFixPlanHtmlReport');
      content = buildFixPlanHtmlReport(scan, reportOptions);
    } else {
      const { buildFixPlanReport } = await import('./buildFixPlanReport');
      content = buildFixPlanReport(scan, reportOptions);
    }
  } else if (format === 'json') {
    content = buildJsonReport(scan, reportOptions);
  } else {
    const { buildHtmlReport } = await import('./buildHtmlReport');
    content = buildHtmlReport(scan, reportOptions);
  }

  let path: string | undefined;
  if (isTauri()) {
    path = await saveViaTauri(fileName, format, content);
  } else {
    saveViaBrowser(fileName, format, content);
  }
  const output = {
    exportedAt,
    fileName,
    format,
    scope,
    ...(path ? { path } : {}),
  };
  useExportHistoryStore().add({
    projectId: scan.project.id,
    projectName: scan.project.name,
    exportedAt,
    scope,
    format,
    fileName,
    ...(path ? { path } : {}),
  });
  return output;
}

async function saveViaTauri(
  defaultName: string,
  format: ReportFormat,
  content: string,
): Promise<string> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({
    defaultPath: defaultName,
    filters: [
      format === 'json'
        ? { name: 'JSON', extensions: ['json'] }
        : { name: 'HTML', extensions: ['html'] },
    ],
  });
  if (!path) throw new SaveReportCancelledError();
  await tauriInvoke<void>('write_text_file', { path, content });
  return path;
}

function saveViaBrowser(fileName: string, format: ReportFormat, content: string): void {
  const mime = format === 'json' ? 'application/json' : 'text/html';
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sanitize(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}
