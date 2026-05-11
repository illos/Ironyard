import { JoinLobbyPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyJoinLobby(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = JoinLobbyPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `JoinLobby rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { userId, displayName } = parsed.data;
  const seq = state.seq + 1;

  // Idempotent — re-joining is a no-op on connectedMembers.
  if (state.connectedMembers.some((m) => m.userId === userId)) {
    return {
      state: { ...state, seq },
      derived: [],
      log: [{ kind: 'info', text: `${displayName} rejoined`, intentId: intent.id }],
    };
  }

  return {
    state: {
      ...state,
      seq,
      connectedMembers: [...state.connectedMembers, { userId, displayName }],
    },
    derived: [],
    log: [{ kind: 'info', text: `${displayName} joined`, intentId: intent.id }],
  };
}
