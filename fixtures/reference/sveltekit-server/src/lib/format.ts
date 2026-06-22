export function formatDate(t: number): string {
  return new Date(t).toISOString();
}
