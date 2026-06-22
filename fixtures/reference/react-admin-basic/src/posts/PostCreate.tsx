import { Create, SimpleForm, TextInput } from 'react-admin';

export function PostCreate(): JSX.Element {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="title" />
        <TextInput source="body" multiline />
      </SimpleForm>
    </Create>
  );
}
