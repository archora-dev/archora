'use client';
import { formatDate } from '../lib/utils';

export function Form(props: { action: string }): JSX.Element {
  return (
    <form action={props.action} data-now={formatDate(Date.now())}>
      <input name="x" />
      <button type="submit">Save</button>
    </form>
  );
}
