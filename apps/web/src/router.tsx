import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { CampaignView } from './pages/CampaignView';
import { CombatRun } from './pages/CombatRun';
import { EncounterBuilder } from './pages/EncounterBuilder';
import { Home } from './pages/Home';
import { MonsterBrowser } from './pages/MonsterBrowser';
import { Wizard } from './pages/characters/Wizard';
import { Sheet } from './pages/characters/Sheet';

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

const campaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/campaigns/$id',
  component: CampaignView,
});

const encounterBuilderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/campaigns/$id/build',
  component: EncounterBuilder,
});

const combatRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/campaigns/$id/play',
  component: CombatRun,
});

const foesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/foes',
  component: MonsterBrowser,
});

const wizardNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters/new',
  component: Wizard,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search['code'] === 'string' ? search['code'] : undefined,
  }),
});

const wizardEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters/$id/edit',
  component: Wizard,
});

const sheetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters/$id',
  component: Sheet,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  campaignRoute,
  encounterBuilderRoute,
  combatRunRoute,
  foesRoute,
  wizardNewRoute,
  wizardEditRoute,
  sheetRoute,
]);

export const router = createRouter({ routeTree });
