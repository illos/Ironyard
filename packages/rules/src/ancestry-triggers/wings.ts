// Phase 2b Group A+B (slice 6) — Devil + Dragon Knight Wings.
//
// Wings is the only ancestry trait in canon today named identically across
// two ancestries (Devil.md and Dragon Knight.md both have "Wings (2 Points)").
// parse-ancestry.ts slugifies trait names to ids, so both produce the bare
// slug 'wings' on `purchasedTraits`. We disambiguate by combining the slug
// with the ancestry id (stamped at StartEncounter from character.ancestryId).
//
// Subscribes to:
//   (a) onConditionApplied: when a flying Devil/DK-with-Wings gains Prone
//       (any cause — SetCondition, KO interception, inert transition), emit
//       a derived EndFlying { reason: 'fall' }. The Prone itself persists;
//       only movementMode is cleared by EndFlying. No fall damage — engine
//       does not track altitude.
//   (b) onEndRound: tick `roundsRemaining` for every flying participant
//       with Wings; at 0 → EndFlying { reason: 'duration-expired' }, else
//       SetMovementMode with the decremented value.
//
// hasWings is exported so `effective.ts` can reuse the same gate when
// layering the echelon-1 fire weakness 5.

import type { ConditionType, Participant } from '@ironyard/shared';
import { IntentTypes } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import { isParticipant } from '../types';
import type { AncestryTriggerContext } from './index';

// Ancestry ids that carry a canonical "Wings" purchased trait. The set is
// closed today; if a homebrew ancestry adds a 'wings' trait we'd extend.
const WINGS_ANCESTRIES = new Set(['devil', 'dragon-knight']);

export function hasWings(p: Participant): boolean {
  if (p.kind !== 'pc') return false;
  if (!p.purchasedTraits.includes('wings')) return false;
  return p.ancestry.some((a) => WINGS_ANCESTRIES.has(a));
}

function isFlying(p: Participant): boolean {
  return p.movementMode?.mode === 'flying';
}

export function onConditionApplied(
  state: CampaignState,
  payload: { participantId: string; condition: ConditionType },
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  if (payload.condition !== 'Prone') return [];
  const p = state.participants.filter(isParticipant).find((x) => x.id === payload.participantId);
  if (!p || !hasWings(p) || !isFlying(p)) return [];
  return [
    {
      actor: ctx.actor,
      source: 'server',
      type: IntentTypes.EndFlying,
      payload: { participantId: p.id, reason: 'fall' },
    },
  ];
}

export function onEndRound(state: CampaignState, ctx: AncestryTriggerContext): DerivedIntent[] {
  const derived: DerivedIntent[] = [];
  for (const p of state.participants.filter(isParticipant)) {
    if (!isFlying(p) || !hasWings(p)) continue;
    const current = p.movementMode!.roundsRemaining;
    const next = current - 1;
    if (next <= 0) {
      derived.push({
        actor: ctx.actor,
        source: 'server',
        type: IntentTypes.EndFlying,
        payload: { participantId: p.id, reason: 'duration-expired' },
      });
    } else {
      derived.push({
        actor: ctx.actor,
        source: 'server',
        type: IntentTypes.SetMovementMode,
        payload: {
          participantId: p.id,
          movementMode: { mode: 'flying', roundsRemaining: next },
        },
      });
    }
  }
  return derived;
}
