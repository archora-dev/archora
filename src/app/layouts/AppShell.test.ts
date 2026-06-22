import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell.vue';
import { OPEN_PROJECT_EVENT, consumeOpenProjectRequest } from '@/shared/lib';

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', redirect: { name: 'cockpit' } },
      {
        path: '/cockpit/:id?',
        name: 'cockpit',
        component: { template: '<div />' },
        meta: { fullBleed: true },
      },
      {
        path: '/history',
        name: 'history',
        component: { template: '<div />' },
        meta: { fullBleed: true },
      },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  });
}

function mountShell(router: ReturnType<typeof makeRouter>) {
  return mount(AppShell, {
    global: {
      plugins: [router],
      stubs: {
        ErrorBoundary: { template: '<div><slot /></div>' },
        CommandPalette: true,
      },
    },
  });
}

describe('AppShell', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    consumeOpenProjectRequest();
  });

  it('renders the three-item rail (Cockpit, History, Settings)', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', redirect: { name: 'cockpit' } },
        {
          path: '/cockpit/:id?',
          name: 'cockpit',
          component: { template: '<div />' },
          meta: { fullBleed: true },
        },
        {
          path: '/history',
          name: 'history',
          component: { template: '<div />' },
          meta: { fullBleed: true },
        },
        { path: '/settings', name: 'settings', component: { template: '<div />' } },
      ],
    });
    await router.push('/cockpit');

    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: {
          ErrorBoundary: { template: '<div><slot /></div>' },
          CommandPalette: true,
        },
      },
    });

    expect(wrapper.find('[data-test="nav-cockpit"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-history"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-settings"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="nav-dashboard"]').exists()).toBe(false);
  });

  it('dispatches the open-project event from the rail while on the cockpit', async () => {
    const router = makeRouter();
    await router.push('/cockpit');
    const wrapper = mountShell(router);

    const fired = vi.fn();
    window.addEventListener(OPEN_PROJECT_EVENT, fired);
    await wrapper.find('[data-test="rail-open-project"]').trigger('click');
    window.removeEventListener(OPEN_PROJECT_EVENT, fired);

    expect(fired).toHaveBeenCalledTimes(1);
    expect(consumeOpenProjectRequest()).toBe(false);
  });

  it('queues the request and routes to the cockpit from another page', async () => {
    const router = makeRouter();
    await router.push('/settings');
    const wrapper = mountShell(router);

    await wrapper.find('[data-test="rail-open-project"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('cockpit');
    expect(consumeOpenProjectRequest()).toBe(true);
  });

  it('uses the compact reference rail on fullBleed routes', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        {
          path: '/cockpit/:id?',
          name: 'cockpit',
          component: { template: '<div />' },
          meta: { fullBleed: true },
        },
        {
          path: '/history',
          name: 'history',
          component: { template: '<div />' },
          meta: { fullBleed: true },
        },
        { path: '/settings', name: 'settings', component: { template: '<div />' } },
      ],
    });
    await router.push('/cockpit');

    const wrapper = mount(AppShell, {
      global: {
        plugins: [router],
        stubs: {
          ErrorBoundary: { template: '<div><slot /></div>' },
          CommandPalette: true,
        },
      },
    });

    expect(wrapper.find('aside').classes()).toContain('app-sidebar-collapsed');
  });
});
