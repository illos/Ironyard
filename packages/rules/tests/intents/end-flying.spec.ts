import { IntentTypes } from '@ironyard/shared';
import type { ConditionInstance } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Phase 2b Group A+B (slice 6) — EndFlying reducer.
//
// Clears `participant.movementMode` (set to null). When `reason === 'fall'`
// AND target doesn't already have Prone, emits a derived SetCondition
// { type: 'Prone' } so the cascade lands Prone. No fall damage — engine
// does not track altitude.

describe('applyEndFlying', () => {
  it('clears movementMode for a flying participant (voluntary)', () => {
    const hero = makeHeroParticipant('pc-1', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 2 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndFlying,
        actor: { userId: 'u-dev', role: 'player' },
        payload: { participantId: 'pc-1', reason: 'voluntary' },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.movementMode).toBeNull();
    // No derived SetCondition for voluntary landings.
    expect(result.derived.find((d) => d.type === 'SetCondition')).toBeUndefined();
  });

  it('emits a derived SetCondition { Prone } when reason === fall', () => {
    const hero = makeHeroParticipant('pc-1', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 1 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndFlying,
        actor: ownerActor,
        source: 'server',
        payload: { participantId: 'pc-1', reason: 'fall' },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.movementMode).toBeNull();
    const proneDerived = result.derived.find(
      (d) =>
        d.type === 'SetCondition' && (d.payload as { condition: string }).condition === 'Prone',
    );
    expect(proneDerived).toBeDefined();
    expect(
      (
        proneDerived!.payload as {
          targetId: string;
          condition: string;
          source: { kind: string; id: string };
        }
      ).source.id,
    ).toBe('fall-from-flying');
  });

  it('does NOT emit derived Prone when target is already Prone (idempotent)', () => {
    const proneCond: ConditionInstance = {
      type: 'Prone',
      duration: { kind: 'manual' },
      source: { kind: 'effect', id: 'previous-source' },
      removable: true,
      appliedAtSeq: 1,
    };
    const hero = makeHeroParticipant('pc-1', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 1 },
      conditions: [proneCond],
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndFlying,
        actor: ownerActor,
        source: 'server',
        payload: { participantId: 'pc-1', reason: 'fall' },
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.derived.find((d) => d.type === 'SetCondition')).toBeUndefined();
  });

  it('emits derived Prone for duration-expired (canon: "before you fall")', () => {
    const hero = makeHeroParticipant('pc-1', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 0 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndFlying,
        actor: ownerActor,
        source: 'server',
        payload: { participantId: 'pc-1', reason: 'duration-expired' },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.movementMode).toBeNull();
    const proneDerived = result.derived.find(
      (d) =>
        d.type === 'SetCondition' && (d.payload as { condition: string }).condition === 'Prone',
    );
    expect(proneDerived).toBeDefined();
  });

  it('rejects when participant is not found', () => {
    const state = baseState({
      participants: [],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.EndFlying,
        actor: ownerActor,
        payload: { participantId: 'no-such-id', reason: 'voluntary' },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('participant_not_found');
  });
});
