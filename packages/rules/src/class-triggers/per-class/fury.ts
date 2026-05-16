import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Fury class-δ action triggers.
//
// Ferocity per-event (canon § 5.4.4):
//   When this Fury takes damage, gain 1d3 ferocity, first time per round
//   (gated by `perRound.tookDamage`).
//
// Purity contract: this module is pure. The 1d3 must be pre-rolled at the
// impure call site (Task 21's apply-damage.ts) and passed via
// `ctx.rolls.ferocityD3`. If a Fury entry would fire without a pre-rolled
// value the dispatcher throws — same pattern as Task 10's stamina-transition
// `requireFerocityD3`.

function requireFerocityD3(ctx: ActionTriggerContext): number {
  if (ctx.rolls.ferocityD3 === undefined) {
    throw new Error(
      'class-triggers/per-class/fury.evaluate: Fury Ferocity action trigger fired but ctx.rolls.ferocityD3 was not supplied',
    );
  }
  return ctx.rolls.ferocityD3;
}

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
        amount: requireFerocityD3(ctx),
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
