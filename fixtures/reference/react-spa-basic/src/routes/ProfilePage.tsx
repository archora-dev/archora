import { useTheme } from '../hooks/useTheme';

export default function ProfilePage(): JSX.Element {
  const { theme } = useTheme();
  return (
    <main>
      <h1>Profile</h1>
      <p>Theme: {theme}</p>
    </main>
  );
}
