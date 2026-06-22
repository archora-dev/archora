import type { Shared } from './a';

export function runBar(): number {
  return 1;
}

export type Wrap = Shared & { kind: 'wrap' };
