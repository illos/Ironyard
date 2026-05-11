import { BringCharacterIntoEncounterPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, PcPlaceholder, StampedIntent } from '../types';

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

  const payload = parsed.data;

  // Authority check: active director only.
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'BringCharacterIntoEncounter requires active director',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'permission_denied', message: 'active director only' }],
    };
  }

  // Reject if a placeholder for this character is already in the roster.
  const exists = state.participants.some(
    (p) => p.kind === 'pc-placeholder' && p.characterId === payload.characterId,
  );
  if (exists) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `character ${payload.characterId} is already in the lobby roster`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'already_in_roster', message: 'character already in lobby' }],
    };
  }

  const placeholder: PcPlaceholder = {
    kind: 'pc-placeholder',
    characterId: payload.characterId,
    ownerId: payload.ownerId,
    position: payload.position ?? state.participants.length,
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: [...state.participants, placeholder],
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `character ${payload.characterId} added to lobby roster (placeholder)`,
        intentId: intent.id,
      },
    ],
  };
}
