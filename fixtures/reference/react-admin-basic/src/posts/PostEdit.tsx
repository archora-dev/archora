import { Edit, SimpleForm, TextInput } from 'react-admin';

export function PostEdit(): JSX.Element {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="title" />
        <TextInput source="body" multiline />
      </SimpleForm>
    </Edit>
  );
}
