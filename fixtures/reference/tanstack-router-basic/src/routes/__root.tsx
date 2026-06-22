import { Outlet } from '@tanstack/react-router';
import { Header } from '../components/Header';

export function RootLayout(): JSX.Element {
  return (
    <div>
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
