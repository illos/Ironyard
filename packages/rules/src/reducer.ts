import { IntentTypes } from '@ironyard/shared';
import {
  applyApplyDamage,
  applyBringCharacterIntoEncounter,
  applyJoinSession,
  applyLeaveSession,
  applyNote,
  applyRollPower,
  applyStartEncounter,
} from './intents';
import type { IntentResult, SessionState, StampedIntent } from './types';

// The pure reducer. No Date.now(), no Math.random(). The DO stamps timestamp
// and assigns seq before calling. Each handler returns a new state via
// immutable spread — no mutation. Derived intents are emitted without
// id/timestamp/sessionId; the DO fills those in before recursively applying.
export function applyIntent(state: SessionState, intent: StampedIntent): IntentResult {
  switch (intent.type) {
    case IntentTypes.JoinSession:
      return applyJoinSession(state, intent);
    case IntentTypes.LeaveSession:
      return applyLeaveSession(state, intent);
    case IntentTypes.Note:
      return applyNote(state, intent);
    case IntentTypes.StartEncounter:
      return applyStartEncounter(state, intent);
    case IntentTypes.BringCharacterIntoEncounter:
      return applyBringCharacterIntoEncounter(state, intent);
    case IntentTypes.RollPower:
      return applyRollPower(state, intent);
    case IntentTypes.ApplyDamage:
      return applyApplyDamage(state, intent);
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
