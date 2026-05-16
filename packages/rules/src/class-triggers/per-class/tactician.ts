import type { Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Tactician class-δ action triggers.
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
// Mark-tracking state does not yet exist in the engine (the ability resolution
// that records who a Tactician has Marked lands in a later slice). Until then,
// `isMarkedBy` is a permissive stub that returns true whenever the candidate
// exists and is not the Tactician themself — generous so that the trigger
// infrastructure can be validated end-to-end. The Focus marked-target canon
// entry is therefore manual-override in production today (the director can
// hand-grant focus); the auto path activates fully once the Mark ability
// resolution lands.
//
// TODO Slice 2b/2c: replace the `isMarkedBy` stub with a real query against
// the Tactician's recorded Mark target (likely a condition stamped on the
// marked creature with `source: tactician.id` and `kind: 'mark'`, or an entry
// in `tactician.activeAbilities`).

function isMarkedBy(_state: CampaignState, tactician: Participant, candidateId: string): boolean {
  // Permissive stub — see header comment. Excludes self so a Tactician
  // damaging themselves cannot self-trigger Focus.
  if (candidateId === tactician.id) return false;
  return true;
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
