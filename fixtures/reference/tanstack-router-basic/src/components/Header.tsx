import { Link } from '@tanstack/react-router';
import { LogoIcon } from './icons/LogoIcon';

export function Header(): JSX.Element {
  return (
    <header>
      <LogoIcon />
      <Link to="/">Home</Link>
      <Link to="/dashboard">Dashboard</Link>
    </header>
  );
}
