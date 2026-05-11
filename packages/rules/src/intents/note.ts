import { NotePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, NoteEntry, StampedIntent } from '../types';

export function applyNote(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = NotePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `Note rejected: ${parsed.error.message}`, intentId: intent.id }],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const note: NoteEntry = {
    intentId: intent.id,
    actorId: intent.actor.userId,
    text: parsed.data.text,
    timestamp: intent.timestamp,
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      notes: [...state.notes, note],
    },
    derived: [],
    log: [{ kind: 'info', text: `note: ${parsed.data.text}`, intentId: intent.id }],
  };
}
