import { useTheme } from '../hooks/useTheme';

export function HomePage(): JSX.Element {
  const { theme, toggle } = useTheme();
  return (
    <main>
      <h1>Home</h1>
      <p>Current theme: {theme}</p>
      <button type="button" onClick={toggle}>
        Toggle theme
      </button>
    </main>
  );
}
