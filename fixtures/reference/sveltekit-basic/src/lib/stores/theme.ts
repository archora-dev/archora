import { writable, type Writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

export const theme: Writable<Theme> = writable<Theme>('light');

export function toggle(): void {
  theme.update((t) => (t === 'light' ? 'dark' : 'light'));
}
