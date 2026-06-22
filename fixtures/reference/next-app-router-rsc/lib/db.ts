'use server';

export async function fetchUser(): Promise<{ name: string; createdAt: number }> {
  return { name: 'Ada', createdAt: Date.now() };
}
