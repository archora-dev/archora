import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ProjectRef } from '@/core/analyzer/types';
import { endStartupSpan, markStartup, startStartupSpan } from '@/shared/lib/startupTiming';

export interface RecentProject {
  id: string;
  name: string;
  rootPath: string;
  openedAt: string;
}

const RECENT_KEY = 'fs:recent-projects';
const RECENT_LIMIT = 8;

function loadRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentProject[];
  } catch {
    return [];
  }
}

function saveRecent(list: RecentProject[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

export const useProjectStore = defineStore('project', () => {
  startStartupSpan('project store recent load');
  const current = ref<ProjectRef | null>(null);
  const recent = ref<RecentProject[]>(loadRecent());
  endStartupSpan('project store recent load', `recent=${recent.value.length}`);

  function setCurrent(p: ProjectRef): void {
    markStartup('project store setCurrent', p.id);
    current.value = p;
    const entry: RecentProject = {
      id: p.id,
      name: p.name,
      rootPath: p.rootPath,
      openedAt: new Date().toISOString(),
    };
    const next = [entry, ...recent.value.filter((r) => r.id !== p.id)].slice(0, RECENT_LIMIT);
    recent.value = next;
    saveRecent(next);
  }

  function clear(): void {
    current.value = null;
  }

  function removeRecent(id: string): void {
    const next = recent.value.filter((r) => r.id !== id);
    recent.value = next;
    saveRecent(next);
    if (current.value?.id === id) current.value = null;
  }

  return { current, recent, setCurrent, clear, removeRecent };
});
