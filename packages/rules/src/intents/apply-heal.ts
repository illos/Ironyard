import { ApplyHealPayloadSchema } from '@ironyard/shared';
import type { IntentResult, SessionState, StampedIntent } from '../types';

// Slice 7: restore HP up to maxStamina. Used as the derived intent emitted by
// SpendRecovery; future heal abilities reuse this dispatch path. A
// dying-but-alive PC (currentStamina < 0 per canon §2.8) climbs from their
// negative value when healed — the cap is `maxStamina`, the floor is the
// existing currentStamina (we never *reduce* via ApplyHeal).
export function applyApplyHeal(state: SessionState, intent: StampedIntent): IntentResult {
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

  if (!state.activeEncounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const { targetId, amount } = parsed.data;
  const target = state.activeEncounter.participants.find((p) => p.id === targetId);
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
  const updatedTarget = { ...target, currentStamina: after };
  const updatedParticipants = state.activeEncounter.participants.map((p) =>
    p.id === targetId ? updatedTarget : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: { ...state.activeEncounter, participants: updatedParticipants },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} heals ${delivered} (${before} → ${after})`,
        intentId: intent.id,
      },
    ],
  };
}
