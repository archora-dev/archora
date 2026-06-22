import { ref } from 'vue';

export function useTheme() {
  const mode = ref<'light' | 'dark'>('light');
  const toggle = (): void => {
    mode.value = mode.value === 'light' ? 'dark' : 'light';
  };
  return { mode, toggle };
}
