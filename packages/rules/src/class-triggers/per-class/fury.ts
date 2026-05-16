import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Fury class-δ action triggers.
//
// Ferocity per-event (canon § 5.4.4):
//   +1 ferocity per damage event taken (per-round latch). Canon: SC
//   `Classes/Fury.md:90`, Heroes PDF p. ~10169.
//
// The per-encounter winded/dying triggers grant 1d3 and live in
// `class-triggers/stamina-transition.ts`; this action trigger does not.

export function evaluate(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  if (event.kind !== 'damage-applied') return [];
  const target = state.participants.filter(isParticipant).find((p) => p.id === event.targetId);
  if (!target || target.kind !== 'pc') return [];
  if (resolveParticipantClass(state, target) !== 'fury') return [];
  if (target.perEncounterFlags.perRound.tookDamage) return [];

  return [
    {
      actor: ctx.actor,
      source: 'server',
      type: 'GainResource',
      payload: {
        participantId: target.id,
        name: 'ferocity',
        amount: 1,
      },
    },
    {
      actor: ctx.actor,
      source: 'server',
      type: 'SetParticipantPerRoundFlag',
      payload: {
        participantId: target.id,
        key: 'tookDamage',
        value: true,
      },
    },
  ];
}
