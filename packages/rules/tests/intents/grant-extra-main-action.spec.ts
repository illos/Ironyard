import { describe, expect, it } from 'vitest';
import { applyGrantExtraMainAction } from '../../src/intents/grant-extra-main-action';
import {
  OWNER_ID,
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

const PC_ID = 'pc:hero-1';

function stateWithHero(heroOverrides = {}) {
  const hero = makeHeroParticipant(PC_ID, { ownerId: OWNER_ID, ...heroOverrides });
  return baseState({
    participants: [hero],
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

function grantIntent(participantId: string = PC_ID) {
  return stamped({
    type: 'GrantExtraMainAction',
    actor: ownerActor,
    payload: { participantId },
  });
}

describe('applyGrantExtraMainAction', () => {
  it('resets turnActionUsage.main to false so actor can use a second main action', () => {
    // Simulate actor who already used their main action this turn.
    const s = stateWithHero({ turnActionUsage: { main: true, maneuver: false, move: false } });
    const result = applyGrantExtraMainAction(s, grantIntent());

    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.turnActionUsage.main).toBe(false);
  });

  it('still succeeds when turnActionUsage.main is already false', () => {
    const s = stateWithHero({ turnActionUsage: { main: false, maneuver: false, move: false } });
    const result = applyGrantExtraMainAction(s, grantIntent());

    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.turnActionUsage.main).toBe(false);
  });

  it('does not modify maneuver or move slots', () => {
    const s = stateWithHero({
      turnActionUsage: { main: true, maneuver: true, move: true },
    });
    const result = applyGrantExtraMainAction(s, grantIntent());

    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.turnActionUsage.maneuver).toBe(true);
    expect(updated.turnActionUsage.move).toBe(true);
  });

  it('increments seq', () => {
    const s = stateWithHero();
    const before = s.seq;
    const result = applyGrantExtraMainAction(s, grantIntent());
    expect(result.state.seq).toBe(before + 1);
  });

  it('emits an info log entry naming the participant', () => {
    const s = stateWithHero();
    const result = applyGrantExtraMainAction(s, grantIntent());

    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('info');
    expect(result.log[0]?.text).toMatch(/extra main action/i);
  });

  it('returns target_missing error when participantId not in state', () => {
    const s = stateWithHero();
    const result = applyGrantExtraMainAction(s, grantIntent('nonexistent'));

    expect(result.errors?.[0]?.code).toBe('target_missing');
    expect(result.state.seq).toBe(s.seq); // state unchanged
  });

  it('returns invalid_payload error for malformed payload', () => {
    const s = stateWithHero();
    const intent = stamped({
      type: 'GrantExtraMainAction',
      actor: ownerActor,
      payload: { badField: 123 },
    });
    const result = applyGrantExtraMainAction(s, intent);
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });

  it('does not emit derived intents', () => {
    const s = stateWithHero();
    const result = applyGrantExtraMainAction(s, grantIntent());
    expect(result.derived).toHaveLength(0);
  });
});
