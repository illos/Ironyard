import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Shadow class-δ action triggers.
//
// Insight (canon § 5.4.6):
//   When this Shadow spends surge(s) to deal damage, gain 1 insight, first
//   time per round (gated by `perRound.dealtSurgeDamage`).

export function evaluate(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  if (event.kind !== 'surge-spent-with-damage') return [];
  if (event.surgesSpent <= 0) return [];
  const actor = state.participants.filter(isParticipant).find((p) => p.id === event.actorId);
  if (!actor || actor.kind !== 'pc') return [];
  if (resolveParticipantClass(state, actor) !== 'shadow') return [];
  if (actor.perEncounterFlags.perRound.dealtSurgeDamage) return [];

  return [
    {
      actor: ctx.actor,
      source: 'server',
      type: 'GainResource',
      payload: { participantId: actor.id, name: 'insight', amount: 1 },
    },
    {
      actor: ctx.actor,
      source: 'server',
      type: 'SetParticipantPerRoundFlag',
      payload: {
        participantId: actor.id,
        key: 'dealtSurgeDamage',
        value: true,
      },
    },
  ];
}
