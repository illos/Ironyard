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

const ENCOUNTER_ID = 'enc-1';

describe('applyUseAbility', () => {
  it('appends an active-ability entry to the participant', () => {
    const hero = makeHeroParticipant('pc:alice');
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: hero.id,
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const after = result.state.participants[0];
    if (!after || after.kind !== 'pc') throw new Error('expected pc participant');
    expect(after.activeAbilities).toHaveLength(1);
    expect(after.activeAbilities[0]).toMatchObject({
      abilityId: 'human.detect-the-supernatural',
      source: 'ancestry',
      expiresAt: { kind: 'EoT' },
    });
  });

  it('is idempotent — re-activating an already-active ability is a no-op (still logs)', () => {
    const hero = makeHeroParticipant('pc:alice', {
      activeAbilities: [
        {
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          expiresAt: { kind: 'EoT' },
          appliedAtSeq: 1,
        },
      ],
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: hero.id,
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors).toBeUndefined();
    const after = result.state.participants[0];
    if (!after || after.kind !== 'pc') throw new Error('expected pc participant');
    expect(after.activeAbilities).toHaveLength(1);
    expect(result.state.seq).toBe(state.seq + 1);
  });

  it('rejects when no encounter is active', () => {
    const hero = makeHeroParticipant('pc:alice');
    const state = baseState({ participants: [hero], encounter: null });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: hero.id,
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors?.[0]?.code).toBe('no_active_encounter');
  });

  it('rejects when the participant is not in the roster', () => {
    const state = baseState({
      participants: [],
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: {
          participantId: 'pc:ghost',
          abilityId: 'human.detect-the-supernatural',
          source: 'ancestry',
          duration: { kind: 'EoT' },
        },
      }),
    );

    expect(result.errors?.[0]?.code).toBe('participant_missing');
  });

  it('rejects an invalid payload', () => {
    const state = baseState({
      encounter: makeRunningEncounterPhase(ENCOUNTER_ID),
    });

    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.UseAbility,
        actor: ownerActor,
        payload: { participantId: '', abilityId: 'x', source: 'ancestry', duration: { kind: 'EoT' } },
      }),
    );

    expect(result.errors?.[0]?.code).toBe('invalid_payload');
  });
});
