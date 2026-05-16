import { EndFlyingPayloadSchema, IntentTypes, type Participant } from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Phase 2b Group A+B (slice 6) — EndFlying reducer.
//
// Clears `participant.movementMode` (sets to null) and, when the cause is a
// fall (any reason except 'voluntary'), emits a derived SetCondition
// { type: 'Prone' } so the cascade lands Prone — unless the target already
// has Prone, in which case the derived intent is suppressed for idempotency.
//
// Canon: Devil.md / Dragon Knight.md Wings — "You can stay aloft for a number
// of rounds equal to your Might score (minimum 1 round) before you fall." The
// "before you fall" clause makes duration-expired a fall, not a soft landing.
// 'voluntary' is the only landing-without-Prone case.
//
// No fall damage — the engine does not track altitude. See memory
// `project_no_movement_tracking`. Log entry captures the rounds-remaining
// value at fall time for table adjudication.

export function applyEndFlying(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = EndFlyingPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `EndFlying rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId, reason } = parsed.data;
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

  const priorRoundsRemaining = target.movementMode?.roundsRemaining ?? 0;
  const updatedTarget: Participant = { ...target, movementMode: null };
  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === participantId ? updatedTarget : p,
  );

  // Fall path (incl. duration-expired): emit derived Prone unless already
  // present. Voluntary lands cleanly. Source.id = 'fall-from-flying' so the
  // log + downstream filters can identify the cause.
  const derived: DerivedIntent[] = [];
  if (reason !== 'voluntary') {
    const alreadyProne = target.conditions.some((c) => c.type === 'Prone');
    if (!alreadyProne) {
      derived.push({
        actor: intent.actor,
        source: 'server',
        type: IntentTypes.SetCondition,
        causedBy: intent.id,
        payload: {
          targetId: participantId,
          condition: 'Prone',
          source: { kind: 'effect', id: 'fall-from-flying' },
          duration: { kind: 'manual' },
        },
      });
    }
  }

  const logText =
    reason === 'voluntary'
      ? `${target.name} lands (voluntary)`
      : `${target.name} fell from ${priorRoundsRemaining} rounds aloft (${reason})`;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
    },
    derived,
    log: [{ kind: 'info', text: logText, intentId: intent.id }],
  };
}
