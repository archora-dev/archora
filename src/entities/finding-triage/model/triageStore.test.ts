import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useFindingTriageStore } from './triageStore';

describe('findingTriageStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('defaults to active for an untriaged finding', () => {
    const store = useFindingTriageStore();
    expect(store.stateFor('p1', 'cycle:1')).toBe('active');
    expect(store.entryFor('p1', 'cycle:1')).toBeUndefined();
  });

  it('persists a state with reason to localStorage and reads it back', () => {
    const store = useFindingTriageStore();
    store.setState('p1', 'cycle:1', 'snoozed', '  revisit next sprint  ');

    const raw = localStorage.getItem('archora:triage:p1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed['cycle:1'].state).toBe('snoozed');
    expect(parsed['cycle:1'].reason).toBe('revisit next sprint'); // trimmed
    expect(typeof parsed['cycle:1'].at).toBe('string');

    // A fresh store instance loads the persisted entry.
    setActivePinia(createPinia());
    const reloaded = useFindingTriageStore();
    expect(reloaded.stateFor('p1', 'cycle:1')).toBe('snoozed');
    expect(reloaded.entryFor('p1', 'cycle:1')?.reason).toBe('revisit next sprint');
  });

  it('reactivate clears the entry and storage', () => {
    const store = useFindingTriageStore();
    store.setState('p1', 'cycle:1', 'wont-fix', 'intentional');
    expect(store.stateFor('p1', 'cycle:1')).toBe('wont-fix');

    store.reactivate('p1', 'cycle:1');
    expect(store.stateFor('p1', 'cycle:1')).toBe('active');
    expect(store.entryFor('p1', 'cycle:1')).toBeUndefined();

    const parsed = JSON.parse(localStorage.getItem('archora:triage:p1') as string);
    expect(parsed['cycle:1']).toBeUndefined();
  });

  it('setState with active deletes the entry', () => {
    const store = useFindingTriageStore();
    store.setState('p1', 'cycle:1', 'acknowledged');
    store.setState('p1', 'cycle:1', 'active');
    expect(store.stateFor('p1', 'cycle:1')).toBe('active');
  });

  it('scopes triage per project', () => {
    const store = useFindingTriageStore();
    store.setState('p1', 'cycle:1', 'acknowledged');
    expect(store.stateFor('p2', 'cycle:1')).toBe('active');
  });
});
