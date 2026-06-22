export { default as ApplyFixDialog } from './ui/ApplyFixDialog.vue';
export {
  prepareTypeOnlyFix,
  writeTypeOnlyFix,
  isScanStale,
  ApplyFixError,
  SCAN_STALE_MS,
  BACKUP_TTL_SECS,
} from './lib/applyFix';
export type { PreparedFix } from './lib/applyFix';
export { diffLines, withContext, buildUnifiedPatch } from './lib/lineDiff';
export type { DiffOp, DiffRow } from './lib/lineDiff';
