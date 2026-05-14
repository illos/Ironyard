import { useCampaign, useMe } from '../api/queries';

/**
 * Phase 5 Pass 2a — true iff the current user is the active director of the
 * given campaign (active-behind-the-screen).
 *
 * Sources `activeDirectorId` from the HTTP-cached `useCampaign(...)` rather
 * than from `useSessionSocket(...)` so AppShell doesn't open a second
 * WebSocket connection just to read this signal. When the director changes
 * via JumpBehindScreen, the WS broadcasts the new state but this HTTP cache
 * doesn't auto-refresh — that's OK for Pass 2a (director hand-off mid-encounter
 * is rare; a page reload picks up the new value). Pass 2b can wire WS-driven
 * cache invalidation.
 *
 * Returns false during initial fetch (campaign.data undefined), when there is
 * no active campaign (campaignId === null), or when the user isn't signed in.
 *
 * Consumers: AppShell (Mode-B chrome resolution), DirectorCombat (role-gated
 * rails / DetailPane / Malice / Victories edits).
 */
export function useIsActingAsDirector(campaignId: string | null): boolean {
  const me = useMe();
  const campaign = useCampaign(campaignId ?? undefined);
  if (!campaignId || !me.data || !campaign.data?.activeDirectorId) return false;
  return me.data.user.id === campaign.data.activeDirectorId;
}
