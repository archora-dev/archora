import { Datagrid, List, TextField } from 'react-admin';
import { formatDate } from '@/lib/format';

export function PostList(): JSX.Element {
  return (
    <List>
      <Datagrid rowClick="edit">
        <TextField source="id" />
        <TextField source="title" />
        <TextField source="publishedAt" render={(r) => formatDate(r.publishedAt as string)} />
      </Datagrid>
    </List>
  );
}
