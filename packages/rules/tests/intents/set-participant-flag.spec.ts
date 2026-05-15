import { describe, expect, it } from 'vitest';
import {
  applySetParticipantPerEncounterLatch,
  applySetParticipantPosthumousDramaEligible,
} from '../../src/intents/set-participant-flag';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Pass 3 Slice 2a — direct unit tests for the two slice-2a server-only reducers.
// These are exercised transitively by the class-trigger registry tests, but the
// field-write / rejection edge cases need direct coverage so a future refactor
// can't silently regress them.

const PC_ID = 'pc:hero-1';
const MONSTER_ID = 'mon:goblin-1';

function stateWithParticipant(...participants: ReturnType<typeof makeHeroParticipant>[]) {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

describe('applySetParticipantPerEncounterLatch', () => {
  it('writes the per-encounter latch field on the target PC and bumps seq', () => {
    const hero = makeHeroParticipant(PC_ID, { className: 'Fury' });
    const state = stateWithParticipant(hero);
    const startSeq = state.seq;
    const result = applySetParticipantPerEncounterLatch(
      state,
      stamped({
        type: 'SetParticipantPerEncounterLatch',
        actor: ownerActor,
        payload: {
          participantId: PC_ID,
          key: 'firstTimeWindedTriggered',
          value: true,
        },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
    expect(result.log).toEqual([]);
    expect(result.state.seq).toBe(startSeq + 1);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    if (updated.kind !== 'pc') throw new Error('expected pc kind');
    expect(updated.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(true);
    // Other latches in the same group remain untouched.
    expect(updated.perEncounterFlags.perEncounter.firstTimeDyingTriggered).toBe(false);
    expect(updated.perEncounterFlags.perEncounter.troubadourAnyHeroWindedTriggered).toBe(false);
  });

  it('returns invalid_payload error when payload is missing required fields', () => {
    const hero = makeHeroParticipant(PC_ID);
    const state = stateWithParticipant(hero);
    const result = applySetParticipantPerEncounterLatch(
      state,
      stamped({
        type: 'SetParticipantPerEncounterLatch',
        actor: ownerActor,
        // missing `key`
        payload: { participantId: PC_ID, value: true },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
    expect(result.derived).toEqual([]);
    // State unchanged.
    expect(result.state.seq).toBe(state.seq);
    expect(result.state).toBe(state);
    expect(result.log[0]?.kind).toBe('error');
  });

  it('returns target_missing error when participant does not exist', () => {
    const hero = makeHeroParticipant(PC_ID);
    const state = stateWithParticipant(hero);
    const result = applySetParticipantPerEncounterLatch(
      state,
      stamped({
        type: 'SetParticipantPerEncounterLatch',
        actor: ownerActor,
        payload: {
          participantId: 'pc:does-not-exist',
          key: 'firstTimeWindedTriggered',
          value: true,
        },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('target_missing');
    expect(result.state.seq).toBe(state.seq);
    expect(result.log[0]?.kind).toBe('error');
  });

  it('rejects with target_missing when participant is a monster (PC-only field)', () => {
    const monster = makeMonsterParticipant(MONSTER_ID);
    const state = stateWithParticipant(monster);
    const result = applySetParticipantPerEncounterLatch(
      state,
      stamped({
        type: 'SetParticipantPerEncounterLatch',
        actor: ownerActor,
        payload: {
          participantId: MONSTER_ID,
          key: 'firstTimeWindedTriggered',
          value: true,
        },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('target_missing');
    expect(result.state.seq).toBe(state.seq);
    // Monster's flags untouched (defensive — should be no-op anyway).
    const m = result.state.participants.find((p) => p.id === MONSTER_ID)!;
    expect(m.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(false);
  });
});

describe('applySetParticipantPosthumousDramaEligible', () => {
  it('writes the posthumousDramaEligible field on the target PC and bumps seq', () => {
    const hero = makeHeroParticipant(PC_ID, { className: 'Troubadour' });
    const state = stateWithParticipant(hero);
    const startSeq = state.seq;
    const result = applySetParticipantPosthumousDramaEligible(
      state,
      stamped({
        type: 'SetParticipantPosthumousDramaEligible',
        actor: ownerActor,
        payload: { participantId: PC_ID, value: true },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
    expect(result.log).toEqual([]);
    expect(result.state.seq).toBe(startSeq + 1);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.posthumousDramaEligible).toBe(true);
  });

  it('returns invalid_payload error when payload is missing required fields', () => {
    const hero = makeHeroParticipant(PC_ID);
    const state = stateWithParticipant(hero);
    const result = applySetParticipantPosthumousDramaEligible(
      state,
      stamped({
        type: 'SetParticipantPosthumousDramaEligible',
        actor: ownerActor,
        // missing `value`
        payload: { participantId: PC_ID },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
    expect(result.derived).toEqual([]);
    expect(result.state.seq).toBe(state.seq);
    expect(result.state).toBe(state);
    expect(result.log[0]?.kind).toBe('error');
  });

  it('returns target_missing error when participant does not exist', () => {
    const hero = makeHeroParticipant(PC_ID);
    const state = stateWithParticipant(hero);
    const result = applySetParticipantPosthumousDramaEligible(
      state,
      stamped({
        type: 'SetParticipantPosthumousDramaEligible',
        actor: ownerActor,
        payload: { participantId: 'pc:does-not-exist', value: true },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('target_missing');
    expect(result.state.seq).toBe(state.seq);
    expect(result.log[0]?.kind).toBe('error');
  });

  it('rejects with target_missing when participant is a monster (PC-only field)', () => {
    const monster = makeMonsterParticipant(MONSTER_ID);
    const state = stateWithParticipant(monster);
    const result = applySetParticipantPosthumousDramaEligible(
      state,
      stamped({
        type: 'SetParticipantPosthumousDramaEligible',
        actor: ownerActor,
        payload: { participantId: MONSTER_ID, value: true },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('target_missing');
    expect(result.state.seq).toBe(state.seq);
    // Monster's field untouched.
    const m = result.state.participants.find((p) => p.id === MONSTER_ID)!;
    expect(m.posthumousDramaEligible).toBe(false);
  });
});
