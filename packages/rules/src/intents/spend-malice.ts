import { SpendMalicePayloadSchema } from '@ironyard/shared';
import type { IntentResult, SessionState, StampedIntent } from '../types';

// Slice 7: subtract from the Director's Malice counter (canon §5.5). No
// `insufficient_malice` rejection — canon explicitly permits going negative
// ("Negative Malice. Some abilities can drive Malice below 0...").
export function applySpendMalice(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = SpendMalicePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SpendMalice rejected: ${parsed.error.message}`,
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

  const { amount, reason } = parsed.data;
  const before = state.activeEncounter.malice.current;
  const after = before - amount;

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
        text: `Director spends ${amount} Malice${reason ? ` (${reason})` : ''} (${before} → ${after})`,
        intentId: intent.id,
      },
    ],
  };
}
