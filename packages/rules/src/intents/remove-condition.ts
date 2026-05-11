import { type Participant, RemoveConditionPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';

export function applyRemoveCondition(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = RemoveConditionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RemoveCondition rejected: ${parsed.error.message}`,
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

  const { targetId, condition, sourceId } = parsed.data;
  const target = state.participants.find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${targetId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `target ${targetId} not in encounter` }],
    };
  }

  // Filter out matching instances; defensively preserve `removable: false`
  // entries (slice-6 dying-induced Bleeding). Slice 5 never sets that flag.
  const matches = (c: { type: string; source: { id: string }; removable: boolean }) => {
    if (!c.removable) return false;
    if (c.type !== condition) return false;
    if (sourceId !== undefined && c.source.id !== sourceId) return false;
    return true;
  };

  const nextConditions = target.conditions.filter((c) => !matches(c));
  const removed = target.conditions.length - nextConditions.length;

  const updatedTarget: Participant = { ...target, conditions: nextConditions };
  const updatedParticipants = state.participants.map((p) =>
    p.id === targetId ? updatedTarget : p,
  );

  const sourceFragment = sourceId !== undefined ? ` from ${sourceId}` : '';
  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: updatedParticipants,
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text:
          removed > 0
            ? `${target.name}: removed ${removed} ${condition} instance(s)${sourceFragment}`
            : `${target.name}: no ${condition} instances to remove${sourceFragment}`,
        intentId: intent.id,
      },
    ],
  };
}
