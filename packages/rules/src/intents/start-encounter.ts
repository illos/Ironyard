import { StartEncounterPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyStartEncounter(state: CampaignState, intent: StampedIntent): IntentResult {
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
  if (state.encounter && state.encounter.id === encounterId) {
    return {
      state: { ...state, seq },
      derived: [],
      log: [{ kind: 'info', text: `encounter ${encounterId} already active`, intentId: intent.id }],
    };
  }

  if (state.encounter && state.encounter.id !== encounterId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `cannot start ${encounterId}: ${state.encounter.id} is already active`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'encounter_active',
          message: `another encounter (${state.encounter.id}) is already running`,
        },
      ],
    };
  }

  return {
    state: {
      ...state,
      seq,
      encounter: {
        id: encounterId,
        participants: [],
        currentRound: null,
        turnOrder: [],
        activeParticipantId: null,
        turnState: {},
        // Slice 7: Director's Malice starts at 0 with no Malicious Strike
        // history (canon §5.5). Per-round generation is dispatcher-driven.
        malice: { current: 0, lastMaliciousStrikeRound: null },
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `encounter ${encounterId} started`, intentId: intent.id }],
  };
}
