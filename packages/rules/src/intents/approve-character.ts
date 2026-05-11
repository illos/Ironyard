import { ApproveCharacterPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Side-effect intent: reducer validates + logs; D1 write (status → 'approved') in DO.
export function applyApproveCharacter(state: CampaignState, intent: StampedIntent): IntentResult {
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: 'ApproveCharacter requires active director', intentId: intent.id },
      ],
      errors: [
        { code: 'not_active_director', message: 'only the active director may approve characters' },
      ],
    };
  }

  const parsed = ApproveCharacterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ApproveCharacter rejected: ${parsed.error.message}`,
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
    log: [{ kind: 'info', text: `character ${characterId} approved`, intentId: intent.id }],
  };
}
