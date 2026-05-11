import { describe, expect, it } from 'vitest';
import { applyIntent, isParticipant } from '../../src/index';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

describe('applyRemoveParticipant', () => {
  it('removes the named participant from the roster', () => {
    const state = baseState({
      participants: [makeHeroParticipant('hero-1'), makeMonsterParticipant('goblin-1')],
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveParticipant',
        actor: ownerActor,
        payload: { participantId: 'goblin-1' },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.participants.filter(isParticipant).map((p) => p.id)).toEqual(['hero-1']);
  });

  it('advances seq', () => {
    const state = baseState({
      participants: [makeMonsterParticipant('goblin-1')],
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveParticipant',
        actor: ownerActor,
        payload: { participantId: 'goblin-1' },
      }),
    );
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('also removes the participant from the encounter turnOrder', () => {
    const state = baseState({
      participants: [makeHeroParticipant('hero-1'), makeMonsterParticipant('goblin-1')],
      encounter: makeRunningEncounterPhase('enc-1', {
        turnOrder: ['hero-1', 'goblin-1'],
      }),
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveParticipant',
        actor: ownerActor,
        payload: { participantId: 'goblin-1' },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.encounter?.turnOrder).toEqual(['hero-1']);
  });

  it('works without an active encounter (no encounter field to update)', () => {
    const state = baseState({
      participants: [makeMonsterParticipant('goblin-1')],
      encounter: null,
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveParticipant',
        actor: ownerActor,
        payload: { participantId: 'goblin-1' },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.participants).toHaveLength(0);
    expect(result.state.encounter).toBeNull();
  });

  it('rejects when target is the currently active participant', () => {
    const state = baseState({
      participants: [makeMonsterParticipant('goblin-1')],
      encounter: makeRunningEncounterPhase('enc-1', {
        turnOrder: ['goblin-1'],
        activeParticipantId: 'goblin-1',
      }),
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveParticipant',
        actor: ownerActor,
        payload: { participantId: 'goblin-1' },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('participant_is_active');
    expect(result.state.participants).toHaveLength(1); // unchanged
  });

  it('rejects when actor is not the active director', () => {
    const state = baseState({
      participants: [makeMonsterParticipant('goblin-1')],
    });
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveParticipant',
        actor: { userId: 'some-player', role: 'player' },
        payload: { participantId: 'goblin-1' },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('not_active_director');
    expect(result.state.participants).toHaveLength(1); // unchanged
  });

  it('rejects with invalid_payload when participantId is missing', () => {
    const state = baseState();
    const result = applyIntent(
      state,
      stamped({
        type: 'RemoveParticipant',
        actor: ownerActor,
        payload: {},
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
