import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, getStoredMode } from './themeProvider';

describe('themeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies light theme to documentElement', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(getStoredMode()).toBe('light');
  });

  it('applies dark theme', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('falls back to dark mode when nothing stored', () => {
    expect(getStoredMode()).toBe('dark');
  });
});
