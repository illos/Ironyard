import { MarkSurprisedPayloadSchema, type Participant } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyMarkSurprised(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = MarkSurprisedPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkSurprised rejected: ${parsed.error.message}`,
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
      log: [{ kind: 'error', text: 'MarkSurprised: no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'MarkSurprised: director only', intentId: intent.id }],
      errors: [{ code: 'not_permitted', message: 'only the active director may mark surprise' }],
    };
  }
  if (state.encounter.currentRound !== null && state.encounter.currentRound > 1) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: 'MarkSurprised: surprise ends after round 1', intentId: intent.id },
      ],
      errors: [
        {
          code: 'surprise_window_closed',
          message: 'surprise can only be edited during round 1 or before initiative',
        },
      ],
    };
  }
  const { participantId, surprised } = parsed.data;
  const exists = state.participants.some(
    (p): p is Participant => isParticipant(p) && p.id === participantId,
  );
  if (!exists) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkSurprised: unknown participant ${participantId}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'unknown_participant', message: `unknown participant ${participantId}` }],
    };
  }
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? { ...p, surprised } : p,
      ),
    },
    derived: [],
    log: [{ kind: 'info', text: `${participantId} surprised = ${surprised}`, intentId: intent.id }],
  };
}
