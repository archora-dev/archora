import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCockpitViewStore } from './cockpitViewStore';

describe('cockpitViewStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('defaults to everything lens, no filters, beta on', () => {
    const s = useCockpitViewStore();
    expect(s.lens).toBe('everything');
    expect(s.filter).toEqual({ types: undefined, severities: undefined, includeBeta: true });
  });

  it('toggles a type into and out of the filter', () => {
    const s = useCockpitViewStore();
    s.toggleType('cycle');
    expect(s.filter.types).toEqual(['cycle']);
    s.toggleType('cycle');
    expect(s.filter.types).toBeUndefined();
  });

  it('switches lens and tracks selection', () => {
    const s = useCockpitViewStore();
    s.setLens('changed');
    s.select('cycle:1');
    expect(s.lens).toBe('changed');
    expect(s.selectedId).toBe('cycle:1');
  });

  it('reset returns to defaults', () => {
    const s = useCockpitViewStore();
    s.toggleType('hotspot');
    s.setLens('changed');
    s.setMode('queue');
    s.reset();
    expect(s.lens).toBe('everything');
    expect(s.mode).toBe('briefing');
    expect(s.filter.types).toBeUndefined();
  });

  it('opens on the briefing and switches mode explicitly', () => {
    const s = useCockpitViewStore();
    expect(s.mode).toBe('briefing');
    s.setMode('queue');
    expect(s.mode).toBe('queue');
  });

  it('selecting a finding promotes to the queue mode', () => {
    const s = useCockpitViewStore();
    s.select('cycle:1');
    expect(s.mode).toBe('queue');
    s.setMode('briefing');
    s.select(null);
    expect(s.mode).toBe('briefing');
  });
});
