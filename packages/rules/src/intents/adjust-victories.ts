import { AdjustVictoriesPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyAdjustVictories(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = AdjustVictoriesPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `AdjustVictories rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.encounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'AdjustVictories: no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  if (state.activeDirectorId === null || state.activeDirectorId !== intent.actor.userId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'AdjustVictories: forbidden', intentId: intent.id }],
      errors: [{ code: 'forbidden', message: 'only the active director can adjust victories' }],
    };
  }

  const { delta } = parsed.data;
  const updated = state.participants.map((p) =>
    isParticipant(p) && p.kind === 'pc'
      ? { ...p, victories: Math.max(0, p.victories + delta) }
      : p,
  );

  return {
    state: { ...state, seq: state.seq + 1, participants: updated },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `Director ${delta >= 0 ? 'awards' : 'deducts'} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'victory' : 'victories'} to the party`,
        intentId: intent.id,
      },
    ],
  };
}
