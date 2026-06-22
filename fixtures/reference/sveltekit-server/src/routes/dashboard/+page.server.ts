import { loadFromDb } from '$lib/server';

export async function load() {
  return { user: await loadFromDb() };
}
