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
  const target = state.participants.find(
    (p): p is Participant => isParticipant(p) && p.id === participantId,
  );
  if (!target) {
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
  // Phase 2b slice 2 — Memonek Unphased gate. `surprised` is a participant
  // flag, not a ConditionType, so the typed condition-immunity helper
  // doesn't fit; we gate at the flag-flip site via the bare purchasedTraits
  // slug ('unphased' — Memonek is the only ancestry with this trait).
  // If a typed flag-immunity helper grows in a future slice, generalize here.
  // Allow flipping surprised → false (clearing) even on an immune participant
  // so corrective edits are still possible.
  if (surprised && target.purchasedTraits.includes('unphased')) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'info',
          text: `${target.name} is immune to surprise (Memonek Unphased)`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'memonek-unphased-immunity',
          message: 'Memonek Unphased makes this participant immune to surprise',
        },
      ],
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
