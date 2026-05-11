import { StartEncounterPayloadSchema } from '@ironyard/shared';
import type { IntentResult, SessionState, StampedIntent } from '../types';

export function applyStartEncounter(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = StartEncounterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartEncounter rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { encounterId } = parsed.data;
  const seq = state.seq + 1;

  // Idempotent if the same encounter is already active.
  if (state.activeEncounter && state.activeEncounter.id === encounterId) {
    return {
      state: { ...state, seq },
      derived: [],
      log: [{ kind: 'info', text: `encounter ${encounterId} already active`, intentId: intent.id }],
    };
  }

  if (state.activeEncounter && state.activeEncounter.id !== encounterId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `cannot start ${encounterId}: ${state.activeEncounter.id} is already active`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'encounter_active',
          message: `another encounter (${state.activeEncounter.id}) is already running`,
        },
      ],
    };
  }

  return {
    state: {
      ...state,
      seq,
      activeEncounter: {
        id: encounterId,
        participants: [],
        currentRound: null,
        turnOrder: [],
        activeParticipantId: null,
        turnState: {},
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `encounter ${encounterId} started`, intentId: intent.id }],
  };
}
