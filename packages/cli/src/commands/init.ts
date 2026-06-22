import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildInitialArchoraConfig,
  buildInitialArchoraConfigJson,
  type InitialArchoraDetection,
} from '@archora/core';
import { createNodeFsFileSource } from '@archora/core/analyzer/sources/nodeFsFileSource';
import { flagBool, type ParsedArgv } from '../argv';
import { resolveProjectPath } from './analyze';

const CONFIG_FILE = '.archora.json';

export async function runInit(parsed: ParsedArgv): Promise<number> {
  const projectPath = resolveProjectPath(parsed);
  const quiet = flagBool(parsed, 'quiet');
  const dryRun = flagBool(parsed, 'dry-run');
  const force = flagBool(parsed, 'force');
  const configPath = join(projectPath, CONFIG_FILE);

  if (existsSync(configPath) && !force && !dryRun) {
    process.stderr.write(`error: ${CONFIG_FILE} already exists. Use --force to overwrite.\n`);
    return 2;
  }

  const source = await createNodeFsFileSource({ rootPath: projectPath });
  const files = await source.list();
  const packageJsonText = await readOptional(join(projectPath, 'package.json'));
  const json = buildInitialArchoraConfigJson({
    files,
    ...(packageJsonText ? { packageJsonText } : {}),
  });

  if (dryRun) {
    process.stdout.write(json);
  } else {
    await writeFile(configPath, json, 'utf-8');
  }

  if (!quiet) {
    const result = buildInitialArchoraConfig({
      files,
      ...(packageJsonText ? { packageJsonText } : {}),
    });
    const action = dryRun ? 'Prepared' : 'Wrote';
    process.stderr.write(`${action} ${CONFIG_FILE}${formatDetections(result.detected)}.\n`);
  }

  return 0;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return undefined;
  }
}

function formatDetections(detected: readonly InitialArchoraDetection[]): string {
  if (detected.length === 0) return '';
  return ` (${detected.join(', ')})`;
}
