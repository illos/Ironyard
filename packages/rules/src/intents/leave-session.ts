import { LeaveSessionPayloadSchema } from '@ironyard/shared';
import type { IntentResult, SessionState, StampedIntent } from '../types';

export function applyLeaveSession(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = LeaveSessionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `LeaveSession rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { userId } = parsed.data;
  const seq = state.seq + 1;
  const departing = state.connectedMembers.find((m) => m.userId === userId);

  // Idempotent — leaving twice is a no-op.
  if (!departing) {
    return {
      state: { ...state, seq },
      derived: [],
      log: [{ kind: 'info', text: `${userId} already absent`, intentId: intent.id }],
    };
  }

  return {
    state: {
      ...state,
      seq,
      connectedMembers: state.connectedMembers.filter((m) => m.userId !== userId),
    },
    derived: [],
    log: [{ kind: 'info', text: `${departing.displayName} left`, intentId: intent.id }],
  };
}
