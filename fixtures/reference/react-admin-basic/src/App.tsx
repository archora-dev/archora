import { Admin, Resource } from 'react-admin';
import { dataProvider } from './dataProvider';
import { AppLayout } from './components/AppLayout';
import { UserList } from './users/UserList';
import { UserEdit } from './users/UserEdit';
import { UserCreate } from './users/UserCreate';
import { PostList } from './posts/PostList';
import { PostEdit } from './posts/PostEdit';
import { PostCreate } from './posts/PostCreate';

export function App(): JSX.Element {
  return (
    <Admin dataProvider={dataProvider} layout={AppLayout}>
      <Resource name="users" list={UserList} edit={UserEdit} create={UserCreate} />
      <Resource name="posts" list={PostList} edit={PostEdit} create={PostCreate} />
    </Admin>
  );
}
