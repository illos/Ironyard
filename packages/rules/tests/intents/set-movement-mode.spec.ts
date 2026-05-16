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

// Phase 2b Group A+B (slice 6) — SetMovementMode utility reducer.
// Used by wings.ts onEndRound to decrement roundsRemaining.

describe('applySetMovementMode', () => {
  it('overwrites movementMode with the payload value', () => {
    const hero = makeHeroParticipant('pc-1', {
      movementMode: { mode: 'flying', roundsRemaining: 3 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SetMovementMode,
        actor: ownerActor,
        source: 'server',
        payload: {
          participantId: 'pc-1',
          movementMode: { mode: 'flying', roundsRemaining: 2 },
        },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.movementMode).toEqual({ mode: 'flying', roundsRemaining: 2 });
  });

  it('clears movementMode when payload is null', () => {
    const hero = makeHeroParticipant('pc-1', {
      movementMode: { mode: 'shadow', roundsRemaining: 0 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SetMovementMode,
        actor: ownerActor,
        source: 'server',
        payload: { participantId: 'pc-1', movementMode: null },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-1');
    expect(p?.movementMode).toBeNull();
  });

  it('rejects when participant is not found', () => {
    const state = baseState({
      participants: [],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.SetMovementMode,
        actor: ownerActor,
        source: 'server',
        payload: { participantId: 'no-such', movementMode: null },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('participant_not_found');
  });
});
