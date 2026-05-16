import type { Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a/2b — Tactician class-δ action triggers.
//
// Focus (canon § 5.4.7) covers two distinct triggers off two different event
// shapes; both are dispatched from a single evaluator that fans out by
// `event.kind`.
//
// Trigger 1 — marked-target takes damage (action-driven, per-Tactician latch):
//   When a creature this Tactician has Marked takes damage from anyone, the
//   Tactician gains 1 focus. Gated by `perRound.markedTargetDamagedByAnyone`.
//
// Trigger 2 — ally heroic ability within 10 squares (spatial OA):
//   When an ally within 10 squares uses a heroic ability, the Tactician may
//   gain 1 focus. This is spatial — distance can change between the event and
//   the player's claim — so we raise an OpenAction rather than auto-applying.
//   Gated by `perRound.allyHeroicWithin10Triggered` per Tactician.
//
// Slice 2b closure: `isMarkedBy` now reads `tactician.targetingRelations.marked`
// (populated by UseAbility → SetTargetingRelation for the PHB "Mark" ability,
// or by the player toggling the per-row chip). The permissive stub is retired.

function isMarkedBy(_state: CampaignState, tactician: Participant, candidateId: string): boolean {
  if (candidateId === tactician.id) return false;
  return tactician.targetingRelations.marked.includes(candidateId);
}

export function evaluate(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  const derived: DerivedIntent[] = [];
  const tacticians = state.participants
    .filter(isParticipant)
    .filter((p) => p.kind === 'pc' && resolveParticipantClass(state, p) === 'tactician');
  if (tacticians.length === 0) return derived;

  if (event.kind === 'damage-applied') {
    for (const tactician of tacticians) {
      if (tactician.perEncounterFlags.perRound.markedTargetDamagedByAnyone) continue;
      if (!isMarkedBy(state, tactician, event.targetId)) continue;
      derived.push(
        {
          actor: ctx.actor,
          source: 'server',
          type: 'GainResource',
          payload: { participantId: tactician.id, name: 'focus', amount: 1 },
        },
        {
          actor: ctx.actor,
          source: 'server',
          type: 'SetParticipantPerRoundFlag',
          payload: {
            participantId: tactician.id,
            key: 'markedTargetDamagedByAnyone',
            value: true,
          },
        },
      );
    }
    return derived;
  }

  if (event.kind === 'ability-used' && event.abilityCategory === 'heroic') {
    for (const tactician of tacticians) {
      // Don't self-trigger when this Tactician uses their own heroic ability.
      if (event.actorId === tactician.id) continue;
      // Ally check: side of the heroic-ability user must match the Tactician's
      // side. PCs are on the heroes side. Distance ≤10 is a spatial check the
      // player must satisfy at claim time — we raise the OA either way.
      if (event.sideOfActor !== 'heroes') continue;
      if (tactician.perEncounterFlags.perRound.allyHeroicWithin10Triggered) continue;
      derived.push({
        actor: ctx.actor,
        source: 'server',
        type: 'RaiseOpenAction',
        payload: {
          kind: 'spatial-trigger-tactician-ally-heroic',
          participantId: tactician.id,
          expiresAtRound: null,
          payload: {
            allyId: event.actorId,
            abilityId: event.abilityId,
          },
        },
      });
    }
    return derived;
  }

  return derived;
}
