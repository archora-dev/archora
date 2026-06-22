import { listUsers } from '../../composables/useUsers';

export default async function handler() {
  return { users: await listUsers() };
}
