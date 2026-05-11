import { type Participant, SpendResourcePayloadSchema } from '@ironyard/shared';
import { refLabel, resolveResource, updateExtra, updateHeroic } from '../resources';
import type { IntentResult, SessionState, StampedIntent } from '../types';

// Slice 7: pay a positive cost from a heroic / extras pool. The floor-breach
// check is the load-bearing edge case: Talent's Clarity has a negative floor
// (`-(1 + Reason)`), so legal Clarity spends go below 0; every other resource
// floors at 0 so the same check rejects negative balances (canon §5.3 / §5.4).
export function applySpendResource(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = SpendResourcePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SpendResource rejected: ${parsed.error.message}`,
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

  const { participantId, name, amount, reason } = parsed.data;
  const target = state.activeEncounter.participants.find((p) => p.id === participantId);
  if (!target) {
    return {
      state,
      derived: [],
      log: [{ kind: 'error', text: `target ${participantId} not found`, intentId: intent.id }],
      errors: [{ code: 'target_missing', message: `${participantId} not in encounter` }],
    };
  }

  const resolved = resolveResource(target, name);
  const label = refLabel(name);
  if (!resolved) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `${target.name} has no ${label} pool; initialize via SetResource first`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'resource_missing', message: `${label} not allocated on ${participantId}` }],
    };
  }

  const next = resolved.instance.value - amount;
  if (next < resolved.instance.floor) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SpendResource rejected: ${target.name} cannot spend ${amount} ${label} (floor ${resolved.instance.floor})`,
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'floor_breach',
          message: `${next} < floor ${resolved.instance.floor}`,
        },
      ],
    };
  }

  const updatedInstance = { ...resolved.instance, value: next };
  let updatedTarget: Participant;
  if (resolved.kind === 'heroic') {
    updatedTarget = updateHeroic(target, resolved.index, {
      ...updatedInstance,
      name: resolved.instance.name,
    });
  } else {
    updatedTarget = updateExtra(target, resolved.index, {
      ...updatedInstance,
      name: resolved.instance.name,
    });
  }
  const updatedParticipants = state.activeEncounter.participants.map((p) =>
    p.id === participantId ? updatedTarget : p,
  );

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: { ...state.activeEncounter, participants: updatedParticipants },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `${target.name} spends ${amount} ${label}${reason ? ` (${reason})` : ''} (${resolved.instance.value} → ${next})`,
        intentId: intent.id,
      },
    ],
  };
}
