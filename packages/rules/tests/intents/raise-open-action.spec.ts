import { describe, expect, it } from 'vitest';
import { applyRaiseOpenAction } from '../../src/intents/raise-open-action';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

const PC_ID = 'pc:alice';

function baseStateWithEncounter() {
  const hero = makeHeroParticipant(PC_ID);
  return baseState({
    currentSessionId: 'sess-1',
    participants: [hero],
    encounter: makeRunningEncounterPhase('enc-1', { turnOrder: [PC_ID] }),
  });
}

describe('applyRaiseOpenAction', () => {
  it('appends a new OpenAction with a ulid id', () => {
    const s = baseStateWithEncounter();
    const intent = stamped({
      type: 'RaiseOpenAction',
      actor: ownerActor,
      payload: {
        kind: '__sentinel_2b_0__',
        participantId: 'pc-1',
        expiresAtRound: 2,
        payload: { foo: 'bar' },
      },
    });
    const result = applyRaiseOpenAction(s, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.state.openActions).toHaveLength(1);
    const oa = result.state.openActions[0]!;
    expect(oa.id).toMatch(/^oa_/);
    expect(oa.kind).toBe('__sentinel_2b_0__');
    expect(oa.participantId).toBe('pc-1');
    expect(oa.raisedAtRound).toBe(s.encounter!.currentRound);
    expect(oa.raisedByIntentId).toBe(intent.id);
    expect(oa.expiresAtRound).toBe(2);
    expect(oa.payload).toEqual({ foo: 'bar' });
  });

  it('rejects a malformed payload', () => {
    const s = baseStateWithEncounter();
    const intent = stamped({
      type: 'RaiseOpenAction',
      actor: ownerActor,
      payload: { kind: 'unknown', participantId: '', payload: {} },
    });
    const result = applyRaiseOpenAction(s, intent);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('invalid_payload');
    expect(result.state.openActions).toHaveLength(0);
  });

  it('rejects when there is no active encounter', () => {
    const s = { ...baseStateWithEncounter(), encounter: null };
    const intent = stamped({
      type: 'RaiseOpenAction',
      actor: ownerActor,
      payload: {
        kind: '__sentinel_2b_0__',
        participantId: 'pc-1',
        expiresAtRound: null,
        payload: {},
      },
    });
    const result = applyRaiseOpenAction(s, intent);
    expect(result.errors![0]!.code).toBe('no_active_encounter');
  });
});
