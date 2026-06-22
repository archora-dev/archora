// scan worker: runs analyze() against an in-memory snapshot
import { analyze, type AnalyzeOptions } from '@/core/analyzer';
import { createInMemoryFileSource } from '@/core/analyzer/sources/inMemoryFileSource';
import type { ScanResult, ScanProgressEvent } from '@/core/analyzer/types';

interface AnalyzeMessage {
  type: 'analyze';
  rootPath: string;
  files: Record<string, string>;
  options?: Omit<AnalyzeOptions, 'onProgress'>;
}

type IncomingMessage = AnalyzeMessage;

type OutgoingMessage =
  | { type: 'progress'; payload: ScanProgressEvent }
  | { type: 'done'; payload: ScanResult }
  | { type: 'error'; message: string };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<IncomingMessage>) => {
  const data = event.data;
  if (data.type !== 'analyze') return;
  try {
    const source = createInMemoryFileSource(data.rootPath, data.files);
    const result = await analyze(source, {
      ...(data.options ?? {}),
      onProgress: (ev) => post({ type: 'progress', payload: ev }),
    });
    post({ type: 'done', payload: result });
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

function post(msg: OutgoingMessage): void {
  ctx.postMessage(msg);
}
