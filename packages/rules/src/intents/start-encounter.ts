import { StartEncounterPayloadSchema, ulid } from '@ironyard/shared';
import type { CampaignState, EncounterPhase, IntentResult, StampedIntent } from '../types';

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

  if (state.encounter !== null) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `cannot start encounter: ${state.encounter.id} is already active`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'encounter_already_active',
          message: 'an encounter is already in progress',
        },
      ],
    };
  }

  // Use the client-suggested encounterId if provided (useful for optimistic
  // local state and integration tests that need to reference the encounter
  // by ID in follow-up intents like EndEncounter). The server-generated ulid()
  // is the fallback.
  const encounterId = parsed.data.encounterId ?? ulid();
  const encounter: EncounterPhase = {
    id: encounterId,
    currentRound: 1,
    turnOrder: state.participants.map((p) => p.id),
    activeParticipantId: null,
    turnState: {},
    // Slice 7: Director's Malice starts at 0 with no Malicious Strike
    // history (canon §5.5). Per-round generation is dispatcher-driven.
    malice: { current: 0, lastMaliciousStrikeRound: null },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `encounter ${encounterId} started with ${state.participants.length} participants`,
        intentId: intent.id,
      },
    ],
  };
}
