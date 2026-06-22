import { formatDate } from '$lib/format';
export const csr = true;
export function load(data: { user: { createdAt: number } }) {
  return { stamp: formatDate(data.user.createdAt) };
}
