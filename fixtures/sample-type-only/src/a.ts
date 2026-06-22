import { runBar } from './b';

export type Shared = { id: number };

export function trigger(): number {
  return runBar();
}
