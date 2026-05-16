import { type Participant, SetMovementModePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Phase 2b Group A+B (slice 6) — utility reducer for the round-tick countdown.
// Trivial: set `participant.movementMode` to the payload value (a non-null
// MovementMode record or null). Server-only; the wings ancestry-trigger
// emits this from `evaluateOnEndRound` to decrement `roundsRemaining`.

export function applySetMovementMode(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SetMovementModePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetMovementMode rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId, movementMode } = parsed.data;
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

  const updatedTarget: Participant = { ...target, movementMode };
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
        text: movementMode
          ? `${target.name} movementMode ← ${movementMode.mode} (${movementMode.roundsRemaining} rounds)`
          : `${target.name} movementMode cleared`,
        intentId: intent.id,
      },
    ],
  };
}
