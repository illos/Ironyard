import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/index';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

describe('applyClearLobby', () => {
  it('clears all participants when no encounter is active', () => {
    const state = baseState({
      participants: [makeHeroParticipant('hero-1'), makeMonsterParticipant('goblin-1')],
      encounter: null,
    });
    const result = applyIntent(
      state,
      stamped({ type: 'ClearLobby', actor: ownerActor, payload: {} }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.participants).toEqual([]);
  });

  it('advances seq', () => {
    const state = baseState({ participants: [makeMonsterParticipant('goblin-1')] });
    const result = applyIntent(
      state,
      stamped({ type: 'ClearLobby', actor: ownerActor, payload: {} }),
    );
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('rejects when an encounter is active', () => {
    const state = baseState({
      participants: [makeMonsterParticipant('goblin-1')],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({ type: 'ClearLobby', actor: ownerActor, payload: {} }),
    );
    expect(result.errors?.[0]?.code).toBe('encounter_active');
    expect(result.state.participants).toHaveLength(1); // unchanged
  });

  it('rejects when actor is not the active director', () => {
    const state = baseState({
      participants: [makeMonsterParticipant('goblin-1')],
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'ClearLobby',
        actor: { userId: 'some-player', role: 'player' },
        payload: {},
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_active_director');
    expect(result.state.participants).toHaveLength(1); // unchanged
  });
});
