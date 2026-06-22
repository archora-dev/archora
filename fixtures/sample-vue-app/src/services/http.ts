import { interceptError } from '@/services/errors';

export async function request<T>(url: string): Promise<T> {
  try {
    const r = await fetch(url);
    return (await r.json()) as T;
  } catch (e) {
    interceptError(e);
    throw e;
  }
}
