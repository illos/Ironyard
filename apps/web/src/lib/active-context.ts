import { useLocation } from '@tanstack/react-router';

export interface ActiveContext {
  /** Campaign the user is currently in, inferred from URL in Pass 1. */
  activeCampaignId: string | null;
  /** Character the user has active in this campaign. Always null in Pass 1
   *  (no persistence layer); consumers should treat null as "unknown — use
   *  defaults / let pages fetch their own roster pick". */
  activeCharacterId: string | null;
}

const CAMPAIGN_ID_RE = /^\/campaigns\/([^/]+)(?:\/|$)/;

export function useActiveContext(): ActiveContext {
  const { pathname } = useLocation();
  const match = CAMPAIGN_ID_RE.exec(pathname);
  return {
    activeCampaignId: match?.[1] ?? null,
    activeCharacterId: null,
  };
}
