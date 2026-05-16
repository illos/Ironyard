import type { Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Null class-δ action triggers.
//
// Discipline (canon § 5.4.5) covers two distinct triggers off two different
// event shapes; both are dispatched from a single evaluator that fans out by
// `event.kind`.
//
// Trigger 1 — malice spent (action-driven, per-Null latch):
//   When the director spends malice, every Null gains 1 discipline, first
//   time per round per Null (gated by `perRound.directorSpentMalice`).
//
// Trigger 2 — enemy main action inside this Null's Null Field (spatial OA):
//   When an enemy creature uses a main action while inside this Null's active
//   Null Field, the Null may gain 1 discipline. Spatial — the field's footprint
//   and the enemy's position can change between the event and the claim — so
//   we raise an OpenAction rather than auto-applying. Gated by
//   `perRound.nullFieldEnemyMainTriggered` per Null.
//
// Null-Field-tracking state does not yet exist in the engine (the ability
// resolution that records an active Null Field on the Null participant lands
// in a later slice). Until then, `hasActiveNullField` is a permissive stub
// that returns true unconditionally — generous so that the trigger
// infrastructure can be validated end-to-end. The Discipline Null-Field canon
// entry is therefore manual-override in production today (the director can
// hand-grant discipline); the auto path activates fully once the Null Field
// ability resolution lands.
//
// TODO Slice 2b/2c: replace the `hasActiveNullField` stub with a real query
// against the Null's recorded Null Field (likely an `activeAbilities` entry
// with `abilityId: 'null-field'` or similar) and a position check against the
// event actor's coordinates.

function hasActiveNullField(_state: CampaignState, _nullPc: Participant): boolean {
  // Permissive stub — see header comment.
  return true;
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
      if (!hasActiveNullField(state, nullPc)) continue;
      derived.push({
        actor: ctx.actor,
        source: 'server',
        type: 'RaiseOpenAction',
        payload: {
          kind: 'spatial-trigger-null-field',
          participantId: nullPc.id,
          expiresAtRound: null,
          payload: {
            actorId: actor.id,
            actorName: actor.name,
          },
        },
      });
    }
    return derived;
  }

  return derived;
}
