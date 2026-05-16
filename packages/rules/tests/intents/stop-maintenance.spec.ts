import { describe, expect, it } from 'vitest';
import { applyStopMaintenance } from '../../src/intents/stop-maintenance';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Pass 3 Slice 2a Task 19 — direct unit tests for the StopMaintenance reducer.
// Validates the two behavioral branches: remove-by-abilityId, and idempotent
// silent no-op when the ability wasn't being maintained.

const PC_ID = 'pc:ele-1';

function stateWith(participants: ReturnType<typeof makeHeroParticipant>[], currentRound = 1) {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1', { currentRound }),
  });
}

describe('applyStopMaintenance', () => {
  it('removes the maintainedAbilities entry by abilityId', () => {
    const ele = makeHeroParticipant(PC_ID, {
      className: 'Elementalist',
      maintainedAbilities: [
        { abilityId: 'storm-aegis', costPerTurn: 2, startedAtRound: 1, targetId: null },
        { abilityId: 'flame-shroud', costPerTurn: 1, startedAtRound: 1, targetId: null },
      ],
    });
    const state = stateWith([ele], 2);
    const startSeq = state.seq;
    const result = applyStopMaintenance(
      state,
      stamped({
        type: 'StopMaintenance',
        actor: ownerActor,
        payload: { participantId: PC_ID, abilityId: 'storm-aegis' },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
    expect(result.state.seq).toBe(startSeq + 1);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.maintainedAbilities).toHaveLength(1);
    expect(updated.maintainedAbilities[0]!.abilityId).toBe('flame-shroud');
    expect(result.log[0]?.kind).toBe('info');
  });

  it('is a silent no-op when the ability is not being maintained', () => {
    const ele = makeHeroParticipant(PC_ID, {
      className: 'Elementalist',
      maintainedAbilities: [{ abilityId: 'storm-aegis', costPerTurn: 2, startedAtRound: 1, targetId: null }],
    });
    const state = stateWith([ele], 2);
    const startSeq = state.seq;
    const result = applyStopMaintenance(
      state,
      stamped({
        type: 'StopMaintenance',
        actor: ownerActor,
        payload: { participantId: PC_ID, abilityId: 'not-maintained' },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
    expect(result.state).toBe(state);
    expect(result.state.seq).toBe(startSeq);
    expect(result.log).toEqual([]);
    const unchanged = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(unchanged.maintainedAbilities).toHaveLength(1);
    expect(unchanged.maintainedAbilities[0]!.abilityId).toBe('storm-aegis');
  });
});
