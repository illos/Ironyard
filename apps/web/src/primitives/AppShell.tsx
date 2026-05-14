import { Outlet, useLocation } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { useActiveContext } from '../lib/active-context';
import { ThemeProvider } from '../theme';
import { TopBar, type TopBarMode } from './TopBar';

/**
 * Pass-1 director gating placeholder. The real gate is
 *   actor.userId === state.activeDirectorId
 * which requires WS-mirrored lobby state. Pass 1 callers can pass
 * `isActiveDirector` directly when they have it; otherwise this hook
 * falls back to false so the chrome shows Mode C for players.
 */
function useIsActiveDirector(): boolean {
  // Placeholder: pages that know they're director-side will assert this
  // via context or props in later iterations. For Pass 1 chrome we read
  // a lightweight signal. To keep the surface honest we default false.
  return false;
}

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { activeCampaignId } = useActiveContext();
  const isActiveDirector = useIsActiveDirector();
  const _location = useLocation();

  let mode: TopBarMode;
  if (activeCampaignId === null) mode = 'A';
  else if (isActiveDirector) mode = 'B';
  else mode = 'C';

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col bg-ink-0 text-text">
        <TopBar mode={mode} />
        <main className="flex-1 min-h-0">{children ?? <Outlet />}</main>
      </div>
    </ThemeProvider>
  );
}
