import { ApplyHealPayloadSchema, IntentTypes } from '@ironyard/shared';
import { evaluateStaminaTransitionTriggers } from '../class-triggers';
import { applyTransitionSideEffects, recomputeStaminaState } from '../stamina';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

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

  // Phase 2b 2b.15 B31 — Revenant inert (Revenant.md:91), Hakaan rubble
  // (Hakaan.md:135), and Title Doomed (Doomed.md:22) all forbid stamina
  // regen while the override is active. Reject the heal up front so the
  // override is consulted before any stamina mutation.
  const override = target.staminaOverride;
  const canRegainStamina =
    override === null ||
    (override.kind === 'inert' && override.canRegainStamina) ||
    (override.kind === 'rubble' && override.canRegainStamina) ||
    (override.kind === 'doomed' && override.canRegainStamina) ||
    override.kind === 'extra-dying-trigger';
  if (!canRegainStamina) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ApplyHeal rejected: ${target.name} can't regain Stamina (${override?.kind} override)`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'cannot_regain_stamina',
          message: `target ${targetId} has a staminaOverride with canRegainStamina:false`,
        },
      ],
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
    ? [
        {
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
        },
      ]
    : [];

  // Pass 3 Slice 2a — class-δ stamina-transition triggers. Heal only ever
  // produces upward transitions (dying → winded/healthy, unconscious → winded/
  // healthy). The Fury Ferocity entries and the Troubadour any-hero-winded
  // entry all filter on `cause === 'damage'`, so passing `cause: 'heal'` here
  // is sufficient to skip them safely — ferocityD3 stays undefined because no
  // Fury entry will match. The Troubadour hero-dies and posthumous-drama
  // entries match on `to: 'dead'` regardless of cause, but heal cannot
  // produce a dead transition.
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
