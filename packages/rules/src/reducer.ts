import { IntentTypes } from '@ironyard/shared';
import { applyJoinSession, applyLeaveSession, applyNote } from './intents';
import type { IntentResult, SessionState, StampedIntent } from './types';

// The pure reducer. No Date.now(), no Math.random(). The DO stamps timestamp
// and assigns seq before calling. Each handler returns a new state via
// immutable spread — no mutation.
export function applyIntent(state: SessionState, intent: StampedIntent): IntentResult {
  switch (intent.type) {
    case IntentTypes.JoinSession:
      return applyJoinSession(state, intent);
    case IntentTypes.LeaveSession:
      return applyLeaveSession(state, intent);
    case IntentTypes.Note:
      return applyNote(state, intent);
    default:
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `Unknown intent type: ${intent.type}`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'unknown_intent', message: `Unknown intent type: ${intent.type}` }],
      };
  }
}
