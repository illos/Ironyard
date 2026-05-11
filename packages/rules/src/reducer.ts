import { IntentTypes } from '@ironyard/shared';
import {
  applyApplyDamage,
  applyApplyHeal,
  applyBringCharacterIntoEncounter,
  applyEndEncounter,
  applyEndRound,
  applyEndTurn,
  applyGainMalice,
  applyGainResource,
  applyJoinSession,
  applyLeaveSession,
  applyNote,
  applyRemoveCondition,
  applyRollPower,
  applyRollResistance,
  applySetCondition,
  applySetInitiative,
  applySetResource,
  applySetStamina,
  applySpendMalice,
  applySpendRecovery,
  applySpendResource,
  applySpendSurge,
  applyStartEncounter,
  applyStartRound,
  applyStartTurn,
  applyUndo,
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
    case IntentTypes.EndEncounter:
      return applyEndEncounter(state, intent);
    case IntentTypes.BringCharacterIntoEncounter:
      return applyBringCharacterIntoEncounter(state, intent);
    case IntentTypes.RollPower:
      return applyRollPower(state, intent);
    case IntentTypes.ApplyDamage:
      return applyApplyDamage(state, intent);
    case IntentTypes.StartRound:
      return applyStartRound(state, intent);
    case IntentTypes.EndRound:
      return applyEndRound(state, intent);
    case IntentTypes.StartTurn:
      return applyStartTurn(state, intent);
    case IntentTypes.EndTurn:
      return applyEndTurn(state, intent);
    case IntentTypes.SetInitiative:
      return applySetInitiative(state, intent);
    case IntentTypes.SetCondition:
      return applySetCondition(state, intent);
    case IntentTypes.RemoveCondition:
      return applyRemoveCondition(state, intent);
    case IntentTypes.RollResistance:
      return applyRollResistance(state, intent);
    case IntentTypes.GainResource:
      return applyGainResource(state, intent);
    case IntentTypes.SpendResource:
      return applySpendResource(state, intent);
    case IntentTypes.SetResource:
      return applySetResource(state, intent);
    case IntentTypes.SetStamina:
      return applySetStamina(state, intent);
    case IntentTypes.SpendSurge:
      return applySpendSurge(state, intent);
    case IntentTypes.SpendRecovery:
      return applySpendRecovery(state, intent);
    case IntentTypes.ApplyHeal:
      return applyApplyHeal(state, intent);
    case IntentTypes.GainMalice:
      return applyGainMalice(state, intent);
    case IntentTypes.SpendMalice:
      return applySpendMalice(state, intent);
    case IntentTypes.Undo:
      return applyUndo(state, intent);
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
