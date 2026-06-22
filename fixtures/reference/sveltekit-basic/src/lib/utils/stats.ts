export async function fetchStats(): Promise<Array<{ label: string; value: number }>> {
  return [
    { label: 'Users', value: 1230 },
    { label: 'Sessions', value: 4821 },
    { label: 'Errors', value: 12 },
  ];
}
