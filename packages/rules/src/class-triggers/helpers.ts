import type { Participant } from '@ironyard/shared';
import type { CampaignState } from '../types';

// Pass 3 Slice 2a — class-trigger registry helpers.
//
// Resolves the canonical class id for a participant. PC participants carry
// the human-readable class name (e.g. "Fury", "Troubadour") stamped onto
// `Participant.className` at StartEncounter time — see
// `packages/rules/src/intents/start-encounter.ts`, which reads
// `ctx.staticData.classes.get(stamped.character.classId)?.name`.
//
// The class-trigger registry keys off the canonical lowercase id ('fury',
// 'troubadour', ...) to match the static-data id space, so this helper
// lowercases the stamped name. Returns null for monsters and PCs with no
// recorded class.
//
// State is accepted as the first arg as forward-compat for tasks 11-15, which
// may want to read static data for trait gating before evaluating triggers.
export function resolveParticipantClass(_state: CampaignState, p: Participant): string | null {
  if (p.kind !== 'pc') return null;
  if (!p.className) return null;
  return p.className.toLowerCase();
}
