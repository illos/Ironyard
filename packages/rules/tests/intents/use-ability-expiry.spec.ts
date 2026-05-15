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

const ENC = 'enc-1';

describe('active-ability expiry', () => {
  it('EndTurn drains EoT active abilities from the ending creature only', () => {
    const alice = makeHeroParticipant('pc:alice', {
      activeAbilities: [
        {
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          expiresAt: { kind: 'EoT' },
          appliedAtSeq: 1,
        },
      ],
    });
    const bob = makeHeroParticipant('pc:bob', {
      activeAbilities: [
        {
          abilityId: 'polder.shadowmeld',
          source: 'ancestry',
          expiresAt: { kind: 'EoT' },
          appliedAtSeq: 2,
        },
      ],
    });

    const state = baseState({
      participants: [alice, bob],
      encounter: makeRunningEncounterPhase(ENC, {
        activeParticipantId: alice.id,
      }),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndTurn,
        actor: ownerActor,
        payload: {},
      }),
    );

    expect(result.errors).toBeUndefined();
    const afterAlice = result.state.participants.find((p) => p.id === alice.id);
    const afterBob = result.state.participants.find((p) => p.id === bob.id);
    if (!afterAlice || afterAlice.kind !== 'pc') throw new Error('alice');
    if (!afterBob || afterBob.kind !== 'pc') throw new Error('bob');
    expect(afterAlice.activeAbilities).toHaveLength(0);
    expect(afterBob.activeAbilities).toHaveLength(1);
  });

  it('EndTurn preserves end_of_encounter active abilities', () => {
    const alice = makeHeroParticipant('pc:alice', {
      activeAbilities: [
        {
          abilityId: 'some.long-buff',
          source: 'class',
          expiresAt: { kind: 'end_of_encounter' },
          appliedAtSeq: 1,
        },
      ],
    });

    const state = baseState({
      participants: [alice],
      encounter: makeRunningEncounterPhase(ENC, {
        activeParticipantId: alice.id,
      }),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndTurn,
        actor: ownerActor,
        payload: {},
      }),
    );

    const after = result.state.participants[0];
    if (!after || after.kind !== 'pc') throw new Error('alice');
    expect(after.activeAbilities).toHaveLength(1);
    expect(after.activeAbilities[0]?.expiresAt.kind).toBe('end_of_encounter');
  });

  it('EndEncounter clears all active abilities regardless of kind', () => {
    const alice = makeHeroParticipant('pc:alice', {
      activeAbilities: [
        {
          abilityId: 'some.long-buff',
          source: 'class',
          expiresAt: { kind: 'end_of_encounter' },
          appliedAtSeq: 1,
        },
        {
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          expiresAt: { kind: 'EoT' },
          appliedAtSeq: 2,
        },
      ],
    });

    const state = baseState({
      participants: [alice],
      encounter: makeRunningEncounterPhase(ENC),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndEncounter,
        actor: ownerActor,
        payload: { encounterId: ENC },
      }),
    );

    expect(result.errors).toBeUndefined();
    const after = result.state.participants[0];
    if (!after || after.kind !== 'pc') throw new Error('alice');
    expect(after.activeAbilities).toHaveLength(0);
  });
});
