export async function listUsers(): Promise<{ id: number; name: string }[]> {
  return [{ id: 1, name: 'Ada' }];
}
