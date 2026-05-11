import { BringCharacterIntoEncounterPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyBringCharacterIntoEncounter(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = BringCharacterIntoEncounterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `BringCharacterIntoEncounter rejected: ${parsed.error.message}`,
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
      log: [
        {
          kind: 'error',
          text: 'no active encounter to bring a character into',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const { participant } = parsed.data;
  if (state.encounter.participants.some((p) => p.id === participant.id)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `participant ${participant.id} already in encounter`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'duplicate_participant', message: `id ${participant.id} already present` }],
    };
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: {
        ...state.encounter,
        participants: [...state.encounter.participants, participant],
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${participant.name} brought into the encounter`,
        intentId: intent.id,
      },
    ],
  };
}
