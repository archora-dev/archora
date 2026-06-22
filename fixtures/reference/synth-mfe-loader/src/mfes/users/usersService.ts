export interface UsersService {
  list(): string[];
}

export const usersService: UsersService = {
  list: () => ['alice', 'bob'],
};
