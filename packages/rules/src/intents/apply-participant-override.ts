import { ApplyParticipantOverridePayloadSchema, IntentTypes } from '@ironyard/shared';
import { recomputeStaminaState } from '../stamina';
import type { CampaignState, DerivedIntent, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

export function applyApplyParticipantOverride(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = ApplyParticipantOverridePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ApplyParticipantOverride rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  // Director-only.
  if (intent.actor.userId !== state.activeDirectorId) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'ApplyParticipantOverride rejected: director only',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_authorized', message: 'director only' }],
    };
  }

  const { participantId, override } = parsed.data;
  const target = state.participants.filter(isParticipant).find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ApplyParticipantOverride rejected: participant ${participantId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'target_missing', message: `participant ${participantId} not found` }],
    };
  }

  const prevState = target.staminaState;
  const intermediate = { ...target, staminaOverride: override };
  const { newState } = recomputeStaminaState(intermediate);
  const updated = { ...intermediate, staminaState: newState };

  const derived: DerivedIntent[] = [];
  if (newState !== prevState) {
    derived.push({
      actor: intent.actor,
      source: 'server' as const,
      type: IntentTypes.StaminaTransitioned,
      causedBy: intent.id,
      payload: {
        participantId,
        from: prevState,
        to: newState,
        cause: 'override-applied',
      },
    });
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === participantId ? updated : p,
      ),
    },
    derived,
    log: [
      {
        kind: 'info',
        text: `${target.name}: ${override.kind} override applied (${override.source})`,
        intentId: intent.id,
      },
    ],
  };
}
