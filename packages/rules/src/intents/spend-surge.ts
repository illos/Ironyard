import { SpendSurgePayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

// Slice 7: decrement the universal surges pool by N (canon §5.6). Class-
// specific spend consequences (extra damage, potency boost) wire in slice 8
// when the ability surface lands. This intent just records the spend so the
// log + undo is complete.
export function applySpendSurge(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SpendSurgePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SpendSurge rejected: ${parsed.error.message}`,
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

  const { participantId, count } = parsed.data;
  const target = state.encounter.participants.find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${participantId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `${participantId} not in encounter` }],
    };
  }

  if (target.surges < count) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SpendSurge rejected: ${target.name} has ${target.surges} surges (asked ${count})`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'insufficient_surges',
          message: `${target.surges} surges available; cannot spend ${count}`,
        },
      ],
    };
  }

  const updatedTarget = { ...target, surges: target.surges - count };
  const updatedParticipants = state.encounter.participants.map((p) =>
    p.id === participantId ? updatedTarget : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      encounter: { ...state.encounter, participants: updatedParticipants },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} spends ${count} surge${count === 1 ? '' : 's'} (${target.surges} → ${updatedTarget.surges})`,
        intentId: intent.id,
      },
    ],
  };
}
