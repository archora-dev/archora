// SvelteKit `load` runs at route-resolution time. Picked up by file-name
// convention, never imported statically.
import { fetchStats } from '$lib/utils/stats';

export async function load(): Promise<{ stats: Array<{ label: string; value: number }> }> {
  return { stats: await fetchStats() };
}
