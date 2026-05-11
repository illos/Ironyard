import { type Participant, RollResistancePayloadSchema } from '@ironyard/shared';
import type { IntentResult, SessionState, StampedIntent } from '../types';

// Saving throw: 1d10, >= 6 ends the matching `save_ends` condition
// (rules-canon.md §3.3, Q9). NOT a power roll. Slice 5 fires only on explicit
// dispatch; slice 6 auto-fires this at end-of-turn for each save_ends instance.
const SAVE_THRESHOLD = 6;

export function applyRollResistance(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = RollResistancePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `RollResistance rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }

  if (!state.activeEncounter) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: 'no active encounter', intentId: intent.id }],
      errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
    };
  }

  const { characterId, effectId, rolls } = parsed.data;
  const target = state.activeEncounter.participants.find((p) => p.id === characterId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${characterId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `target ${characterId} not in encounter` }],
    };
  }

  // Find the matching save_ends instance from `effectId`. Multiple save_ends
  // instances could share an effectId in degenerate cases — slice 5 treats them
  // as a single set and removes all that match on a success.
  const matching = target.conditions.filter(
    (c) => c.duration.kind === 'save_ends' && c.source.id === effectId,
  );

  if (matching.length === 0) {
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `${target.name}: no matching save_ends condition for ${effectId} (d10=${rolls.d10})`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'no_matching_condition',
          message: `no save_ends condition on ${characterId} with source.id=${effectId}`,
        },
      ],
    };
  }

  if (rolls.d10 < SAVE_THRESHOLD) {
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [
        {
          kind: 'info',
          text: `${target.name} fails save vs ${effectId} (d10=${rolls.d10} < ${SAVE_THRESHOLD})`,
          intentId: intent.id,
        },
      ],
    };
  }

  // Success: remove every condition instance matching this effectId by
  // save_ends. Defensively preserve removable: false entries (slice-6 dying
  // Bleeding); slice 5 doesn't set that flag.
  const nextConditions = target.conditions.filter((c) => {
    if (!c.removable) return true;
    return !(c.duration.kind === 'save_ends' && c.source.id === effectId);
  });

  const updatedTarget: Participant = { ...target, conditions: nextConditions };
  const updatedParticipants = state.activeEncounter.participants.map((p) =>
    p.id === characterId ? updatedTarget : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: {
        ...state.activeEncounter,
        participants: updatedParticipants,
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} saves vs ${effectId} (d10=${rolls.d10} >= ${SAVE_THRESHOLD}); condition removed`,
        intentId: intent.id,
      },
    ],
  };
}
