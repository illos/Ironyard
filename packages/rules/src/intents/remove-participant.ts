import { RemoveParticipantPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

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

  const survivors = state.participants.filter(
    (p) => !isParticipant(p) || p.id !== participantId,
  );
  // Pass 3 Slice 2b — strip the removed id from every survivor's
  // targetingRelations arrays so dangling references can't outlive the
  // referenced target.
  const newParticipants = survivors.map((entry) => {
    if (!isParticipant(entry)) return entry;
    const r = entry.targetingRelations;
    if (
      !r.judged.includes(participantId) &&
      !r.marked.includes(participantId) &&
      !r.nullField.includes(participantId)
    ) {
      return entry;
    }
    return {
      ...entry,
      targetingRelations: {
        judged: r.judged.filter((id) => id !== participantId),
        marked: r.marked.filter((id) => id !== participantId),
        nullField: r.nullField.filter((id) => id !== participantId),
      },
    };
  });
  const newEncounter = state.encounter === null ? null : { ...state.encounter };

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
