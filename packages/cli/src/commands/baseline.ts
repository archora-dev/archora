import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { analyze, buildJsonReport } from '@archora/core';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagBool, flagString, type ParsedArgv } from '../argv';
import { resolveProjectPath } from './analyze';

export async function runBaseline(parsed: ParsedArgv): Promise<number> {
  const sub = parsed.positional[0];
  if (sub !== 'write') {
    process.stderr.write('error: unknown baseline subcommand. Supported: write.\n');
    return 2;
  }

  const projectPath = resolveProjectPath({ ...parsed, positional: parsed.positional.slice(1) });
  const out = flagString(parsed, 'output') ?? flagString(parsed, 'o');
  if (!out) {
    process.stderr.write('error: baseline write requires --output <file>.\n');
    return 2;
  }

  const quiet = flagBool(parsed, 'quiet');
  if (!quiet) console.error(`Writing baseline for ${projectPath} …`);

  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const scan = await analyze(source);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${buildJsonReport(scan)}\n`, 'utf-8');

  if (!quiet) console.error(`Wrote baseline ${out}`);
  return 0;
}
