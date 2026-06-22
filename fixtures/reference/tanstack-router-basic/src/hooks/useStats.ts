import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface Stat {
  label: string;
  value: number;
}

export function useStats(): UseQueryResult<Stat[]> {
  return useQuery<Stat[]>({
    queryKey: ['stats'],
    queryFn: () =>
      Promise.resolve([
        { label: 'Users', value: 1230 },
        { label: 'Sessions', value: 4821 },
        { label: 'Errors', value: 12 },
      ]),
  });
}
