// Phase 2b Group A+B (slice 6) — ancestry-trigger registry. Mirrors
// `class-triggers/` (see action-triggers.ts + stamina-transition.ts) but
// keys off ancestry / purchased traits rather than class. Each per-trait
// module under `./` exports zero or more event-shaped handlers; the
// dispatcher fans the call out and concatenates derived intents.
//
// Subscribed event types:
//   - onConditionApplied: post-condition push (set-condition.ts, applyKnockOut
//     in stamina.ts, applyTransitionSideEffects' Prone-on-inert path).
//   - onEndRound: end-of-round sweep (turn.ts applyEndRound).
//   - onDamageApplied: tail of apply-damage.ts (slice 8: Bloodfire).
//   - onStaminaTransitioned: stamina-state change (slice 9: Relentless).
//
// Purity contract: this module is pure. Any random draws (none in slice 6)
// must be pre-rolled at the impure call site and passed via ctx.

import type { Actor, ConditionType, StaminaTransitionedPayload } from '@ironyard/shared';
import type { CampaignState, DerivedIntent } from '../types';
import * as bloodfire from './bloodfire';
import * as fallLightly from './fall-lightly';
import * as relentless from './relentless';
import * as wings from './wings';

export type AncestryTriggerContext = {
  actor: Actor;
};

export function evaluateOnConditionApplied(
  state: CampaignState,
  payload: { participantId: string; condition: ConditionType },
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [
    ...wings.onConditionApplied(state, payload, ctx),
    ...bloodfire.onConditionApplied(state, payload, ctx),
    ...fallLightly.onConditionApplied(state, payload, ctx),
  ];
}

export function evaluateOnEndRound(
  state: CampaignState,
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [...wings.onEndRound(state, ctx), ...bloodfire.onEndRound(state, ctx)];
}

export function evaluateOnDamageApplied(
  state: CampaignState,
  payload: { targetId: string; dealerId: string | null; delivered: number },
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [...bloodfire.onDamageApplied(state, payload, ctx)];
}

export function evaluateOnStaminaTransitioned(
  state: CampaignState,
  payload: StaminaTransitionedPayload,
  ctx: AncestryTriggerContext,
): DerivedIntent[] {
  return [...relentless.onStaminaTransitioned(state, payload, ctx)];
}
