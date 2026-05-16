import type { CampaignState, DerivedIntent } from '../../types';
import { isParticipant } from '../../types';
import type { ActionEvent, ActionTriggerContext } from '../action-triggers';
import { resolveParticipantClass } from '../helpers';

// Pass 3 Slice 2a — Elementalist class-δ action triggers.
//
// Essence (canon § 5.4.3) — within-10 spatial OA:
//   When a creature within 10 squares of an Elementalist takes typed damage
//   (i.e. anything other than untyped/holy), that Elementalist may gain 1
//   essence. Spatial — distance can change between the event and the player's
//   claim — so we raise an OpenAction rather than auto-applying. Gated by
//   `perRound.elementalistDamageWithin10Triggered` per Elementalist.
//
// Latch handling follows the same pattern as Tactician's
// `allyHeroicWithin10Triggered` and Null's `nullFieldEnemyMainTriggered`:
// we read the latch to suppress duplicate raises, but we do NOT flip it
// here. The latch flip lives with the OA claim/decline handler (Task 27's
// claim-open-action.ts) so that a player who declines the prompt can still
// be offered the next qualifying damage event in the same round.
//
// Holy is excluded per the Essence canon entry: holy is the divine-power
// damage type used by Censor/Conduit and is not an elemental source.
// Untyped damage (falling, environmental, etc.) is likewise excluded
// because it has no elemental flavor to draw essence from.

export function evaluate(
  state: CampaignState,
  event: ActionEvent,
  ctx: ActionTriggerContext,
): DerivedIntent[] {
  if (event.kind !== 'damage-applied') return [];
  if (event.type === 'untyped') return [];
  if (event.type === 'holy') return [];

  const derived: DerivedIntent[] = [];
  const elementalists = state.participants
    .filter(isParticipant)
    .filter((p) => p.kind === 'pc' && resolveParticipantClass(state, p) === 'elementalist');
  if (elementalists.length === 0) return derived;

  // Resolve target name once for the OA payload (drives the title/body in
  // open-action-copy.ts). If the target isn't on the roster anymore (e.g.,
  // freshly removed), fall back to the id so the OA still renders.
  const target = state.participants.filter(isParticipant).find((p) => p.id === event.targetId);
  const targetName = target?.name ?? event.targetId;

  for (const ele of elementalists) {
    if (ele.perEncounterFlags.perRound.elementalistDamageWithin10Triggered) continue;
    derived.push({
      actor: ctx.actor,
      source: 'server',
      type: 'RaiseOpenAction',
      payload: {
        kind: 'spatial-trigger-elementalist-essence',
        participantId: ele.id,
        expiresAtRound: null,
        payload: {
          targetId: event.targetId,
          targetName,
          amount: event.amount,
          type: event.type,
        },
      },
    });
  }
  return derived;
}
