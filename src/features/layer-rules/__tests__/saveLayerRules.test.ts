import { describe, expect, it } from 'vitest';
import { serializeForBrowser } from '../lib/saveLayerRules';

describe('serializeForBrowser', () => {
  it('returns an empty object stub for no overrides', () => {
    expect(serializeForBrowser({})).toBe('{}\n');
  });

  it('emits a `layerOverrides` snippet with stable formatting', () => {
    const out = serializeForBrowser({
      'src/lib/**': 'shared',
      'src/api/**': 'features',
    });
    expect(out).toBe(
      [
        '{',
        '  "layerOverrides": {',
        '    "src/lib/**": "shared",',
        '    "src/api/**": "features"',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });
});
