import { EndSessionPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyEndSession(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = EndSessionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `EndSession rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  if (state.currentSessionId === null) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active session to end', intentId: intent.id }],
      errors: [{ code: 'no_active_session', message: 'no session is active' }],
    };
  }

  const closedId = state.currentSessionId;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      currentSessionId: null,
      attendingCharacterIds: [],
      // heroTokens left as-is so the snapshot can land in the D1 row via side-effect.
    },
    derived: [],
    log: [{ kind: 'info', text: `session ${closedId} ended`, intentId: intent.id }],
  };
}
