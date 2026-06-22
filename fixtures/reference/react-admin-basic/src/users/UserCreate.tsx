import { Create, SimpleForm, TextInput } from 'react-admin';

export function UserCreate(): JSX.Element {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" />
        <TextInput source="email" />
      </SimpleForm>
    </Create>
  );
}
