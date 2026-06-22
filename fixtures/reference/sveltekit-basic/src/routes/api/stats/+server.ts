// SvelteKit server endpoint: GET /api/stats. File-system route, not imported.
import { fetchStats } from '$lib/utils/stats';

export async function GET(): Promise<Response> {
  const stats = await fetchStats();
  return new Response(JSON.stringify(stats), {
    headers: { 'content-type': 'application/json' },
  });
}
