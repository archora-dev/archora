import { describe, expect, it } from 'vitest';
import { moduleLabel } from '../moduleLabel';

describe('moduleLabel', () => {
  it('returns parent/basename for any file with a parent folder', () => {
    expect(moduleLabel('src/features/auth/useAuth.ts')).toBe('auth/useAuth.ts');
    expect(moduleLabel('a/b/c/utils.ts')).toBe('c/utils.ts');
  });

  it('disambiguates same-named files in different folders', () => {
    expect(moduleLabel('packages/core/useMouse/demo.vue')).toBe('useMouse/demo.vue');
    expect(moduleLabel('packages/core/useEvent/demo.vue')).toBe('useEvent/demo.vue');
    expect(moduleLabel('packages/core/useEventListener/index.ts')).toBe(
      'useEventListener/index.ts',
    );
    expect(moduleLabel('packages/core/index.ts')).toBe('core/index.ts');
  });

  it('falls back to the bare name when there is no parent segment', () => {
    expect(moduleLabel('index.ts')).toBe('index.ts');
    expect(moduleLabel('main.ts')).toBe('main.ts');
  });
});
