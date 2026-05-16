import type { Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Censor class-δ action triggers.
//
// Wrath (canon § 5.4.1):
//   - When a creature this Censor has Judgment on damages this Censor:
//     +1 wrath, gated by `perRound.judgedTargetDamagedMe` (first time per round).
//   - When this Censor damages a creature they have Judgment on:
//     +1 wrath, gated by `perRound.damagedJudgedTarget` (first time per round).
//
// Per the Slice 2a plan: Judgment-tracking state does not yet exist in the
// engine. The ability resolution that records who a Censor has Judgment on
// lands in a later slice. Until then, `isJudgedBy` is a permissive stub that
// returns true whenever the candidate exists and is not the Censor themself
// — this is intentionally generous so that the trigger infrastructure can be
// validated end-to-end. The Wrath canon entry is therefore manual-override
// in production today (the director can hand-grant wrath); the auto path
// activates fully once Slice 2b/2c lands the Judgment ability resolution.
//
// TODO Slice 2b/2c: replace the `isJudgedBy` stub with a real query against
// the Censor's recorded Judgment target (likely an entry in
// `censor.activeAbilities` with `kind: 'judgment'`, or a condition stamped on
// the judged creature with `source: censor.id`).

function isJudgedBy(_state: CampaignState, censor: Participant, candidateId: string): boolean {
  // Permissive stub — see header comment. Excludes self so a Censor damaging
  // themselves cannot self-trigger Wrath.
  if (candidateId === censor.id) return false;
  return true;
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
