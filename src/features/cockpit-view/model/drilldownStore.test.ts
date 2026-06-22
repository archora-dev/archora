import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDrilldownStore } from './drilldownStore';

describe('drilldownStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('opens a surface with an optional focused module', () => {
    const s = useDrilldownStore();
    s.open('impact', 'src/x.ts');
    expect(s.surface).toBe('impact');
    expect(s.focusedModule).toBe('src/x.ts');
  });

  it('close clears the surface', () => {
    const s = useDrilldownStore();
    s.open('explorer');
    s.close();
    expect(s.surface).toBeNull();
    expect(s.focusedModule).toBeNull();
  });

  it('drillTo remembers the prior surface so back returns to it', () => {
    const s = useDrilldownStore();
    s.open('change-risk');
    expect(s.canGoBack).toBe(false);

    s.drillTo('impact', 'src/a.ts');
    expect(s.surface).toBe('impact');
    expect(s.focusedModule).toBe('src/a.ts');
    expect(s.canGoBack).toBe(true);

    s.back();
    expect(s.surface).toBe('change-risk');
    expect(s.focusedModule).toBeNull();
    expect(s.canGoBack).toBe(false);
  });

  it('open is a fresh navigation that clears the back trail', () => {
    const s = useDrilldownStore();
    s.open('change-risk');
    s.drillTo('impact', 'src/a.ts');
    s.open('ownership');
    expect(s.canGoBack).toBe(false);
  });
});
