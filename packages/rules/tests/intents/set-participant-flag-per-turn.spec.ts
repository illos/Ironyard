import { describe, expect, it } from 'vitest';
import { applySetParticipantPerTurnEntry } from '../../src/intents/set-participant-flag';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Pass 3 Slice 2a — direct unit tests for applySetParticipantPerTurnEntry.
// Sibling to set-participant-flag-per-round.spec.ts. The per-turn entries are
// written when an action reducer needs to remember a fact about the active
// turn (e.g. damageDealtThisTurn, damageTakenThisTurn). Each entry is keyed by
// (scopedToTurnOf, key); the reducer dedupes on that pair so a second write
// replaces (not appends to) any existing entry sharing both.

const PC_ID = 'pc:hero-1';
const MONSTER_ID = 'mon:goblin-1';

function stateWith(...participants: ReturnType<typeof makeHeroParticipant>[]) {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

describe('applySetParticipantPerTurnEntry', () => {
  it('appends a new entry on the target PC and bumps seq', () => {
    const hero = makeHeroParticipant(PC_ID);
    const state = stateWith(hero);
    const startSeq = state.seq;
    const result = applySetParticipantPerTurnEntry(
      state,
      stamped({
        type: 'SetParticipantPerTurnEntry',
        actor: ownerActor,
        payload: {
          participantId: PC_ID,
          scopedToTurnOf: PC_ID,
          key: 'damageDealtThisTurn',
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
    expect(updated.perEncounterFlags.perTurn.entries).toEqual([
      { scopedToTurnOf: PC_ID, key: 'damageDealtThisTurn', value: true },
    ]);
    // Sibling flag groups untouched.
    expect(updated.perEncounterFlags.perRound.tookDamage).toBe(false);
    expect(updated.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(false);
  });

  it('returns invalid_payload error when payload is missing required fields', () => {
    const hero = makeHeroParticipant(PC_ID);
    const state = stateWith(hero);
    const result = applySetParticipantPerTurnEntry(
      state,
      stamped({
        type: 'SetParticipantPerTurnEntry',
        actor: ownerActor,
        // missing `scopedToTurnOf`
        payload: { participantId: PC_ID, key: 'damageDealtThisTurn', value: true },
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
    const state = stateWith(hero);
    const result = applySetParticipantPerTurnEntry(
      state,
      stamped({
        type: 'SetParticipantPerTurnEntry',
        actor: ownerActor,
        payload: {
          participantId: 'pc:does-not-exist',
          scopedToTurnOf: PC_ID,
          key: 'damageDealtThisTurn',
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
    const state = stateWith(monster);
    const result = applySetParticipantPerTurnEntry(
      state,
      stamped({
        type: 'SetParticipantPerTurnEntry',
        actor: ownerActor,
        payload: {
          participantId: MONSTER_ID,
          scopedToTurnOf: MONSTER_ID,
          key: 'damageDealtThisTurn',
          value: true,
        },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('target_missing');
    expect(result.state.seq).toBe(state.seq);
  });

  it('replaces an existing entry with the same (scopedToTurnOf, key) — dedup', () => {
    // Seed the hero with an existing entry for the same (scope, key).
    const hero = makeHeroParticipant(PC_ID, {
      perEncounterFlags: {
        perTurn: {
          entries: [
            { scopedToTurnOf: PC_ID, key: 'damageDealtThisTurn', value: false },
            // A different key under the same scope should survive untouched.
            { scopedToTurnOf: PC_ID, key: 'damageTakenThisTurn', value: true },
            // A different scope with the same key should also survive.
            { scopedToTurnOf: 'other-pc', key: 'damageDealtThisTurn', value: true },
          ],
        },
        perRound: {
          tookDamage: false,
          judgedTargetDamagedMe: false,
          damagedJudgedTarget: false,
          markedTargetDamagedByAnyone: false,
          dealtSurgeDamage: false,
          directorSpentMalice: false,
          creatureForceMoved: false,
          allyHeroicWithin10Triggered: false,
          nullFieldEnemyMainTriggered: false,
          elementalistDamageWithin10Triggered: false,
        },
        perEncounter: {
          firstTimeWindedTriggered: false,
          firstTimeDyingTriggered: false,
          troubadourThreeHeroesTriggered: false,
          troubadourAnyHeroWindedTriggered: false,
          troubadourReviveOARaised: false,
        },
      },
    });
    const state = stateWith(hero);
    const result = applySetParticipantPerTurnEntry(
      state,
      stamped({
        type: 'SetParticipantPerTurnEntry',
        actor: ownerActor,
        payload: {
          participantId: PC_ID,
          scopedToTurnOf: PC_ID,
          key: 'damageDealtThisTurn',
          value: true,
        },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    if (updated.kind !== 'pc') throw new Error('expected pc kind');
    const entries = updated.perEncounterFlags.perTurn.entries;
    // The (PC_ID, damageDealtThisTurn) entry was replaced; the other two survive.
    expect(entries).toHaveLength(3);
    expect(
      entries.find((e) => e.scopedToTurnOf === PC_ID && e.key === 'damageDealtThisTurn'),
    ).toEqual({ scopedToTurnOf: PC_ID, key: 'damageDealtThisTurn', value: true });
    expect(
      entries.find((e) => e.scopedToTurnOf === PC_ID && e.key === 'damageTakenThisTurn'),
    ).toEqual({ scopedToTurnOf: PC_ID, key: 'damageTakenThisTurn', value: true });
    expect(
      entries.find((e) => e.scopedToTurnOf === 'other-pc' && e.key === 'damageDealtThisTurn'),
    ).toEqual({ scopedToTurnOf: 'other-pc', key: 'damageDealtThisTurn', value: true });
  });
});
