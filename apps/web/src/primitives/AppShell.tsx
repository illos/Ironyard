import { Outlet, useLocation } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { useIsActingAsDirector } from '../lib/active-director';
import { useActiveContext } from '../lib/active-context';
import { ThemeProvider } from '../theme';
import { TopBar, type TopBarMode } from './TopBar';

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { activeCampaignId } = useActiveContext();
  const isActiveDirector = useIsActingAsDirector(activeCampaignId);
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
