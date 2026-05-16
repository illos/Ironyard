import { type Participant, SetBloodfireActivePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Phase 2b Group A+B (slice 8) — utility reducer for Orc Bloodfire Rush.
// Trivial: set `participant.bloodfireActive` to the payload boolean.
// Server-only; emitted by the bloodfire ancestry-trigger (onDamageApplied
// sets true on first delivered damage of the round; onEndRound clears
// to false at round-tick).

export function applySetBloodfireActive(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = SetBloodfireActivePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetBloodfireActive rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId, active } = parsed.data;
  const participants = state.participants.filter(isParticipant);
  const target = participants.find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${participantId} not found`, intentId: intent.id }],
      errors: [{ code: 'participant_not_found', message: `target ${participantId} not found` }],
    };
  }

  const updatedTarget: Participant = { ...target, bloodfireActive: active };
  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === participantId ? updatedTarget : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: active
          ? `${target.name} bloodfireActive ← true (+2 speed until end of round)`
          : `${target.name} bloodfireActive cleared`,
        intentId: intent.id,
      },
    ],
  };
}
