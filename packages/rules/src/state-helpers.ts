import type { Participant } from '@ironyard/shared';
import type { CampaignState } from './types';
import { isParticipant } from './types';

/**
 * Sum of per-character Victories across all PC participants in the lobby.
 * Replacement for the deprecated `state.partyVictories` field — that field
 * stays on `CampaignState` until 2b.10 housekeeping removes it after all
 * callers migrate.
 */
export function sumPartyVictories(state: CampaignState): number {
  return state.participants
    .filter((p): p is Participant => isParticipant(p) && p.kind === 'pc')
    .reduce((total, p) => total + (p.victories ?? 0), 0);
}
