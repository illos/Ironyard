import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

describe('applyAdjustVictories', () => {
  it('adds delta to every PC participant', () => {
    const state = baseState({
      activeDirectorId: ownerActor.userId,
      participants: [
        makeHeroParticipant('pc-1', { ownerId: 'u-mira', victories: 2 }),
        makeHeroParticipant('pc-2', { ownerId: 'u-aldon', victories: 0 }),
        makeMonsterParticipant('m-1'),
      ],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.AdjustVictories,
        actor: ownerActor,
        payload: { delta: 1 },
      }),
    );
    expect(result.errors).toBeUndefined();
    const byId = new Map(result.state.participants.map((p) => [p.id, p]));
    // PCs incremented
    expect((byId.get('pc-1') as any).victories).toBe(3);
    expect((byId.get('pc-2') as any).victories).toBe(1);
    // Monster untouched (victories field exists on the schema but isn't bumped for monsters)
    expect((byId.get('m-1') as any).victories).toBe(0);
  });

  it('clamps the result to >= 0', () => {
    const state = baseState({
      activeDirectorId: ownerActor.userId,
      participants: [makeHeroParticipant('pc-1', { ownerId: 'u-mira', victories: 1 })],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.AdjustVictories,
        actor: ownerActor,
        payload: { delta: -5 },
      }),
    );
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect((p as any).victories).toBe(0);
  });

  it('rejects when actor is not the active director', () => {
    const state = baseState({
      activeDirectorId: ownerActor.userId,
      participants: [makeHeroParticipant('pc-1', { ownerId: 'u-mira' })],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.AdjustVictories,
        actor: { userId: 'u-mira', role: 'player' },
        payload: { delta: 1 },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('forbidden');
  });

  it('rejects when no encounter is active', () => {
    const state = baseState({
      activeDirectorId: ownerActor.userId,
      participants: [makeHeroParticipant('pc-1', { ownerId: 'u-mira' })],
      encounter: null,
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.AdjustVictories,
        actor: ownerActor,
        payload: { delta: 1 },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('no_active_encounter');
  });
});
