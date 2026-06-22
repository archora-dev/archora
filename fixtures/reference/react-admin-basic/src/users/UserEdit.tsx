import { Edit, SimpleForm, TextInput } from 'react-admin';

export function UserEdit(): JSX.Element {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="name" />
        <TextInput source="email" />
      </SimpleForm>
    </Edit>
  );
}
