import type { Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Null class-δ action triggers.
// Pass 3 Slice 2b — hasActiveNullFieldOver closure: reads targetingRelations.nullField
//   instead of the permissive stub; main-action-used branch now auto-applies
//   GainResource + latch directly (matching Censor / Tactician pattern), dropping
//   the OA detour. The `spatial-trigger-null-field` OA kind in the registry is
//   kept as harmless dead code for back-compat; it is not removed by this slice.
//
// Discipline (canon § 5.4.5) covers two distinct triggers off two different
// event shapes; both are dispatched from a single evaluator that fans out by
// `event.kind`.
//
// Trigger 1 — malice spent (action-driven, per-Null latch):
//   When the director spends malice, every Null gains 1 discipline, first
//   time per round per Null (gated by `perRound.directorSpentMalice`).
//
// Trigger 2 — enemy main action while in this Null's Null Field:
//   When an enemy creature uses a main action while listed in this Null's
//   targetingRelations.nullField[], the Null gains 1 discipline automatically.
//   Gated by `perRound.nullFieldEnemyMainTriggered` per Null.

// Renamed from hasActiveNullField → hasActiveNullFieldOver: semantics changed
// from "does this Null have any field cast" to "is THIS enemy in the field."
function hasActiveNullFieldOver(
  _state: CampaignState,
  nullPc: Participant,
  candidateId: string,
): boolean {
  return nullPc.targetingRelations.nullField.includes(candidateId);
}

export function evaluate(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  const derived: DerivedIntent[] = [];
  const nulls = state.participants
    .filter(isParticipant)
    .filter((p) => p.kind === 'pc' && resolveParticipantClass(state, p) === 'null');
  if (nulls.length === 0) return derived;

  if (event.kind === 'malice-spent') {
    for (const nullPc of nulls) {
      if (nullPc.perEncounterFlags.perRound.directorSpentMalice) continue;
      derived.push(
        {
          actor: ctx.actor,
          source: 'server',
          type: 'GainResource',
          payload: { participantId: nullPc.id, name: 'discipline', amount: 1 },
        },
        {
          actor: ctx.actor,
          source: 'server',
          type: 'SetParticipantPerRoundFlag',
          payload: {
            participantId: nullPc.id,
            key: 'directorSpentMalice',
            value: true,
          },
        },
      );
    }
    return derived;
  }

  if (event.kind === 'main-action-used') {
    // Find the actor; only enemies (foes) trigger this. Without a side stamp
    // on the participant we treat `kind: 'monster'` as the enemy side relative
    // to a PC Null. This matches the slice-2a convention (heroes = PCs, foes
    // = monsters).
    const actor = state.participants.filter(isParticipant).find((p) => p.id === event.actorId);
    if (!actor) return derived;
    if (actor.kind !== 'monster') return derived;
    for (const nullPc of nulls) {
      if (nullPc.perEncounterFlags.perRound.nullFieldEnemyMainTriggered) continue;
      if (!hasActiveNullFieldOver(state, nullPc, actor.id)) continue;
      derived.push(
        {
          actor: ctx.actor,
          source: 'server',
          type: 'GainResource',
          payload: { participantId: nullPc.id, name: 'discipline', amount: 1 },
        },
        {
          actor: ctx.actor,
          source: 'server',
          type: 'SetParticipantPerRoundFlag',
          payload: {
            participantId: nullPc.id,
            key: 'nullFieldEnemyMainTriggered',
            value: true,
          },
        },
      );
    }
    return derived;
  }

  return derived;
}
