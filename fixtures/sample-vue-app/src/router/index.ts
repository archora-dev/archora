import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/pages/Home.vue') },
    { path: '/users', component: () => import('@/pages/Users.vue') },
    { path: '/users/:id', component: () => import('@/pages/UserDetails.vue') },
    { path: '/settings', component: () => import('@/pages/Settings.vue') },
  ],
});
