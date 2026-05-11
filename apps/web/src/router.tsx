import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { CampaignView } from './pages/CampaignView';
import { CombatRun } from './pages/CombatRun';
import { EncounterBuilder } from './pages/EncounterBuilder';
import { Home } from './pages/Home';
import { MonsterBrowser } from './pages/MonsterBrowser';

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

const monsterCodexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/codex/monsters',
  component: MonsterBrowser,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  campaignRoute,
  encounterBuilderRoute,
  combatRunRoute,
  monsterCodexRoute,
]);

export const router = createRouter({ routeTree });
