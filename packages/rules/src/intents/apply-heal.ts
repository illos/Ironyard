import { ApplyHealPayloadSchema, IntentTypes } from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';
import { applyTransitionSideEffects, recomputeStaminaState } from '../stamina';
import { evaluateStaminaTransitionTriggers } from '../class-triggers';

// Slice 7: restore HP up to maxStamina. Used as the derived intent emitted by
// SpendRecovery; future heal abilities reuse this dispatch path. A
// dying-but-alive PC (currentStamina < 0 per canon §2.8) climbs from their
// negative value when healed — the cap is `maxStamina`, the floor is the
// existing currentStamina (we never *reduce* via ApplyHeal).
export function applyApplyHeal(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ApplyHealPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ApplyHeal rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.encounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const { targetId, amount } = parsed.data;
  const participants = state.participants.filter(isParticipant);
  const target = participants.find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${targetId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `target ${targetId} not in encounter` }],
    };
  }

  const before = target.currentStamina;
  const after = Math.min(before + amount, target.maxStamina);
  const delivered = after - before;
  const intermediate = { ...target, currentStamina: after };

  // Pass 3 Slice 1 — recompute state after heal. If state changes (e.g. dying →
  // healthy/winded), apply side-effects (clears non-removable dying Bleeding).
  const { newState, transitioned } = recomputeStaminaState(intermediate);
  const finalTarget = transitioned
    ? applyTransitionSideEffects(intermediate, target.staminaState, newState)
    : intermediate;

  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === targetId ? finalTarget : p,
  );

  // Emit derived StaminaTransitioned when state changes.
  const derived: DerivedIntent[] = transitioned
    ? [{
        type: IntentTypes.StaminaTransitioned,
        actor: intent.actor,
        payload: {
          participantId: targetId,
          from: target.staminaState,
          to: finalTarget.staminaState,
          cause: 'heal',
        },
        source: 'server' as const,
        causedBy: intent.id,
      }]
    : [];

  // Pass 3 Slice 2a — class-δ stamina-transition triggers. Heal mostly drives
  // upward transitions (dying → winded / healthy); the Troubadour any-hero-
  // winded entry can legitimately fire when a hero is healed back up to the
  // winded band on the first time per encounter. The Fury Ferocity entries
  // also nominally match `to: 'winded' | 'dying'` from the upward direction,
  // which is rules-questionable (Ferocity is intuitively a "took damage past
  // half" trigger). ferocityD3 is intentionally undefined here — if the Fury
  // entries do fire from a heal, the evaluator throws and we'll know.
  // Direction-filtering on the trigger matchers is out of scope for Task 16.
  if (transitioned) {
    const postHealState: CampaignState = { ...state, participants: updatedParticipants };
    const triggerDerived = evaluateStaminaTransitionTriggers(
      {
        participantId: targetId,
        from: target.staminaState,
        to: finalTarget.staminaState,
        cause: 'heal',
      },
      postHealState,
      { actor: intent.actor, rolls: { ferocityD3: undefined } },
    );
    for (const d of triggerDerived) {
      derived.push({ ...d, causedBy: intent.id });
    }
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `${target.name} heals ${delivered} (${before} → ${after})`,
        intentId: intent.id,
      },
    ],
  };
}
