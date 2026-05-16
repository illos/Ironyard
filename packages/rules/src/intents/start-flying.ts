import { type Participant, type StaminaState, StartFlyingPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Phase 2b Group A+B (slice 6) — elective StartFlying reducer for Devil /
// Dragon Knight Wings (slice 7 reuses this path with mode === 'shadow' for
// Polder Shadowmeld).
//
// Sets `participant.movementMode = { mode, roundsRemaining }`. Per canon
// (Devil.md / Dragon Knight.md, "Wings" trait): rounds aloft = max(1, Might).
// Player dispatch is gated on staminaState ∈ {'healthy', 'winded', 'doomed'};
// the director bypasses via `source: 'server'`. Doomed is included because a
// Title-Doomed PC is fully canon-active (Doomed.md:22) — gameplay continues
// until end-of-encounter death. The full state enum is defined in
// participant.ts:131-133.

const FLYING_ALLOWED_STATES = new Set<StaminaState>(['healthy', 'winded', 'doomed']);

export function applyStartFlying(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = StartFlyingPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartFlying rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId, mode } = parsed.data;
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

  if (target.kind !== 'pc') {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `StartFlying: ${target.name} is not a PC`, intentId: intent.id },
      ],
      errors: [{ code: 'not_pc', message: 'StartFlying only valid for PCs' }],
    };
  }

  // Permission gate: stamina-state on player-dispatched intents. Director
  // override via `source: 'server'` per the spec's StartFlying gate decision.
  if (intent.source !== 'server' && !FLYING_ALLOWED_STATES.has(target.staminaState)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `${target.name} can't start flying while ${target.staminaState}`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'stamina_state_blocks_flight',
          message: `cannot start flying while ${target.staminaState}`,
        },
      ],
    };
  }

  // Canon: "you can stay aloft for a number of rounds equal to your Might
  // score (minimum 1 round) before you fall."
  const roundsRemaining = Math.max(1, target.characteristics.might);

  const updatedTarget: Participant = {
    ...target,
    movementMode: { mode, roundsRemaining },
  };
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
        text: `${target.name} starts ${mode === 'flying' ? 'flying' : 'shadowmeld'} (${roundsRemaining} rounds)`,
        intentId: intent.id,
      },
    ],
  };
}
