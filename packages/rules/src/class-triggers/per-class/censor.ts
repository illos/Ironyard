import type { Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Censor class-δ action triggers.
// Pass 3 Slice 2b — `isJudgedBy` now reads from the source's
// `targetingRelations.judged` list (player-managed via chip toggle and
// auto-set from UseAbility for ability id 'censor-judgment-t1').
//
// Wrath (canon § 5.4.1):
//   - When a creature this Censor has Judgment on damages this Censor:
//     +1 wrath, gated by `perRound.judgedTargetDamagedMe` (first time per round).
//   - When this Censor damages a creature they have Judgment on:
//     +1 wrath, gated by `perRound.damagedJudgedTarget` (first time per round).

function isJudgedBy(_state: CampaignState, censor: Participant, candidateId: string): boolean {
  if (candidateId === censor.id) return false;
  return censor.targetingRelations.judged.includes(candidateId);
}

export function evaluate(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  if (event.kind !== 'damage-applied') return [];
  const derived: DerivedIntent[] = [];
  const censors = state.participants
    .filter(isParticipant)
    .filter((p) => p.kind === 'pc' && resolveParticipantClass(state, p) === 'censor');

  for (const censor of censors) {
    // (a) judged-target damages this Censor
    if (
      event.targetId === censor.id &&
      event.dealerId !== null &&
      isJudgedBy(state, censor, event.dealerId) &&
      !censor.perEncounterFlags.perRound.judgedTargetDamagedMe
    ) {
      derived.push(
        {
          actor: ctx.actor,
          source: 'server',
          type: 'GainResource',
          payload: { participantId: censor.id, name: 'wrath', amount: 1 },
        },
        {
          actor: ctx.actor,
          source: 'server',
          type: 'SetParticipantPerRoundFlag',
          payload: {
            participantId: censor.id,
            key: 'judgedTargetDamagedMe',
            value: true,
          },
        },
      );
    }
    // (b) this Censor damages a judged-target
    if (
      event.dealerId === censor.id &&
      isJudgedBy(state, censor, event.targetId) &&
      !censor.perEncounterFlags.perRound.damagedJudgedTarget
    ) {
      derived.push(
        {
          actor: ctx.actor,
          source: 'server',
          type: 'GainResource',
          payload: { participantId: censor.id, name: 'wrath', amount: 1 },
        },
        {
          actor: ctx.actor,
          source: 'server',
          type: 'SetParticipantPerRoundFlag',
          payload: {
            participantId: censor.id,
            key: 'damagedJudgedTarget',
            value: true,
          },
        },
      );
    }
  }
  return derived;
}
