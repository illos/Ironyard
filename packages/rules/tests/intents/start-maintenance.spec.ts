import { describe, expect, it } from 'vitest';
import { applyStartMaintenance } from '../../src/intents/start-maintenance';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Pass 3 Slice 2a Task 18 — direct unit tests for the StartMaintenance reducer.
// Validates the three accept/reject branches: append, not-elementalist,
// already-maintained idempotent guard.

const PC_ID = 'pc:ele-1';

function stateWith(participants: ReturnType<typeof makeHeroParticipant>[], currentRound = 1) {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1', { currentRound }),
  });
}

describe('applyStartMaintenance', () => {
  it('appends to maintainedAbilities for an Elementalist (using current round)', () => {
    const ele = makeHeroParticipant(PC_ID, { className: 'Elementalist' });
    const state = stateWith([ele], 2);
    const startSeq = state.seq;
    const result = applyStartMaintenance(
      state,
      stamped({
        type: 'StartMaintenance',
        actor: ownerActor,
        payload: { participantId: PC_ID, abilityId: 'storm-aegis', costPerTurn: 2 },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
    expect(result.state.seq).toBe(startSeq + 1);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.maintainedAbilities).toHaveLength(1);
    expect(updated.maintainedAbilities[0]!.abilityId).toBe('storm-aegis');
    expect(updated.maintainedAbilities[0]!.costPerTurn).toBe(2);
    expect(updated.maintainedAbilities[0]!.startedAtRound).toBe(2);
    expect(result.log[0]?.kind).toBe('info');
  });

  it('rejects when participant is not Elementalist', () => {
    const fury = makeHeroParticipant('pc:fury-1', { className: 'Fury' });
    const state = stateWith([fury], 1);
    const result = applyStartMaintenance(
      state,
      stamped({
        type: 'StartMaintenance',
        actor: ownerActor,
        payload: { participantId: 'pc:fury-1', abilityId: 'storm-aegis', costPerTurn: 2 },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_elementalist');
    expect(result.state.seq).toBe(state.seq);
    const unchanged = result.state.participants.find((p) => p.id === 'pc:fury-1')!;
    expect(unchanged.maintainedAbilities).toEqual([]);
  });

  it('rejects when ability is already being maintained (idempotent guard)', () => {
    const ele = makeHeroParticipant(PC_ID, {
      className: 'Elementalist',
      maintainedAbilities: [{ abilityId: 'storm-aegis', costPerTurn: 2, startedAtRound: 1 }],
    });
    const state = stateWith([ele], 2);
    const result = applyStartMaintenance(
      state,
      stamped({
        type: 'StartMaintenance',
        actor: ownerActor,
        payload: { participantId: PC_ID, abilityId: 'storm-aegis', costPerTurn: 2 },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('already_maintained');
    expect(result.state.seq).toBe(state.seq);
    const unchanged = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(unchanged.maintainedAbilities).toHaveLength(1);
  });
});
