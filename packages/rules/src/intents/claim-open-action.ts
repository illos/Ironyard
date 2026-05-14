import { ClaimOpenActionPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyClaimOpenAction(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = ClaimOpenActionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ClaimOpenAction rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const oa = state.openActions.find((o) => o.id === parsed.data.openActionId);
  if (!oa) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ClaimOpenAction: ${parsed.data.openActionId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [
        { code: 'not_found', message: `openAction ${parsed.data.openActionId} not found` },
      ],
    };
  }

  // Authorization: targeted participant's owner OR active director.
  const target = state.participants.find(
    (p) => isParticipant(p) && p.id === oa.participantId,
  );
  const targetOwnerId = target && isParticipant(target) ? target.ownerId : null;
  const actorId = intent.actor.userId;
  const isOwner = targetOwnerId !== null && actorId === targetOwnerId;
  const isDirector = actorId === state.activeDirectorId;
  if (!isOwner && !isDirector) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ClaimOpenAction: ${actorId} not authorized for ${oa.id}`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'not_authorized',
          message: `actor ${actorId} is neither owner of ${oa.participantId} nor active director`,
        },
      ],
    };
  }

  // Remove the OA. Kind-specific resolvers (derived intents emitted here)
  // are registered in 2b.0.1; for now Claim just clears the entry.
  const nextOpenActions = state.openActions.filter((o) => o.id !== oa.id);

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      openActions: nextOpenActions,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `OpenAction ${oa.id} (${oa.kind}) claimed by ${actorId}`,
        intentId: intent.id,
      },
    ],
  };
}
