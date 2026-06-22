import { analyze, type ScanResult } from '@archora/core';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagString, type ParsedArgv } from '../argv';
import { resolveProjectPath } from '../commands/analyze';
import { loadScan } from './loadScan';

export async function readScanInput(
  parsed: ParsedArgv,
  quiet: boolean,
): Promise<{ scan: ScanResult; sourceLabel: string }> {
  const input = flagString(parsed, 'input');
  if (input) {
    if (!quiet) console.error(`Reading scan ${input} …`);
    return { scan: await loadScan(input), sourceLabel: input };
  }

  const projectPath = resolveProjectPath(parsed);
  if (!quiet) console.error(`Scanning ${projectPath} …`);
  const source = await createNodeFsFileSource({ rootPath: projectPath });
  return { scan: await analyze(source), sourceLabel: projectPath };
}
