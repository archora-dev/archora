interface Props {
  label: string;
  value: string;
}

export function StatCard({ label, value }: Props): JSX.Element {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
