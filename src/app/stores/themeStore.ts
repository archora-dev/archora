import { defineStore } from 'pinia';
import { useTheme } from '@/shared/lib';
import { markStartup } from '@/shared/lib/startupTiming';

export const useThemeStore = defineStore('theme', () => {
  markStartup('theme store init started');
  const { mode, setMode } = useTheme();
  markStartup('theme store init finished', `mode=${mode.value}`);

  return { mode, setMode };
});
