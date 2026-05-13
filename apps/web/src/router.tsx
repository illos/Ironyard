import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Nav } from './components/Nav';
import { CampaignView } from './pages/CampaignView';
import { CampaignsList } from './pages/CampaignsList';
import { CharactersList } from './pages/CharactersList';
import { CombatRun } from './pages/CombatRun';
import { EncounterBuilder } from './pages/EncounterBuilder';
import { Home } from './pages/Home';
import { MonsterBrowser } from './pages/MonsterBrowser';
import { Sheet } from './pages/characters/Sheet';
import { Wizard } from './pages/characters/Wizard';

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Global nav. Per the Task C decision we leave it on every route for
          now (combat run + wizard included); revisit during the Phase 5 UI
          rebuild if either screen wants a dedicated chrome. */}
      <Nav />
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const campaignsListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/campaigns',
  component: CampaignsList,
});

const campaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/campaigns/$id',
  component: CampaignView,
});

const charactersListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters',
  component: CharactersList,
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
  campaignsListRoute,
  campaignRoute,
  encounterBuilderRoute,
  combatRunRoute,
  charactersListRoute,
  foesRoute,
  wizardNewRoute,
  wizardEditRoute,
  sheetRoute,
]);

export const router = createRouter({ routeTree });
