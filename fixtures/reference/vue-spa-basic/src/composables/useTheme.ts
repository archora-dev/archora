import { ref, type Ref } from 'vue';

export type Theme = 'light' | 'dark';

const theme: Ref<Theme> = ref<Theme>('light');

export function useTheme(): { theme: Ref<Theme>; toggle: () => void } {
  return {
    theme,
    toggle: () => {
      theme.value = theme.value === 'light' ? 'dark' : 'light';
    },
  };
}
