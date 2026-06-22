import { computed } from 'vue';
import { useUserStore } from '@/stores/userStore';
import type { User } from '@/types/user';

export function useUsers(): { items: User[] } {
  const store = useUserStore();
  const items = computed(() => store.list);
  return { items: items.value };
}
