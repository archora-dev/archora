import { analyze, incrementalAnalyze } from '@/core/analyzer';
import type { FileSource } from '@/core/analyzer/fileSource';
import type { AnalyzeOptions, IncrementalAnalyzeInput } from '@/core/analyzer';
import type { ScanResult } from '@/core/analyzer/types';

export function runInlineAnalyze(
  source: FileSource,
  options: AnalyzeOptions = {},
): Promise<ScanResult> {
  return analyze(source, options);
}

export function runIncrementalAnalyze(input: IncrementalAnalyzeInput): Promise<ScanResult> {
  return incrementalAnalyze(input);
}
