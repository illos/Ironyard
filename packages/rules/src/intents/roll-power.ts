import { IntentTypes, RollPowerPayloadSchema } from '@ironyard/shared';
import { resolvePowerRoll } from '../power-roll';
import type { DerivedIntent, IntentResult, SessionState, StampedIntent } from '../types';

export function applyRollPower(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = RollPowerPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RollPower rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.activeEncounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const { abilityId, attackerId, targetIds, characteristic, edges, banes, rolls, ladder } =
    parsed.data;

  const attacker = state.activeEncounter.participants.find((p) => p.id === attackerId);
  if (!attacker) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `attacker ${attackerId} not found`, intentId: intent.id }],
      errors: [{ code: 'attacker_missing', message: `attacker ${attackerId} not in encounter` }],
    };
  }

  for (const id of targetIds) {
    if (!state.activeEncounter.participants.some((p) => p.id === id)) {
      return {
        state,
        derived: [],
        log: [{ kind: 'error', text: `target ${id} not found`, intentId: intent.id }],
        errors: [{ code: 'target_missing', message: `target ${id} not in encounter` }],
      };
    }
  }

  const outcome = resolvePowerRoll({
    d10: rolls.d10,
    characteristic: attacker.characteristics[characteristic],
    edges,
    banes,
  });

  const tierEffect = outcome.tier === 1 ? ladder.t1 : outcome.tier === 2 ? ladder.t2 : ladder.t3;

  // Emit one ApplyDamage per target.
  const derived: DerivedIntent[] = targetIds.map((targetId) => ({
    actor: intent.actor,
    source: 'auto' as const,
    type: IntentTypes.ApplyDamage,
    payload: {
      targetId,
      amount: tierEffect.damage,
      damageType: tierEffect.damageType,
      sourceIntentId: intent.id,
    },
    causedBy: intent.id,
  }));

  return {
    state: { ...state, seq: state.seq + 1 },
    derived,
    log: [
      {
        kind: 'info',
        text:
          `${attacker.name} rolls ${outcome.total} (t${outcome.tier}) via ${abilityId} ` +
          `vs ${targetIds.length} target(s) → ${tierEffect.damage} ${tierEffect.damageType}`,
        intentId: intent.id,
      },
    ],
  };
}
