// Git barrel. Node-only consumers (CLI, scripts) can import the
// entire module; browser bundles only ever pull `parseGitLog` / `computeChurn`
// (pure, no `node:*`) via deep imports if needed.

export type {
  ChurnAuthor,
  ChurnByModule,
  ChurnMetric,
  GitCommit,
  GitFileChange,
  GitHistory,
} from './types';
export { parseGitLog, expandRename } from './parseGitLog';
export { computeChurn, type ComputeChurnInput } from './computeChurn';
export {
  computeTemporalCoupling,
  type ComputeTemporalCouplingInput,
} from './computeTemporalCoupling';
export {
  readGitHistory,
  expandSince,
  GitNotAvailableError,
  type ReadGitHistoryOptions,
} from './readGitHistory';
