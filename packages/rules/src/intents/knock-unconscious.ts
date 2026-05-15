import { IntentTypes, KnockUnconsciousPayloadSchema } from '@ironyard/shared';
import { applyKnockOut } from '../stamina';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyKnockUnconscious(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = KnockUnconsciousPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `KnockUnconscious rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { targetId, attackerId } = parsed.data;
  const participants = state.participants.filter(isParticipant);

  const target = participants.find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `KnockUnconscious rejected: target ${targetId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'target_missing', message: `target ${targetId} not found` }],
    };
  }

  // Trust: active director OR the attacker's owner.
  const attacker = attackerId ? (participants.find((p) => p.id === attackerId) ?? null) : null;
  const isDirector = intent.actor.userId === state.activeDirectorId;
  const isAttackerOwner = attacker !== null && intent.actor.userId === attacker.ownerId;
  if (!isDirector && !isAttackerOwner) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'KnockUnconscious rejected: only director or attacker owner',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_authorized', message: 'only director or attacker owner' }],
    };
  }

  const prevState = target.staminaState;
  const updated = applyKnockOut(target);

  const derived: DerivedIntent[] = [
    {
      actor: intent.actor,
      source: 'server' as const,
      type: IntentTypes.StaminaTransitioned,
      causedBy: intent.id,
      payload: {
        participantId: targetId,
        from: prevState,
        to: 'unconscious',
        cause: 'damage',
      },
    },
  ];

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === targetId ? updated : p,
      ),
    },
    derived,
    log: [{ kind: 'info', text: `${target.name} is knocked unconscious`, intentId: intent.id }],
  };
}
