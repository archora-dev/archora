import { readFile } from 'node:fs/promises';
import type { ReportEnvelope } from '@archora/core';
import type { ScanResult } from '@archora/core';

// Reads a `ReportEnvelope` (wrapper) or a raw `ScanResult` for forward-compat.
export async function loadScan(filePath: string): Promise<ScanResult> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as ReportEnvelope | ScanResult;
  if ('scan' in parsed && 'schema' in parsed) {
    return parsed.scan;
  }
  return parsed as ScanResult;
}
