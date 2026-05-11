import { UndoPayloadSchema } from '@ironyard/shared';
import type { IntentResult, SessionState, StampedIntent } from '../types';

// Undo is a log marker. The actual state revert happens at the DO layer by
// marking the target + its derived chain as voided=1 in D1 and replaying the
// non-voided intents from the latest snapshot. The reducer doesn't need to
// undo anything — replay does it for free, courtesy of the pure-reducer
// guarantee. This handler just validates the payload and emits a log entry
// so the audit trail has a record.
export function applyUndo(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = UndoPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `Undo rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  return {
    state: { ...state, seq: state.seq + 1 },
    derived: [],
    log: [{ kind: 'info', text: `undid intent ${parsed.data.intentId}`, intentId: intent.id }],
  };
}
