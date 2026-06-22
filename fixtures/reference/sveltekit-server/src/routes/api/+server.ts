import { loadFromDb } from '$lib/server';

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(await loadFromDb()), { headers: { 'content-type': 'application/json' } });
}
