import type { DamageType, Participant, TypedResistance } from '@ironyard/shared';

// Slice 3 subset of §2.12. Steps 1-5 in the canon (weakness, then immunity,
// then stamina). Steps 6+ (winded/dying/dead transitions, temp stamina) land
// in slice 4+.

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
};

export function applyDamageStep(
  target: Participant,
  amount: number,
  damageType: DamageType,
): DamageStepResult {
  let delivered = amount;
  delivered += sumMatching(target.weaknesses, damageType);
  delivered = Math.max(0, delivered - sumMatching(target.immunities, damageType));

  const before = target.currentStamina;
  const after = Math.max(0, before - delivered);

  return {
    delivered,
    before,
    after,
    newParticipant: { ...target, currentStamina: after },
  };
}
