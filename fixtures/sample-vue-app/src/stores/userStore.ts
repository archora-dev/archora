import { defineStore } from 'pinia';
import type { User } from '@/types/user';
import { fetchUsers } from '@/services/api';

export const useUserStore = defineStore('user', {
  state: () => ({ list: [] as User[], current: null as User | null }),
  actions: {
    async load(): Promise<void> {
      this.list = await fetchUsers();
    },
  },
});
