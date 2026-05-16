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

describe('applySpendMalice', () => {
  it('subtracts the requested amount from encounter Malice (no floor)', () => {
    const enc = makeRunningEncounterPhase('enc-1', {
      malice: { current: 2, lastMaliciousStrikeRound: null },
    });
    const state = baseState({ encounter: enc });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendMalice,
        actor: ownerActor,
        payload: { amount: 5 },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.state.encounter?.malice.current).toBe(-3);
  });
});

describe('applySpendMalice — class-δ malice-spent trigger wiring (Task 24)', () => {
  it('Null hero present → emits GainResource(discipline,1) + per-round latch flip with causedBy', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
    });
    const state = baseState({
      participants: [nullPc],
      encounter: makeRunningEncounterPhase('enc-1', {
        malice: { current: 4, lastMaliciousStrikeRound: null },
      }),
    });
    const intent = stamped({
      type: IntentTypes.SpendMalice,
      actor: ownerActor,
      payload: { amount: 2 },
    });
    const result = applyIntent(state, intent);
    expect(result.errors).toBeUndefined();
    const gain = result.derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    const gainPayload = gain!.payload as { participantId: string; name: string; amount: number };
    expect(gainPayload).toEqual({ participantId: 'null-1', name: 'discipline', amount: 1 });
    const latch = result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag');
    expect(latch).toBeDefined();
    const latchPayload = latch!.payload as {
      participantId: string;
      key: string;
      value: boolean;
    };
    expect(latchPayload).toEqual({
      participantId: 'null-1',
      key: 'directorSpentMalice',
      value: true,
    });
    expect(gain!.causedBy).toBe(intent.id);
    expect(latch!.causedBy).toBe(intent.id);
  });

  it('Null with directorSpentMalice latch already true → no emission this round', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
    });
    nullPc.perEncounterFlags.perRound.directorSpentMalice = true;
    const state = baseState({
      participants: [nullPc],
      encounter: makeRunningEncounterPhase('enc-1', {
        malice: { current: 4, lastMaliciousStrikeRound: null },
      }),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendMalice,
        actor: ownerActor,
        payload: { amount: 1 },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'GainResource')).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'SetParticipantPerRoundFlag')).toBeUndefined();
  });

  it('no Null hero present → no malice-spent emission', () => {
    const censor = makeHeroParticipant('censor-1', { className: 'Censor' });
    const state = baseState({
      participants: [censor],
      encounter: makeRunningEncounterPhase('enc-1', {
        malice: { current: 4, lastMaliciousStrikeRound: null },
      }),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SpendMalice,
        actor: ownerActor,
        payload: { amount: 3 },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived).toEqual([]);
  });
});
