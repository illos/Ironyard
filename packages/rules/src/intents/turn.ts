import {
  EndRoundPayloadSchema,
  EndTurnPayloadSchema,
  SetInitiativePayloadSchema,
  StartRoundPayloadSchema,
  StartTurnPayloadSchema,
} from '@ironyard/shared';
import type { ActiveEncounter, IntentResult, SessionState, StampedIntent } from '../types';

// Shared guard — every turn intent requires an active encounter.
function requireEncounter(
  state: SessionState,
  intent: StampedIntent,
  label: string,
): { ok: true; encounter: ActiveEncounter } | { ok: false; result: IntentResult } {
  if (!state.activeEncounter) {
    return {
      ok: false,
      result: {
        state,
        derived: [],
        log: [{ kind: 'error', text: `${label}: no active encounter`, intentId: intent.id }],
        errors: [{ code: 'no_active_encounter', message: 'no active encounter' }],
      },
    };
  }
  return { ok: true, encounter: state.activeEncounter };
}

export function applyStartRound(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = StartRoundPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `StartRound rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'StartRound');
  if (!guard.ok) return guard.result;

  const round = (guard.encounter.currentRound ?? 0) + 1;
  const firstId = guard.encounter.turnOrder[0] ?? null;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: {
        ...guard.encounter,
        currentRound: round,
        activeParticipantId: firstId,
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `round ${round} starts`, intentId: intent.id }],
  };
}

export function applyEndRound(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = EndRoundPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `EndRound rejected: ${parsed.error.message}`, intentId: intent.id },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'EndRound');
  if (!guard.ok) return guard.result;

  if (guard.encounter.currentRound === null) {
    return {
      state: { ...state, seq: state.seq + 1 },
      derived: [],
      log: [{ kind: 'info', text: 'no round in progress', intentId: intent.id }],
    };
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: {
        ...guard.encounter,
        activeParticipantId: null,
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: `round ${guard.encounter.currentRound} ends`,
        intentId: intent.id,
      },
    ],
  };
}

export function applyStartTurn(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = StartTurnPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `StartTurn rejected: ${parsed.error.message}`, intentId: intent.id },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'StartTurn');
  if (!guard.ok) return guard.result;

  const { participantId } = parsed.data;
  if (!guard.encounter.participants.some((p) => p.id === participantId)) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `participant ${participantId} not in encounter`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'participant_missing', message: `${participantId} not in encounter` }],
    };
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: {
        ...guard.encounter,
        activeParticipantId: participantId,
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `${participantId} starts their turn`, intentId: intent.id }],
  };
}

export function applyEndTurn(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = EndTurnPayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        { kind: 'error', text: `EndTurn rejected: ${parsed.error.message}`, intentId: intent.id },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'EndTurn');
  if (!guard.ok) return guard.result;

  const order = guard.encounter.turnOrder;
  const currentId = guard.encounter.activeParticipantId;
  const currentIdx = currentId === null ? -1 : order.indexOf(currentId);
  // Falling off the end (or off a stale id) parks at null; explicit StartRound
  // or EndRound moves the lifecycle on from there.
  const nextId =
    currentIdx >= 0 && currentIdx + 1 < order.length ? (order[currentIdx + 1] ?? null) : null;

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: {
        ...guard.encounter,
        activeParticipantId: nextId,
      },
    },
    derived: [],
    log: [
      {
        kind: 'info',
        text: nextId
          ? `${currentId ?? 'no one'} ends turn, ${nextId} is up`
          : `${currentId ?? 'no one'} ends turn; round end pending`,
        intentId: intent.id,
      },
    ],
  };
}

export function applySetInitiative(state: SessionState, intent: StampedIntent): IntentResult {
  const parsed = SetInitiativePayloadSchema.safeParse(intent.payload);
  if (!parsed.success) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: `SetInitiative rejected: ${parsed.error.message}`,
          intentId: intent.id,
        },
      ],
      errors: [{ code: 'invalid_payload', message: parsed.error.message }],
    };
  }
  const guard = requireEncounter(state, intent, 'SetInitiative');
  if (!guard.ok) return guard.result;

  const { order } = parsed.data;
  const participantIds = new Set(guard.encounter.participants.map((p) => p.id));
  const proposedIds = new Set(order);

  if (order.length !== participantIds.size || proposedIds.size !== order.length) {
    return {
      state,
      derived: [],
      log: [
        {
          kind: 'error',
          text: 'SetInitiative: order must list each participant exactly once',
          intentId: intent.id,
        },
      ],
      errors: [
        {
          code: 'invalid_order',
          message: 'order must contain each participant id exactly once',
        },
      ],
    };
  }
  for (const id of order) {
    if (!participantIds.has(id)) {
      return {
        state,
        derived: [],
        log: [
          {
            kind: 'error',
            text: `SetInitiative: ${id} is not a participant`,
            intentId: intent.id,
          },
        ],
        errors: [{ code: 'invalid_order', message: `unknown participant id ${id}` }],
      };
    }
  }

  return {
    state: {
      ...state,
      seq: state.seq + 1,
      activeEncounter: {
        ...guard.encounter,
        turnOrder: [...order],
      },
    },
    derived: [],
    log: [{ kind: 'info', text: `initiative set: ${order.join(' → ')}`, intentId: intent.id }],
  };
}
