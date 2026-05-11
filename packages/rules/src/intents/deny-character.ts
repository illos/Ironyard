import { DenyCharacterPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Side-effect intent: reducer validates + logs; D1 write (row delete or status change) in DO.
export function applyDenyCharacter(state: CampaignState, intent: StampedIntent): IntentResult {
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'DenyCharacter requires active director', intentId: intent.id }],
      errors: [
        { code: 'not_active_director', message: 'only the active director may deny characters' },
      ],
    };
  }

  const parsed = DenyCharacterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `DenyCharacter rejected: ${parsed.error.message}`,
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
    log: [{ kind: 'info', text: `character ${characterId} denied`, intentId: intent.id }],
  };
}
