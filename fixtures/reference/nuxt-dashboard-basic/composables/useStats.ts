import { ref, type Ref } from 'vue';

export interface Stat {
  label: string;
  value: number;
}

export function useStats(): { stats: Ref<Stat[]> } {
  const stats = ref<Stat[]>([
    { label: 'Users', value: 1230 },
    { label: 'Sessions', value: 4821 },
    { label: 'Errors', value: 12 },
  ]);
  return { stats };
}
