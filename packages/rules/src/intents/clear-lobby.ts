import { ClearLobbyPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyClearLobby(state: CampaignState, intent: StampedIntent): IntentResult {
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'ClearLobby requires active director', intentId: intent.id }],
      errors: [
        { code: 'not_active_director', message: 'only the active director may clear the lobby' },
      ],
    };
  }

  const parsed = ClearLobbyPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ClearLobby rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (state.encounter !== null) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: 'ClearLobby rejected: encounter is active', intentId: intent.id },
      ],
      errors: [
        {
          code: 'encounter_active',
          message: 'cannot clear the lobby while an encounter is in progress',
        },
      ],
    };
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: [],
    },
    derived: [],
    log: [{ kind: 'info', text: 'lobby cleared', intentId: intent.id }],
  };
}
