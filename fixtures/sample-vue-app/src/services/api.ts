import type { User } from '@/types/user';
import { request } from '@/services/http';

export const fetchUsers = async (): Promise<User[]> => {
  return request<User[]>('/api/users');
};
