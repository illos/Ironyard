import {
  type ConditionInstance,
  type Participant,
  SetConditionPayloadSchema,
} from '@ironyard/shared';
import { evaluateOnConditionApplied } from '../ancestry-triggers';
import { isImmuneToCondition } from '../effective';
import type { CampaignState, IntentResult, StampedIntent } from '../types';
import { isParticipant } from '../types';

// Conditions whose canonical text says a new imposition from a *different*
// source replaces the old one (rules-canon.md §3.4: Frightened — Classes.md:458;
// Taunted — Classes.md:490). Same-source impositions remain idempotent.
const REPLACE_ON_DIFFERENT_SOURCE = new Set<string>(['Frightened', 'Taunted']);

export function applySetCondition(state: CampaignState, intent: StampedIntent): IntentResult {
  const parsed = SetConditionPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetCondition rejected: ${parsed.error.message}`,
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

  const { targetId, condition, source, duration } = parsed.data;
  const participants = state.participants.filter(isParticipant);
  const target = participants.find((p) => p.id === targetId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${targetId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `target ${targetId} not in encounter` }],
    };
  }

  // Phase 2b slice 2: gate by typed condition-immunity (Bloodless, Great
  // Fortitude, Polder Fearless, Orc/Memonek Nonstop, High Elf Unstoppable
  // Mind, etc.). conditionImmunities is snapshotted to the participant at
  // StartEncounter from CharacterRuntime; the log captures the attempted
  // imposition so the director sees why nothing landed.
  if (isImmuneToCondition(target, condition)) {
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `${target.name} is immune to ${condition} (no-op)`,
          intentId: intent.id,
        },
      ],
    };
  }

  const existing = target.conditions;

  // Same {type, sourceId} → no-op (still bump seq so the intent is in the log).
  const sameSource = existing.find((c) => c.type === condition && c.source.id === source.id);
  if (sameSource) {
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `${target.name} already has ${condition} from ${source.id} (idempotent)`,
          intentId: intent.id,
        },
      ],
    };
  }

  const seq = state.seq + 1;
  const newInstance: ConditionInstance = {
    type: condition,
    source,
    duration,
    appliedAtSeq: seq,
    removable: true,
  };

  // Frightened / Taunted: drop older instances of the same type from any
  // *different* source, then append the new one. Other condition types may
  // coexist from multiple sources (per-source duration tracking, binary effect
  // per Q8).
  let nextConditions: ConditionInstance[];
  if (REPLACE_ON_DIFFERENT_SOURCE.has(condition)) {
    nextConditions = [
      ...existing.filter((c) => !(c.type === condition && c.source.id !== source.id)),
      newInstance,
    ];
  } else {
    nextConditions = [...existing, newInstance];
  }

  const updatedTarget: Participant = { ...target, conditions: nextConditions };
  const updatedParticipants = state.participants.map((p) =>
    isParticipant(p) && p.id === targetId ? updatedTarget : p,
  );

  // Phase 2b Group A+B (slice 6) — dispatch ancestry-triggers on the
  // post-push state so Wings can see the new Prone and emit EndFlying.
  const postPushState: CampaignState = { ...state, participants: updatedParticipants };
  const ancestryDerived = evaluateOnConditionApplied(
    postPushState,
    { participantId: targetId, condition },
    { actor: intent.actor },
  ).map((d) => ({ ...d, causedBy: intent.id }));

  return {
    state: {
      ...state,
      seq,
      participants: updatedParticipants,
    },
    derived: ancestryDerived,
    log: [
      {
        kind: 'info',
        text: `${target.name} is ${condition} (from ${source.kind} ${source.id})`,
        intentId: intent.id,
      },
    ],
  };
}
