import { defineStore } from 'pinia';
import type { User } from '@/types/user';

export const useSessionStore = defineStore('session', {
  state: () => ({ user: null as User | null }),
});
