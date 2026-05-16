import { SetTargetingRelationPayloadSchema } from '@ironyard/shared';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Pass 3 Slice 2b — set or unset a participant id in a source's
// targetingRelations[kind] list. Idempotent on both add and remove. Rejects
// self-target, missing source or target, and unauthorized actor.
//
// Trust: actor.userId === source.ownerId OR actor is the active director.
// Not server-only — players manage their own relations directly.
export function applySetTargetingRelation(
  state: CampaignState,
  intent: StampedIntent,
): IntentResult {
  const parsed = SetTargetingRelationPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetTargetingRelation rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  const { sourceId, relationKind, targetId, present } = parsed.data;

  if (sourceId === targetId) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: 'SetTargetingRelation rejected: self-targeting', intentId: intent.id },
      ],
      errors: [{ code: 'self_targeting', message: 'source and target must differ' }],
    };
  }

  const source = state.participants.filter(isParticipant).find((p) => p.id === sourceId);
  if (!source) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetTargetingRelation rejected: source ${sourceId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'source_missing', message: `${sourceId} not in roster` }],
    };
  }

  const target = state.participants.filter(isParticipant).find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetTargetingRelation rejected: target ${targetId} not found`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'target_missing', message: `${targetId} not in roster` }],
    };
  }

  // Trust: source owner OR active director.
  const isOwner = intent.actor.userId === source.ownerId;
  const isActiveDirector = intent.actor.userId === state.activeDirectorId;
  if (!isOwner && !isActiveDirector) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'SetTargetingRelation rejected: not source owner or active director',
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'not_authorized', message: 'must be source owner or active director' }],
    };
  }

  // Apply the add/remove. Idempotent: adding when present is a no-op; removing
  // when absent is a no-op.
  const currentArray = source.targetingRelations[relationKind];
  const alreadyPresent = currentArray.includes(targetId);
  let newArray = currentArray;
  if (present && !alreadyPresent) {
    newArray = [...currentArray, targetId];
  } else if (!present && alreadyPresent) {
    newArray = currentArray.filter((id) => id !== targetId);
  }
  if (newArray === currentArray) {
    // Idempotent no-op. Still bump seq so the intent appears in the log.
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `${source.name}.${relationKind} ${present ? 'add' : 'remove'} ${targetId} (idempotent)`,
          intentId: intent.id,
        },
      ],
    };
  }

  const updatedSource = {
    ...source,
    targetingRelations: {
      ...source.targetingRelations,
      [relationKind]: newArray,
    },
  };

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      participants: state.participants.map((p) =>
        isParticipant(p) && p.id === sourceId ? updatedSource : p,
      ),
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${source.name}.${relationKind} ${present ? '+' : '-'} ${target.name}`,
        intentId: intent.id,
      },
    ],
  };
}
