import { errorTag } from '@/services/errors';

export function logError(msg: string): void {
  console.warn(`[${errorTag}]`, msg);
}
