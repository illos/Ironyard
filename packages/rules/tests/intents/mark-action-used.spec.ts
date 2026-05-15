import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

describe('applyMarkActionUsed', () => {
  it('flips the named slot to true on the named participant (owner of the participant is the actor)', () => {
    const hero = makeHeroParticipant('pc-1', { ownerId: 'u-mira', name: 'Mira' });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-mira', role: 'player' },
        payload: { participantId: 'pc-1', slot: 'main', used: true },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.turnActionUsage).toEqual({ main: true, maneuver: false, move: false });
  });

  it('supports clearing (used: false) — used by the undo path', () => {
    const hero = makeHeroParticipant('pc-2', {
      ownerId: 'u-mira',
      name: 'Mira',
      turnActionUsage: { main: true, maneuver: true, move: false },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-mira', role: 'player' },
        payload: { participantId: 'pc-2', slot: 'main', used: false },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-2');
    expect(p?.turnActionUsage).toEqual({ main: false, maneuver: true, move: false });
  });

  it('rejects when actor is neither owner nor active director', () => {
    const hero = makeHeroParticipant('pc-3', { ownerId: 'u-mira', name: 'Mira' });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId, // owner-1 is director, not 'u-intruder'
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: { userId: 'u-intruder', role: 'player' },
        payload: { participantId: 'pc-3', slot: 'maneuver', used: true },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('forbidden');
  });

  it('rejects for a missing participant id', () => {
    const state = baseState({
      participants: [],
      encounter: makeRunningEncounterPhase('enc-1'),
      activeDirectorId: ownerActor.userId,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.MarkActionUsed,
        actor: ownerActor,
        payload: { participantId: 'no-such-participant', slot: 'move', used: true },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('participant_not_found');
  });
});
