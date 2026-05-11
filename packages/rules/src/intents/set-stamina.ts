import { SetStaminaPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Phase 1 cleanup: client-dispatchable manual HP override. Mirrors the
// SetCondition shape — payload-validate → require encounter → locate
// participant → apply atomically. No derived intents (manual override
// contract). The actor's identity rides on `intent.actor` so the log captures
// who overrode the stamina.
//
// Trust model gating: Phase 1 follows the SetCondition precedent — any
// connected member can dispatch. Player-self-only gating is a Phase 2
// follow-up that requires participant ownership (Participant.ownerUserId) in
// the schema, which doesn't exist yet. The DO already stamps `actor` from the
// WS headers, so impersonation isn't possible regardless.
export function applySetStamina(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SetStaminaPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetStamina rejected: ${parsed.error.message}`,
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

  const { participantId, currentStamina, maxStamina } = parsed.data;
  const target = state.participants.find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${participantId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `${participantId} not in encounter` }],
    };
  }

  const nextMax = maxStamina ?? target.maxStamina;
  const nextCurrent = currentStamina ?? target.currentStamina;

  if (nextCurrent < 0) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetStamina rejected: currentStamina ${nextCurrent} < 0`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_value', message: `currentStamina ${nextCurrent} < 0` }],
    };
  }

  if (nextCurrent > nextMax) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetStamina rejected: currentStamina ${nextCurrent} > maxStamina ${nextMax}`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'invalid_value',
          message: `currentStamina ${nextCurrent} > maxStamina ${nextMax}`,
        },
      ],
    };
  }

  const updatedTarget = { ...target, currentStamina: nextCurrent, maxStamina: nextMax };
  const updatedParticipants = state.participants.map((p) =>
    p.id === participantId ? updatedTarget : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} stamina set: ${target.currentStamina}/${target.maxStamina} → ${nextCurrent}/${nextMax}`,
        intentId: intent.id,
      },
    ],
  };
}
