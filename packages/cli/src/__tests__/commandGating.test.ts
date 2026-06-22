import { describe, expect, it } from 'vitest';
import { requiresPro } from '../lib/commandGating';

describe('requiresPro', () => {
  const freeCommands = [
    'init',
    'baseline',
    'analyze',
    'diff',
    'report',
    'check',
    'ci',
    'watch',
    'cache',
    'suggest',
    'matrix',
    'impact',
    'explain',
    'review',
    'ownership',
    'semantic',
    'hygiene',
    'trend',
  ];

  it('treats every current command as free (open-core)', () => {
    for (const command of freeCommands) {
      expect(requiresPro(command)).toBe(false);
    }
  });

  it('returns false for unknown commands', () => {
    expect(requiresPro('definitely-not-a-command')).toBe(false);
  });
});
