import { Link } from 'react-router-dom';
import { SearchIcon } from './icons/SearchIcon';
import { cn } from '../utils/cn';

export function Header(): JSX.Element {
  return (
    <header className={cn('app-header', 'border-b')}>
      <Link to="/">Home</Link>
      <Link to="/settings">Settings</Link>
      <Link to="/profile">Profile</Link>
      <SearchIcon />
    </header>
  );
}
