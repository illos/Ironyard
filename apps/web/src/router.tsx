import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Home } from './pages/Home';
import { SessionView } from './pages/SessionView';

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions/$id',
  component: SessionView,
});

const routeTree = rootRoute.addChildren([indexRoute, sessionRoute]);

export const router = createRouter({ routeTree });
