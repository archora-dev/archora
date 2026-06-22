import type { Recommendation, ScanResult } from '@/core/analyzer/types';
import { applyTypeOnlyFix, type ApplyTypeOnlyFixResult } from '@/core/codegen/applyTypeOnlyFix';
import type { FileSource } from '@/core/analyzer/fileSource';
import { isTauri, tauriInvoke } from '@/shared/lib';

export class ApplyFixError extends Error {
  readonly code:
    | 'unsupported-recommendation'
    | 'module-not-found'
    | 'read-failed'
    | 'write-failed'
    | 'codegen-failed'
    | 'scan-stale';
  constructor(code: ApplyFixError['code'], message: string) {
    super(message);
    this.name = 'ApplyFixError';
    this.code = code;
  }
}

/** Scan results older than this are considered stale; force a rescan first. */
export const SCAN_STALE_MS = 5 * 60 * 1000;

/** Backups older than this are auto-cleaned on each apply. */
export const BACKUP_TTL_SECS = 7 * 24 * 60 * 60;

export function isScanStale(scan: ScanResult, now = Date.now()): boolean {
  const t = Date.parse(scan.scannedAt);
  if (Number.isNaN(t)) return true;
  return now - t > SCAN_STALE_MS;
}

export interface PreparedFix {
  rec: Recommendation;
  filePath: string;
  language: 'ts' | 'js' | 'vue' | 'svelte';
  before: string;
  after: string;
  result: ApplyTypeOnlyFixResult;
}

/**
 * Read the file from the active source and compute the patched content.
 * Pure-ish: no filesystem mutation, no rescan.
 */
export async function prepareTypeOnlyFix(args: {
  rec: Recommendation;
  scan: ScanResult;
  source: FileSource;
}): Promise<PreparedFix> {
  const { rec, scan, source } = args;
  if (rec.kind !== 'type-only-candidate') {
    throw new ApplyFixError(
      'unsupported-recommendation',
      `apply-fix only supports type-only-candidate, got ${rec.kind}`,
    );
  }
  const filePath = rec.modules[0];
  const specifier = String(rec.params.specifier ?? '');
  const bindings = String(rec.params.bindings ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!filePath || !specifier || bindings.length === 0) {
    throw new ApplyFixError(
      'codegen-failed',
      'recommendation is missing filePath/specifier/bindings',
    );
  }

  const mod = scan.modules.find((m) => m.id === filePath);
  if (!mod) {
    throw new ApplyFixError('module-not-found', `module ${filePath} not in scan result`);
  }
  if (
    mod.language !== 'ts' &&
    mod.language !== 'js' &&
    mod.language !== 'vue' &&
    mod.language !== 'svelte'
  ) {
    throw new ApplyFixError('codegen-failed', `unsupported language ${mod.language as string}`);
  }

  let before: string;
  try {
    before = await source.read(filePath);
  } catch (e) {
    throw new ApplyFixError('read-failed', `cannot read ${filePath}: ${errMsg(e)}`);
  }

  let result: ApplyTypeOnlyFixResult;
  try {
    result = applyTypeOnlyFix({
      filePath,
      content: before,
      language: mod.language,
      specifier,
      bindings,
    });
  } catch (e) {
    throw new ApplyFixError('codegen-failed', errMsg(e));
  }

  return {
    rec,
    filePath,
    language: mod.language,
    before,
    after: result.patchedContent,
    result,
  };
}

export interface ApplyFixWriteInput {
  prepared: PreparedFix;
  /** Absolute path to the project root. Used to resolve absolute target/backup paths. */
  rootPath: string;
}

export interface ApplyFixWriteOutput {
  absPath: string;
  backupPath: string | null;
}

/**
 * Persist the patched content. Tauri-only - in browser builds the apply
 * action is unavailable (caller should expose "Copy patch" instead).
 *
 * Side effects:
 *   - writes a backup copy to `<root>/.archora/backups/<ts>-<safe>.bak`
 *   - writes patched content over the original file
 *   - cleans up backups older than BACKUP_TTL_SECS
 */
export async function writeTypeOnlyFix(input: ApplyFixWriteInput): Promise<ApplyFixWriteOutput> {
  if (!isTauri()) {
    throw new ApplyFixError('write-failed', 'writing fixes requires the Tauri runtime');
  }
  const { prepared, rootPath } = input;
  const sep = detectSep(rootPath);
  const absPath = joinPath(rootPath, prepared.filePath, sep);
  const backupDir = joinPath(rootPath, `.archora${sep}backups`, sep);
  const backupPath = joinPath(backupDir, makeBackupName(prepared.filePath), sep);

  try {
    await tauriInvoke<void>('write_backup_file', {
      path: backupPath,
      content: prepared.before,
    });
  } catch (e) {
    throw new ApplyFixError('write-failed', `backup failed: ${errMsg(e)}`);
  }

  try {
    await tauriInvoke<void>('write_text_file', {
      path: absPath,
      content: prepared.after,
    });
  } catch (e) {
    throw new ApplyFixError('write-failed', `write failed: ${errMsg(e)} (path=${absPath})`);
  }

  // Best-effort cleanup; never fail the apply because of it.
  void tauriInvoke<number>('cleanup_old_files', {
    dir: backupDir.replace(/[\\/]+$/u, ''),
    maxAgeSecs: BACKUP_TTL_SECS,
  }).catch(() => undefined);

  return { absPath, backupPath };
}

// Tauri's `invoke` rejects with the Err(String) value verbatim, not an Error
// instance, so `(e as Error).message` evaluates to undefined. Normalize so
// users see the actual backend message ("No such file…", "Permission denied")
// instead of the literal "undefined".
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

// ---- path helpers (no node:path - this runs in WebView) -------------------

function detectSep(rootPath: string): '/' | '\\' {
  return rootPath.includes('\\') && !rootPath.includes('/') ? '\\' : '/';
}

function joinPath(a: string, b: string, sep: '/' | '\\'): string {
  if (b === '') return a.replace(/[\\/]+$/u, '') + sep;
  const left = a.replace(/[\\/]+$/u, '');
  const right = b.replace(/^[\\/]+/u, '').replace(/[\\/]/gu, sep);
  return `${left}${sep}${right}`;
}

function makeBackupName(relPath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const safe = relPath.replace(/[\\/]/gu, '__').replace(/[^\w.-]+/gu, '_');
  return `${stamp}-${safe}.bak`;
}
