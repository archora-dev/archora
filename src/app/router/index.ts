import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { endStartupSpan, markStartup, startStartupSpan } from '@/shared/lib/startupTiming';

function lazyRoute<T>(label: string, loader: () => Promise<T>): () => Promise<T> {
  return async () => {
    startStartupSpan(`route import ${label}`);
    try {
      return await loader();
    } finally {
      endStartupSpan(`route import ${label}`);
    }
  };
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: { name: 'cockpit' },
  },
  {
    path: '/cockpit/:id?',
    name: 'cockpit',
    component: lazyRoute('cockpit', () => import('@/pages/cockpit/CockpitPage.vue')),
    meta: { fullBleed: true },
  },
  {
    path: '/history',
    name: 'history',
    component: lazyRoute('history', () => import('@/pages/cockpit-history/CockpitHistoryPage.vue')),
    meta: { fullBleed: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: lazyRoute('settings', () => import('@/pages/settings/SettingsPage.vue')),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'cockpit' },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from) => {
  startStartupSpan(`router ${String(from.name ?? from.path)} -> ${String(to.name ?? to.path)}`);
  markStartup(
    'router beforeEach',
    `${String(from.name ?? from.path)} -> ${String(to.name ?? to.path)}`,
  );
});

router.afterEach((to, from) => {
  endStartupSpan(`router ${String(from.name ?? from.path)} -> ${String(to.name ?? to.path)}`);
  performance.mark('archora:route-ready');
  markStartup(
    'router afterEach',
    `${String(from.name ?? from.path)} -> ${String(to.name ?? to.path)}`,
  );
  markStartup('route ready', String(to.name ?? to.path));
});
