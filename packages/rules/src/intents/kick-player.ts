import { KickPlayerPayloadSchema } from '@ironyard/shared';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';

export function applyKickPlayer(state: CampaignState, intent: StampedIntent): IntentResult {
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'KickPlayer requires active director', intentId: intent.id }],
      errors: [
        { code: 'not_active_director', message: 'only the active director may kick players' },
      ],
    };
  }

  const parsed = KickPlayerPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `KickPlayer rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { userId, participantIdsToRemove, placeholderCharacterIdsToRemove } = parsed.data;

  // Cannot kick the campaign owner.
  if (userId === state.ownerId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'KickPlayer rejected: cannot kick the campaign owner',
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'cannot_kick_owner',
          message: 'cannot kick the campaign owner from their own campaign',
        },
      ],
    };
  }

  // Emit derived RemoveParticipant intents for each of the kicked user's full
  // Participants currently on the roster. The DO stamped the list onto the
  // payload by looking up campaign_characters rows owned by that user.
  const derived: DerivedIntent[] = participantIdsToRemove.map((participantId) => ({
    type: 'RemoveParticipant',
    campaignId: state.campaignId,
    actor: intent.actor,
    source: intent.source,
    causedBy: intent.id,
    payload: { participantId },
  }));

  // Directly evict any pc-placeholder entries owned by the kicked user.
  // Placeholders (kind === 'pc-placeholder') are not full Participants — they
  // have no `id` field and cannot be matched by RemoveParticipant. The stamper
  // collected their characterIds; we drop them from state here.
  const placeholderCharIdsSet = new Set(placeholderCharacterIdsToRemove);
  const newParticipants = placeholderCharIdsSet.size > 0
    ? state.participants.filter(
        (p) => !(p.kind === 'pc-placeholder' && placeholderCharIdsSet.has(p.characterId)),
      )
    : state.participants;

  const removedCount = participantIdsToRemove.length + (state.participants.length - newParticipants.length);

  return {
    state: { ...state, seq: state.seq + 1, participants: newParticipants },
    derived,
    log: [
      {
        kind: 'info',
        text: `player ${userId} kicked${removedCount ? `; removing ${removedCount} roster entry(ies)` : ''}`,
        intentId: intent.id,
      },
    ],
  };
}
