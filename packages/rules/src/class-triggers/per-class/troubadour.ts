import type { Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Troubadour class-δ action triggers (canon § 5.4.8).
//
// Drama-state-driven triggers (winded, hero-dies, drama-cross-30 etc.) live
// elsewhere — stamina-transition.ts for stamina events, gain-resource.ts for
// the drama-cross-30 auto-revive OA. This file owns the two action-driven
// paths:
//
// Trigger 1 — three heroes used an ability on the same turn (per-encounter):
//   When the encounter's `perTurn.heroesActedThisTurn` set reaches size ≥3,
//   every eligible Troubadour gains +2 drama, first time per encounter
//   (gated by `perEncounter.troubadourThreeHeroesTriggered`). The
//   heroesActedThisTurn set lives on the EncounterPhase (added by Task 4),
//   NOT on the participant; use-ability.ts writes to it BEFORE evaluating
//   triggers so this evaluator reads the post-write size.
//
// Trigger 2 — LoE nat 19/20 (spatial OA, no latch):
//   When any creature within line of effect of a Troubadour rolls a nat 19
//   or nat 20 on a power roll, the engine raises a
//   `spatial-trigger-troubadour-line-of-effect` OpenAction for every
//   eligible Troubadour. Spatial — line-of-effect is a positional check
//   the claimant must satisfy at claim time — so no latch and the OA fires
//   every qualifying roll.
//
// Posthumous-eligibility predicate (`canGainDrama`):
//   Alive Troubadours always gain. A dead Troubadour can still bank drama
//   if and only if their body is intact AND `posthumousDramaEligible` is
//   true (the drama-cross-30 auto-revive lifecycle in Task 28 flips this
//   eligibility off after one revive). bodyIntact=false (body destroyed,
//   eaten, disintegrated) ends the posthumous window unconditionally.

function canGainDrama(trou: Participant): boolean {
  if (trou.staminaState !== 'dead') return true;
  return trou.bodyIntact === true && trou.posthumousDramaEligible === true;
}

export function evaluate(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  const derived: DerivedIntent[] = [];
  const troubadours = state.participants
    .filter(isParticipant)
    .filter((p) => p.kind === 'pc' && resolveParticipantClass(state, p) === 'troubadour')
    .filter(canGainDrama);
  if (troubadours.length === 0) return derived;

  if (event.kind === 'ability-used' && event.sideOfActor === 'heroes') {
    const acted = state.encounter?.perEncounterFlags.perTurn.heroesActedThisTurn ?? [];
    if (acted.length < 3) return derived;
    for (const trou of troubadours) {
      if (trou.perEncounterFlags.perEncounter.troubadourThreeHeroesTriggered) continue;
      derived.push(
        {
          actor: ctx.actor,
          source: 'server',
          type: 'GainResource',
          payload: { participantId: trou.id, name: 'drama', amount: 2 },
        },
        {
          actor: ctx.actor,
          source: 'server',
          type: 'SetParticipantPerEncounterLatch',
          payload: {
            participantId: trou.id,
            key: 'troubadourThreeHeroesTriggered',
            value: true,
          },
        },
      );
    }
    return derived;
  }

  if (event.kind === 'roll-power-outcome') {
    const crit = event.naturalValues.find((v) => v === 19 || v === 20);
    if (crit === undefined) return derived;
    const actor = state.participants
      .filter(isParticipant)
      .find((p) => p.id === event.actorId);
    for (const trou of troubadours) {
      derived.push({
        actor: ctx.actor,
        source: 'server',
        type: 'RaiseOpenAction',
        payload: {
          kind: 'spatial-trigger-troubadour-line-of-effect',
          participantId: trou.id,
          expiresAtRound: null,
          payload: {
            actorId: event.actorId,
            actorName: actor?.name,
            naturalValue: crit,
          },
        },
      });
    }
    return derived;
  }

  return derived;
}
