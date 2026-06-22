import { logError } from '@/services/logger';

export function interceptError(e: unknown): void {
  logError(String(e));
}

export const errorTag = 'err';
