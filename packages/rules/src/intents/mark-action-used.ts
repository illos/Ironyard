import { MarkActionUsedPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyMarkActionUsed(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = MarkActionUsedPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkActionUsed rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { participantId, slot, used } = parsed.data;

  const target = state.participants.find((p) => isParticipant(p) && p.id === participantId);
  if (!target || !isParticipant(target)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkActionUsed: participant ${participantId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'participant_not_found', message: participantId }],
    };
  }

  // Role gate: actor must own the participant OR be the active director.
  const isOwner = target.ownerId !== null && target.ownerId === intent.actor.userId;
  const isActiveDirector = state.activeDirectorId === intent.actor.userId;
  if (!isOwner && !isActiveDirector) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `MarkActionUsed: forbidden — ${intent.actor.userId} cannot mark slot on ${participantId}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'forbidden', message: 'actor cannot mark this slot' }],
    };
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId
          ? { ...p, turnActionUsage: { ...p.turnActionUsage, [slot]: used } }
          : p,
      ),
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} ${used ? 'used' : 'cleared'} ${slot}`,
        intentId: intent.id,
      },
    ],
  };
}
