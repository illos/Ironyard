import { SubmitCharacterPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Side-effect intent: the reducer validates and logs; D1 write happens in the DO.
// state.participants is not touched — characters become participants only when
// the director includes them in a StartEncounter payload.
export function applySubmitCharacter(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SubmitCharacterPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SubmitCharacter rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { characterId, ownsCharacter, isCampaignMember } = parsed.data;

  if (!ownsCharacter) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SubmitCharacter rejected: actor does not own character ${characterId}`,
          intentId: intent.id,
        },
      ],
      errors: [
        { code: 'not_character_owner', message: 'actor does not own the submitted character' },
      ],
    };
  }

  if (!isCampaignMember) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'SubmitCharacter rejected: actor is not a campaign member',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_campaign_member', message: 'actor is not a member of this campaign' }],
    };
  }

  return {
    state: { ...state, seq: state.seq + 1 },
    derived: [],
    log: [
      { kind: 'info', text: `character ${characterId} submitted for review`, intentId: intent.id },
    ],
  };
}
