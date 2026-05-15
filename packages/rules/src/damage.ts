import type { DamageType, Participant, StaminaState, TypedResistance } from '@ironyard/shared';
import {
  applyKnockOut,
  applyTransitionSideEffects,
  checkInertFireInstantDeath,
  recomputeStaminaState,
  wouldHitDead,
} from './stamina';

function sumMatching(list: readonly TypedResistance[], type: DamageType): number {
  let total = 0;
  for (const r of list) if (r.type === type) total += r.value;
  return total;
}

export type DamageStepResult = {
  delivered: number; // damage actually applied after weakness/immunity
  before: number; // stamina before
  after: number; // stamina after
  newParticipant: Participant;
  // Pass 3 Slice 1 extensions.
  transitionedTo: StaminaState | null;
  knockedOut: boolean;
};

// Canon §2.12 engine resolution order. Slice 1 implements steps 1-4 + 6 + 7
// (state recompute + KO interception + inert-fire-instant-death). Step 5
// (temp stamina) is not yet implemented — preserved as a TODO for a later slice.
//
// `intent` defaults to 'kill' so existing callers compile unchanged.
// Task 10 will update applyApplyDamage to pass intent through from the payload.
export function applyDamageStep(
  target: Participant,
  amount: number,
  damageType: DamageType,
  intent: 'kill' | 'knock-out' = 'kill',
): DamageStepResult {
  // Step 1-2: base + pre-immunity external modifiers (none in slice 1).
  let delivered = amount;
  // Step 3: weakness.
  delivered += sumMatching(target.weaknesses, damageType);
  // Step 4: immunity.
  delivered = Math.max(0, delivered - sumMatching(target.immunities, damageType));

  const before = target.currentStamina;

  // Inert + fire-typed-listed → instant death, bypasses normal flow.
  if (checkInertFireInstantDeath(target, damageType, delivered) === 'instant-death') {
    const killed: Participant = {
      ...target,
      currentStamina: -target.maxStamina - 1,
      staminaState: 'dead',
      staminaOverride: null,
      conditions: [],
    };
    return {
      delivered,
      before,
      after: killed.currentStamina,
      newParticipant: killed,
      transitionedTo: 'dead',
      knockedOut: false,
    };
  }

  // Canon §2.9: any damage on an already-unconscious target kills them.
  if (target.staminaState === 'unconscious' && delivered > 0) {
    const killed: Participant = {
      ...target,
      currentStamina: target.kind === 'pc' ? -target.maxStamina - 1 : 0,
      staminaState: 'dead',
      staminaOverride: null,
      conditions: [],
    };
    return {
      delivered,
      before,
      after: killed.currentStamina,
      newParticipant: killed,
      transitionedTo: 'dead',
      knockedOut: false,
    };
  }

  // KO interception path — applies BEFORE damage is recorded.
  const wouldBe = before - delivered;
  if (intent === 'knock-out' && wouldHitDead(target, wouldBe)) {
    const ko = applyKnockOut(target);
    return {
      delivered: 0,
      before,
      after: before,
      newParticipant: ko,
      transitionedTo: 'unconscious',
      knockedOut: true,
    };
  }

  // Step 6: apply damage. Step 5 (temp stamina) not implemented.
  const after = before - delivered;
  const intermediate = { ...target, currentStamina: after };

  // Step 7: recompute state + apply side-effects.
  const { newState, transitioned } = recomputeStaminaState(intermediate);
  const newParticipant = transitioned
    ? applyTransitionSideEffects(intermediate, target.staminaState, newState)
    : intermediate;

  return {
    delivered,
    before,
    after,
    newParticipant,
    transitionedTo: transitioned ? newState : null,
    knockedOut: false,
  };
}
