export async function loadFromDb(): Promise<{ name: string; createdAt: number }> {
  return { name: 'Ada', createdAt: Date.now() };
}
