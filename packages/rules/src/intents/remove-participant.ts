import { RemoveParticipantPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyRemoveParticipant(state: CampaignState, intent: StampedIntent): IntentResult {
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: 'RemoveParticipant requires active director', intentId: intent.id },
      ],
      errors: [
        {
          code: 'not_active_director',
          message: 'only the active director may remove participants',
        },
      ],
    };
  }

  const parsed = RemoveParticipantPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RemoveParticipant rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId } = parsed.data;

  // Cannot remove the participant who is currently taking their turn.
  if (state.encounter?.activeParticipantId === participantId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RemoveParticipant rejected: participant ${participantId} is active`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'participant_is_active',
          message: 'cannot remove the currently active participant',
        },
      ],
    };
  }

  const newParticipants = state.participants.filter((p) => p.id !== participantId);
  const newEncounter =
    state.encounter === null
      ? null
      : {
          ...state.encounter,
          turnOrder: state.encounter.turnOrder.filter((id) => id !== participantId),
        };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: newParticipants,
      encounter: newEncounter,
    },
    derived: [],
    log: [{ kind: 'info', text: `removed participant ${participantId}`, intentId: intent.id }],
  };
}
