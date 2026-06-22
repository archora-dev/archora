// Loads an MFE by name from `src/mfes/<name>/index.ts`.
// At runtime this resolves to a real module — but a naive static analyzer
// only sees the `import()` call with a template literal and skips it.
export async function dynamicMfeLoader(
  name: string,
): Promise<{ mount: (el: HTMLElement) => void }> {
  const mod = await import(`../mfes/${name}/index`);
  return mod.default;
}
