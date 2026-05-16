import { describe, expect, it } from 'vitest';
import { applySetParticipantPerRoundFlag } from '../../src/intents/set-participant-flag';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Pass 3 Slice 2a — direct unit tests for applySetParticipantPerRoundFlag.
// Sister to set-participant-flag.spec.ts. The per-round flags are written
// when a class-δ action trigger fires (e.g. Fury Ferocity's tookDamage,
// Censor Wrath's damagedJudgedTarget) and reset at EndRound.

const PC_ID = 'pc:hero-1';
const MONSTER_ID = 'mon:goblin-1';

function stateWithParticipant(...participants: ReturnType<typeof makeHeroParticipant>[]) {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

describe('applySetParticipantPerRoundFlag', () => {
  it('writes the per-round flag on the target PC and bumps seq', () => {
    const hero = makeHeroParticipant(PC_ID, { className: 'Fury' });
    const state = stateWithParticipant(hero);
    const startSeq = state.seq;
    const result = applySetParticipantPerRoundFlag(
      state,
      stamped({
        type: 'SetParticipantPerRoundFlag',
        actor: ownerActor,
        payload: {
          participantId: PC_ID,
          key: 'tookDamage',
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
    expect(updated.perEncounterFlags.perRound.tookDamage).toBe(true);
    // Other per-round flags in the same group remain untouched.
    expect(updated.perEncounterFlags.perRound.judgedTargetDamagedMe).toBe(false);
    expect(updated.perEncounterFlags.perRound.damagedJudgedTarget).toBe(false);
    expect(updated.perEncounterFlags.perRound.creatureForceMoved).toBe(false);
    // Sister latch group unaffected.
    expect(updated.perEncounterFlags.perEncounter.firstTimeWindedTriggered).toBe(false);
  });

  it('returns invalid_payload error when payload is missing required fields', () => {
    const hero = makeHeroParticipant(PC_ID);
    const state = stateWithParticipant(hero);
    const result = applySetParticipantPerRoundFlag(
      state,
      stamped({
        type: 'SetParticipantPerRoundFlag',
        actor: ownerActor,
        // missing `key`
        payload: { participantId: PC_ID, value: true },
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
    const result = applySetParticipantPerRoundFlag(
      state,
      stamped({
        type: 'SetParticipantPerRoundFlag',
        actor: ownerActor,
        payload: {
          participantId: 'pc:does-not-exist',
          key: 'tookDamage',
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
    const result = applySetParticipantPerRoundFlag(
      state,
      stamped({
        type: 'SetParticipantPerRoundFlag',
        actor: ownerActor,
        payload: {
          participantId: MONSTER_ID,
          key: 'tookDamage',
          value: true,
        },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('target_missing');
    expect(result.state.seq).toBe(state.seq);
    // Monster's flags untouched (defensive — should be no-op anyway).
    const m = result.state.participants.find((p) => p.id === MONSTER_ID)!;
    expect(m.perEncounterFlags.perRound.tookDamage).toBe(false);
  });
});
