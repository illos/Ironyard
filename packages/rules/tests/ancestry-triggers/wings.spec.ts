import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { evaluateOnConditionApplied, evaluateOnEndRound } from '../../src/ancestry-triggers';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
} from '../intents/test-utils';

// Phase 2b Group A+B (slice 6) — Wings ancestry trigger.
// Subscribes to Prone-add events (any cause) and EndRound countdown.

function flyingDevilHero(overrides: Partial<Participant> = {}) {
  return makeHeroParticipant('pc-devil', {
    ownerId: 'u-dev',
    ancestry: ['devil'],
    purchasedTraits: ['wings'],
    movementMode: { mode: 'flying', roundsRemaining: 3 },
    ...overrides,
  });
}

describe('ancestry-triggers/wings — onConditionApplied (Prone → fall)', () => {
  it('emits EndFlying { reason: fall } when a flying Devil with Wings gains Prone', () => {
    const hero = flyingDevilHero();
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnConditionApplied(
      state,
      { participantId: 'pc-devil', condition: 'Prone' },
      { actor: ownerActor },
    );
    expect(derived).toHaveLength(1);
    expect(derived[0]!.type).toBe('EndFlying');
    expect(derived[0]!.payload).toEqual({ participantId: 'pc-devil', reason: 'fall' });
  });

  it('emits EndFlying for a flying Dragon Knight with Wings', () => {
    const hero = makeHeroParticipant('pc-dk', {
      ancestry: ['dragon-knight'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 2 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnConditionApplied(
      state,
      { participantId: 'pc-dk', condition: 'Prone' },
      { actor: ownerActor },
    );
    expect(derived).toHaveLength(1);
    expect(derived[0]!.type).toBe('EndFlying');
  });

  it('does NOT fire when condition is not Prone', () => {
    const hero = flyingDevilHero();
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnConditionApplied(
      state,
      { participantId: 'pc-devil', condition: 'Slowed' },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT fire when participant is not flying (movementMode null)', () => {
    const hero = makeHeroParticipant('pc-devil', {
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: null,
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnConditionApplied(
      state,
      { participantId: 'pc-devil', condition: 'Prone' },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT fire when participant lacks Wings (e.g. Devil without the trait)', () => {
    const hero = makeHeroParticipant('pc-devil', {
      ancestry: ['devil'],
      purchasedTraits: [],
      movementMode: { mode: 'flying', roundsRemaining: 1 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnConditionApplied(
      state,
      { participantId: 'pc-devil', condition: 'Prone' },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT fire when participant has wings slug but wrong ancestry', () => {
    // Defensive: if any non-Devil/non-Dragon-Knight ancestry coincidentally
    // had a 'wings' trait, we shouldn't fire — slug collision guard.
    const hero = makeHeroParticipant('pc-other', {
      ancestry: ['polder'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 1 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnConditionApplied(
      state,
      { participantId: 'pc-other', condition: 'Prone' },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT fire when participant is in shadow mode (Shadowmeld)', () => {
    const hero = makeHeroParticipant('pc-polder', {
      ancestry: ['polder'],
      purchasedTraits: ['shadowmeld'],
      movementMode: { mode: 'shadow', roundsRemaining: 0 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnConditionApplied(
      state,
      { participantId: 'pc-polder', condition: 'Prone' },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });
});

describe('ancestry-triggers/wings — onEndRound countdown', () => {
  it('emits SetMovementMode with roundsRemaining decremented by 1 when > 1', () => {
    const hero = flyingDevilHero({ movementMode: { mode: 'flying', roundsRemaining: 3 } });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnEndRound(state, { actor: ownerActor });
    expect(derived).toHaveLength(1);
    expect(derived[0]!.type).toBe('SetMovementMode');
    expect(derived[0]!.payload).toEqual({
      participantId: 'pc-devil',
      movementMode: { mode: 'flying', roundsRemaining: 2 },
    });
  });

  it('emits EndFlying { reason: duration-expired } when roundsRemaining = 1 (decrements to 0)', () => {
    const hero = flyingDevilHero({ movementMode: { mode: 'flying', roundsRemaining: 1 } });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnEndRound(state, { actor: ownerActor });
    expect(derived).toHaveLength(1);
    expect(derived[0]!.type).toBe('EndFlying');
    expect(derived[0]!.payload).toEqual({
      participantId: 'pc-devil',
      reason: 'duration-expired',
    });
  });

  it('does NOT tick participants in shadow mode (only flying ticks)', () => {
    const polder = makeHeroParticipant('pc-polder', {
      ancestry: ['polder'],
      purchasedTraits: ['shadowmeld'],
      movementMode: { mode: 'shadow', roundsRemaining: 0 },
    });
    const state = baseState({
      participants: [polder],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnEndRound(state, { actor: ownerActor });
    expect(derived).toEqual([]);
  });

  it('does NOT tick monsters (no Wings stamping)', () => {
    const mon = makeMonsterParticipant('mon-1', {
      movementMode: { mode: 'flying', roundsRemaining: 5 },
    });
    const state = baseState({
      participants: [mon],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    // Wings is PC-only via purchasedTraits; monster fixture has none.
    const derived = evaluateOnEndRound(state, { actor: ownerActor });
    expect(derived).toEqual([]);
  });

  it('handles multiple flying PCs in one pass', () => {
    const devil = flyingDevilHero({ movementMode: { mode: 'flying', roundsRemaining: 2 } });
    const dk = makeHeroParticipant('pc-dk', {
      ancestry: ['dragon-knight'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 1 },
    });
    const state = baseState({
      participants: [devil, dk],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnEndRound(state, { actor: ownerActor });
    expect(derived).toHaveLength(2);
    // Devil ticks 2 → 1
    const devilD = derived.find(
      (d) => (d.payload as { participantId: string }).participantId === 'pc-devil',
    );
    expect(devilD?.type).toBe('SetMovementMode');
    // DK ticks 1 → 0 (fall)
    const dkD = derived.find(
      (d) => (d.payload as { participantId: string }).participantId === 'pc-dk',
    );
    expect(dkD?.type).toBe('EndFlying');
  });
});
