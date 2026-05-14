import { GainHeroTokenPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyGainHeroToken(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = GainHeroTokenPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `GainHeroToken rejected: ${parsed.error.message}`,
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
      log: [{ kind: 'error', text: 'no active session', intentId: intent.id }],
      errors: [{ code: 'no_active_session', message: 'no session is active' }],
    };
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      heroTokens: state.heroTokens + parsed.data.amount,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `+${parsed.data.amount} hero token(s) (now ${state.heroTokens + parsed.data.amount})`,
        intentId: intent.id,
      },
    ],
  };
}
