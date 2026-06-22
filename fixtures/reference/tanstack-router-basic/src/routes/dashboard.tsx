import { useStats } from '../hooks/useStats';
import { StatCard } from '../components/StatCard';
import { formatNumber } from '../lib/format';

export function DashboardPage(): JSX.Element {
  const { data } = useStats();
  return (
    <section>
      <h1>Dashboard</h1>
      {data?.map((s) => (
        <StatCard key={s.label} label={s.label} value={formatNumber(s.value)} />
      ))}
    </section>
  );
}
