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

/**
 * The Winded threshold for a PC (canon § 2.7 — formal state transitions
 * land in 2b.5). Today: `floor(maxStamina / 2)`. Used as the permissive
 * alive-check in 2b.0 (`currentStamina > -windedValue` ⇒ still in the fight).
 */
export function windedValue(p: { maxStamina: number }): number {
  return Math.floor(p.maxStamina / 2);
}

/**
 * PCs still in the fight by the permissive 2b.0 alive-check
 * (`currentStamina > -windedValue`). 2b.5 replaces with the formal
 * winded/dying/dead state machine.
 */
export function aliveHeroes(state: CampaignState): Participant[] {
  return state.participants
    .filter((p): p is Participant => isParticipant(p) && p.kind === 'pc')
    .filter((p) => p.currentStamina > -windedValue(p));
}

/**
 * `floor(sumVictories / aliveCount)` over `aliveHeroes`. Returns 0 if no
 * alive PCs. Drives Director's Malice initial preload at canon § 5.5.
 */
export function averageVictoriesAlive(state: CampaignState): number {
  const alive = aliveHeroes(state);
  if (alive.length === 0) return 0;
  const sum = alive.reduce((t, p) => t + (p.victories ?? 0), 0);
  return Math.floor(sum / alive.length);
}
