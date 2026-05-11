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

  const { participant } = parsed.data;
  if (state.participants.some((p) => p.id === participant.id)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `participant ${participant.id} already in roster`,
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
      participants: [...state.participants, participant],
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
