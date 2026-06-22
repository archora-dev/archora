// Code-based TanStack Router setup. Routes are statically composed; no
// generated route tree, so the analyzer sees every route as a normal
// import target with no special handling needed.
import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { RootLayout } from './routes/__root';
import { HomePage } from './routes/index';
import { DashboardPage } from './routes/dashboard';

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
});

const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute]);

export const router = createRouter({ routeTree });
