import { RemoveApprovedCharacterPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Side-effect intent: reducer validates + logs; D1 row delete in DO.
export function applyRemoveApprovedCharacter(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'RemoveApprovedCharacter requires active director',
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'not_active_director',
          message: 'only the active director may remove approved characters',
        },
      ],
    };
  }

  const parsed = RemoveApprovedCharacterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RemoveApprovedCharacter rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { characterId } = parsed.data;

  return {
    state: { ...state, seq: state.seq + 1 },
    derived: [],
    log: [{ kind: 'info', text: `approved character ${characterId} removed`, intentId: intent.id }],
  };
}
