import { fetchUser } from '../lib/db';
import { Form } from '../components/Form';
import { formatDate } from '../lib/utils';

export default async function Page() {
  const user = await fetchUser();
  return (
    <main>
      <h1>{user.name}</h1>
      <p>{formatDate(user.createdAt)}</p>
      <Form action="/api/save" />
    </main>
  );
}
