import { ApplyDamagePayloadSchema } from '@ironyard/shared';
import { applyDamageStep } from '../damage';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyApplyDamage(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = ApplyDamagePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `ApplyDamage rejected: ${parsed.error.message}`,
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
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const { targetId, amount, damageType } = parsed.data;
  const target = state.encounter.participants.find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${targetId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `target ${targetId} not in encounter` }],
    };
  }

  const result = applyDamageStep(target, amount, damageType);
  const updatedParticipants = state.encounter.participants.map((p) =>
    p.id === targetId ? result.newParticipant : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: {
        ...state.encounter,
        participants: updatedParticipants,
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} takes ${result.delivered} ${damageType} damage (${result.before} → ${result.after})`,
        intentId: intent.id,
      },
    ],
  };
}
