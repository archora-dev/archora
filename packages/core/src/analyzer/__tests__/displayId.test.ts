import { describe, it, expect } from 'vitest';
import { displayShortId } from '../displayId';

describe('displayShortId', () => {
  it('returns bare basename for unique filenames', () => {
    expect(displayShortId('src/utils/cn.ts')).toBe('cn.ts');
    expect(displayShortId('src/components/UserCard.vue')).toBe('UserCard.vue');
  });

  it('prepends parent for ambiguous index.* files', () => {
    expect(displayShortId('src/router/index.ts')).toBe('router/index.ts');
    expect(displayShortId('packages/core/src/index.ts')).toBe('src/index.ts');
  });

  it('prepends parent for SvelteKit special files', () => {
    expect(displayShortId('src/routes/users/+page.svelte')).toBe('users/+page.svelte');
    expect(displayShortId('src/routes/api/+server.ts')).toBe('api/+server.ts');
    expect(displayShortId('src/routes/+layout.ts')).toBe('routes/+layout.ts');
  });

  it('prepends parent for main/app/root', () => {
    expect(displayShortId('src/main.ts')).toBe('src/main.ts');
    expect(displayShortId('src/app.vue')).toBe('src/app.vue');
  });

  it('returns id as-is when there is no slash', () => {
    expect(displayShortId('main.ts')).toBe('main.ts');
    expect(displayShortId('userService')).toBe('userService');
  });
});
