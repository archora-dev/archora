// Theme primitives live in shared so any FSD layer (incl. the Settings page)
// can read and toggle the theme without importing an upper layer. Kept here as
// a re-export for the app bootstrap (`main.ts`) and existing callers.
export {
  applyTheme,
  getStoredMode,
  applyInitialTheme,
  useTheme,
  type ThemeMode,
} from '@/shared/lib/theme';
