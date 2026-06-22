import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLayerRulesStore, fromOverrides, toOverrides } from '../model/layerRulesStore';

describe('layerRulesStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('load() seeds saved + draft from overrides', () => {
    const s = useLayerRulesStore();
    s.load('p1', { 'src/lib/**': 'shared', 'src/api/**': 'features' });
    const rows = s.draftRows('p1');
    expect(rows.map((r) => r.pattern)).toEqual(['src/lib/**', 'src/api/**']);
    expect(rows.map((r) => r.layer)).toEqual(['shared', 'features']);
    expect(s.isDirty('p1')).toBe(false);
  });

  it('addRow + updateRow mark draft dirty; reset() reverts', () => {
    const s = useLayerRulesStore();
    s.load('p1', { 'src/lib/**': 'shared' });
    const r = s.addRow('p1');
    s.updateRow('p1', r.rowId, { pattern: 'src/api/**', layer: 'features' });
    expect(s.isDirty('p1')).toBe(true);
    expect(s.draftOverrides('p1')).toEqual({
      'src/lib/**': 'shared',
      'src/api/**': 'features',
    });
    s.reset('p1');
    expect(s.isDirty('p1')).toBe(false);
    expect(s.draftOverrides('p1')).toEqual({ 'src/lib/**': 'shared' });
  });

  it('removeRow drops the entry from the draft', () => {
    const s = useLayerRulesStore();
    s.load('p1', { 'src/a/**': 'shared', 'src/b/**': 'features' });
    const rows = s.draftRows('p1');
    const target = rows.find((r) => r.pattern === 'src/a/**')!;
    s.removeRow('p1', target.rowId);
    expect(s.draftOverrides('p1')).toEqual({ 'src/b/**': 'features' });
  });

  it('commit() makes the current draft the new saved baseline', () => {
    const s = useLayerRulesStore();
    s.load('p1', undefined);
    const r = s.addRow('p1');
    s.updateRow('p1', r.rowId, { pattern: 'src/x/**', layer: 'shared' });
    expect(s.isDirty('p1')).toBe(true);
    s.commit('p1');
    expect(s.isDirty('p1')).toBe(false);
  });

  it('clear() empties both saved and draft', () => {
    const s = useLayerRulesStore();
    s.load('p1', { 'src/lib/**': 'shared' });
    s.clear('p1');
    expect(s.draftRows('p1')).toEqual([]);
    expect(s.isDirty('p1')).toBe(false);
  });

  it('per-project isolation', () => {
    const s = useLayerRulesStore();
    s.load('p1', { 'src/lib/**': 'shared' });
    s.load('p2', { 'src/api/**': 'features' });
    expect(s.draftOverrides('p1')).toEqual({ 'src/lib/**': 'shared' });
    expect(s.draftOverrides('p2')).toEqual({ 'src/api/**': 'features' });
  });

  it('toOverrides drops empty patterns; fromOverrides round-trips known shape', () => {
    const rows = fromOverrides({ 'src/x/**': 'shared' });
    expect(rows).toHaveLength(1);
    rows.push({ rowId: 'r99', pattern: '   ', layer: 'features' });
    expect(toOverrides(rows)).toEqual({ 'src/x/**': 'shared' });
  });
});
