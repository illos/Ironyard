import { GainMalicePayloadSchema } from '@ironyard/shared';
import type { IntentResult, SessionState, StampedIntent } from '../types';

// Slice 7: add to the Director's encounter-scoped Malice counter (canon §5.5).
// `amount` is signed — negative values are permitted (e.g. Elementalist's
// Sap Strength drives Malice below 0). No floor.
export function applyGainMalice(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = GainMalicePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `GainMalice rejected: ${parsed.error.message}`,
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

  const { amount } = parsed.data;
  const before = state.activeEncounter.malice.current;
  const after = before + amount;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: {
        ...state.activeEncounter,
        malice: { ...state.activeEncounter.malice, current: after },
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `Director ${amount >= 0 ? 'gains' : 'loses'} ${Math.abs(amount)} Malice (${before} → ${after})`,
        intentId: intent.id,
      },
    ],
  };
}
