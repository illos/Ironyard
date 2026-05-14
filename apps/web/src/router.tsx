import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from './primitives/AppShell';
import { CampaignView } from './pages/CampaignView';
import { CampaignsList } from './pages/CampaignsList';
import { CharactersList } from './pages/CharactersList';
import { CombatRun } from './pages/CombatRun';
import { EncounterBuilder } from './pages/EncounterBuilder';
import { Home } from './pages/Home';
import { MonsterBrowser } from './pages/MonsterBrowser';
import { MonsterDetail } from './pages/MonsterDetail';
import { Sheet } from './pages/characters/Sheet';
import { Wizard } from './pages/characters/Wizard';

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
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

const foeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/foes/$id',
  component: MonsterDetail,
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
  foeDetailRoute,
  wizardNewRoute,
  wizardEditRoute,
  sheetRoute,
]);

export const router = createRouter({ routeTree });
