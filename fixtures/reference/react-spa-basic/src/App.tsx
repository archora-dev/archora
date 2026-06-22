import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { HomePage } from './routes/HomePage';
import { useTheme } from './hooks/useTheme';

// Code-split routes — these import calls must be picked up as dynamic edges,
// otherwise the route components look like dead code.
const SettingsPage = lazy(() => import('./routes/SettingsPage'));
const ProfilePage = lazy(() => import('./routes/ProfilePage'));

export function App(): JSX.Element {
  const { theme } = useTheme();
  return (
    <BrowserRouter>
      <div data-theme={theme}>
        <Header />
        <Suspense fallback={<div>Loading…</div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}
