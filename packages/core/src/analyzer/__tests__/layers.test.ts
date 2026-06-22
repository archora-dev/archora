import { describe, expect, it } from 'vitest';
import { detectLayer, detectLayerViolations } from '../layers';
import type { DependencyEdge, ModuleNode } from '../types';

function module(id: string, overrides: Partial<ModuleNode> = {}): ModuleNode {
  return {
    id,
    absPath: `/${id}`,
    kind: 'unknown',
    language: 'ts',
    loc: 1,
    exports: [],
    isInfra: false,
    ...overrides,
  };
}

function edge(from: string, to: string, kind: DependencyEdge['kind'] = 'static'): DependencyEdge {
  return { from, to, kind, specifier: to, resolved: true };
}

describe('detectLayer', () => {
  it('extracts the FSD layer from src/<layer>/ paths', () => {
    expect(detectLayer('src/widgets/Foo.vue')).toBe('widgets');
    expect(detectLayer('src/features/auth/login.ts')).toBe('features');
    expect(detectLayer('src/shared/ui/Button.vue')).toBe('shared');
  });

  it('works without src/ prefix', () => {
    expect(detectLayer('entities/order/model.ts')).toBe('entities');
  });

  it('returns unknown for non-FSD paths', () => {
    expect(detectLayer('vendor/lib.ts')).toBe('unknown');
    expect(detectLayer('main.ts')).toBe('unknown');
  });

  it('does not match layer names nested deeper than the first segment', () => {
    expect(detectLayer('src/lib/app/something.ts')).toBe('unknown');
  });
});

describe('detectLayerViolations', () => {
  it('flags entities → widgets as a violation (warning severity)', () => {
    const modules = [
      module('src/entities/order/model.ts'),
      module('src/widgets/order-card/OrderCard.vue'),
    ];
    const edges = [edge('src/entities/order/model.ts', 'src/widgets/order-card/OrderCard.vue')];
    const v = detectLayerViolations(modules, edges);
    expect(v).toHaveLength(1);
    expect(v[0]?.fromLayer).toBe('entities');
    expect(v[0]?.toLayer).toBe('widgets');
    expect(v[0]?.severity).toBe('warning');
  });

  it('escalates deep → top-level imports to error severity', () => {
    const modules = [module('src/shared/lib/x.ts'), module('src/pages/Home.vue')];
    const edges = [edge('src/shared/lib/x.ts', 'src/pages/Home.vue')];
    const v = detectLayerViolations(modules, edges);
    expect(v[0]?.severity).toBe('error');
  });

  it('does not flag allowed top-down imports (widgets → entities)', () => {
    const modules = [
      module('src/widgets/order-card/OrderCard.vue'),
      module('src/entities/order/model.ts'),
    ];
    const edges = [edge('src/widgets/order-card/OrderCard.vue', 'src/entities/order/model.ts')];
    expect(detectLayerViolations(modules, edges)).toHaveLength(0);
  });

  it('ignores type-only edges and unresolved edges', () => {
    const modules = [module('src/entities/order/model.ts'), module('src/widgets/x/X.vue')];
    const edges = [
      edge('src/entities/order/model.ts', 'src/widgets/x/X.vue', 'type-only'),
      { ...edge('src/entities/order/model.ts', 'src/widgets/x/X.vue'), resolved: false },
    ];
    expect(detectLayerViolations(modules, edges)).toHaveLength(0);
  });

  it('does not flag same-layer imports', () => {
    const modules = [module('src/features/a/index.ts'), module('src/features/b/index.ts')];
    const edges = [edge('src/features/a/index.ts', 'src/features/b/index.ts')];
    expect(detectLayerViolations(modules, edges)).toHaveLength(0);
  });
});
