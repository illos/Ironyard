// Phase 2b Group A+B (slice 9) — Orc Relentless (signature trait).
//
// Canon (Orc.md "Signature Trait: Relentless"):
//   "Whenever a creature deals damage to you that leaves you dying, you can
//    make a free strike against any creature. If the creature is reduced to 0
//    Stamina by your strike, you can spend a Recovery."
//
// The trigger raises an `orc-relentless-free-strike` OpenAction when an Orc
// PC transitions to dying via damage. The free strike + recovery-spend are
// player-driven follow-ups dispatched manually through existing intents
// (UseAbility for the strike; SpendRecovery for the recovery). The OA UI
// renders the prompt once a claim handler is wired (deferred — this slice
// ships the raise, not the consumer).
//
// Signature traits are auto-granted; Relentless is gated on
// `participant.ancestry.includes('orc')` (no purchasedTraits check needed).

import { IntentTypes, type StaminaTransitionedPayload } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import { isParticipant } from '../types';
import type { AncestryTriggerContext } from './index';

export function onStaminaTransitioned(
  state: CampaignState,
  payload: StaminaTransitionedPayload,
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  // Canon: "leaves you dying" + "deals damage to you" — gate on both.
  if (payload.to !== 'dying') return [];
  if (payload.cause !== 'damage') return [];

  const target = state.participants
    .filter(isParticipant)
    .find((p) => p.id === payload.participantId);
  if (!target || target.kind !== 'pc') return [];
  if (!target.ancestry.includes('orc')) return [];

  return [
    {
      actor: ctx.actor,
      source: 'server' as const,
      type: IntentTypes.RaiseOpenAction,
      payload: {
        kind: 'orc-relentless-free-strike',
        participantId: target.id,
        expiresAtRound: null,
        payload: {},
      },
    },
  ];
}
