import { Outlet, useLocation } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { useIsActingAsDirector } from '../lib/active-director';
import { useActiveContext } from '../lib/active-context';
import { ThemeProvider } from '../theme';
import { TopBar, type TopBarMode } from './TopBar';

export interface AppShellProps {
  children?: ReactNode;
}

// Routes that own the full viewport and render their own header (e.g. the
// combat tracker's InlineHeader). The shell's TopBar collapses on these so
// the page can pin its content to 100vh without fighting for chrome height.
const FULL_VIEWPORT_PATTERNS = [/^\/campaigns\/[^/]+\/play$/];

function isFullViewportRoute(pathname: string): boolean {
  return FULL_VIEWPORT_PATTERNS.some((re) => re.test(pathname));
}

export function AppShell({ children }: AppShellProps) {
  const { activeCampaignId } = useActiveContext();
  const isActiveDirector = useIsActingAsDirector(activeCampaignId);
  const location = useLocation();
  const fullViewport = isFullViewportRoute(location.pathname);

  let mode: TopBarMode;
  if (activeCampaignId === null) mode = 'A';
  else if (isActiveDirector) mode = 'B';
  else mode = 'C';

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col bg-ink-0 text-text">
        {!fullViewport && <TopBar mode={mode} />}
        <main className="flex-1 min-h-0">{children ?? <Outlet />}</main>
      </div>
    </ThemeProvider>
  );
}
