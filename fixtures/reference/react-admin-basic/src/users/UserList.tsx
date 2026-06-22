import { Datagrid, EmailField, List, TextField } from 'react-admin';
import { formatDate } from '@/lib/format';

export function UserList(): JSX.Element {
  return (
    <List>
      <Datagrid rowClick="edit">
        <TextField source="id" />
        <TextField source="name" />
        <EmailField source="email" />
        <TextField source="createdAt" render={(r) => formatDate(r.createdAt as string)} />
      </Datagrid>
    </List>
  );
}
