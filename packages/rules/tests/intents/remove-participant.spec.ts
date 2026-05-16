import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent, isParticipant } from '../../src/index';
import { applyRemoveParticipant } from '../../src/intents/remove-participant';
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

  it('also removes the participant from actedThisRound when present', () => {
    const state = baseState({
      participants: [makeHeroParticipant('hero-1'), makeMonsterParticipant('goblin-1')],
      encounter: makeRunningEncounterPhase('enc-1', {
        actedThisRound: ['hero-1', 'goblin-1'],
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
    // goblin-1 removed from roster; encounter still present with hero-1 intact
    expect(result.state.participants.filter(isParticipant).map((p) => p.id)).toEqual(['hero-1']);
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

describe('applyRemoveParticipant — targetingRelations cleanup', () => {
  it('strips removed id from every other participant targetingRelations arrays', () => {
    const state = baseState({
      participants: [
        makeHeroParticipant('censor-1', {
          targetingRelations: { judged: ['goblin-a', 'goblin-b'], marked: [], nullField: [] },
        }),
        makeHeroParticipant('tactician-1', {
          targetingRelations: { judged: [], marked: ['goblin-a'], nullField: [] },
        }),
        makeHeroParticipant('null-1', {
          targetingRelations: { judged: [], marked: [], nullField: ['goblin-a', 'goblin-c'] },
        }),
        makeMonsterParticipant('goblin-a'),
        makeMonsterParticipant('goblin-b'),
        makeMonsterParticipant('goblin-c'),
      ],
      encounter: makeRunningEncounterPhase('enc-1', { activeParticipantId: 'censor-1' }),
    });

    const res = applyRemoveParticipant(state, {
      id: 'i-1',
      campaignId: 'c1',
      actor: { userId: 'owner-1', role: 'director' },
      source: 'manual',
      type: IntentTypes.RemoveParticipant,
      payload: { participantId: 'goblin-a' },
      timestamp: 0,
    } as any);

    const censor = res.state.participants.find(
      (p) => isParticipant(p) && p.id === 'censor-1',
    ) as any;
    const tactician = res.state.participants.find(
      (p) => isParticipant(p) && p.id === 'tactician-1',
    ) as any;
    const nullPc = res.state.participants.find((p) => isParticipant(p) && p.id === 'null-1') as any;

    expect(censor.targetingRelations.judged).toEqual(['goblin-b']);
    expect(tactician.targetingRelations.marked).toEqual([]);
    expect(nullPc.targetingRelations.nullField).toEqual(['goblin-c']);
    // goblin-a is gone from the roster entirely
    expect(
      res.state.participants.find((p) => isParticipant(p) && (p as any).id === 'goblin-a'),
    ).toBeUndefined();
  });
});
