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

// Phase 2b Group A+B (slice 9) — Memonek Fall Lightly (signature trait).
// Canon (Memonek.md): "Whenever you fall, you reduce the distance of the
// fall by 2 squares." Engine doesn't track fall distance, so the trait
// appends a table-adjudication log entry on every fall path.

describe('EndFlying — Memonek Fall Lightly log entry', () => {
  it('appends Fall Lightly note for a Memonek on fall', () => {
    const hero = makeHeroParticipant('pc-memo', {
      ancestry: ['memonek'],
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
        actor: ownerActor,
        payload: { participantId: 'pc-memo', reason: 'fall' },
      }),
    );

    expect(result.errors).toBeUndefined();
    const fallLightlyLog = result.log.find((l) => l.text.includes('Fall Lightly'));
    expect(fallLightlyLog).toBeDefined();
  });

  it('appends Fall Lightly note on duration-expired fall too', () => {
    const hero = makeHeroParticipant('pc-memo', {
      ancestry: ['memonek'],
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
        payload: { participantId: 'pc-memo', reason: 'duration-expired' },
      }),
    );

    expect(result.errors).toBeUndefined();
    const fallLightlyLog = result.log.find((l) => l.text.includes('Fall Lightly'));
    expect(fallLightlyLog).toBeDefined();
  });

  it('does NOT append on voluntary lands', () => {
    const hero = makeHeroParticipant('pc-memo', {
      ancestry: ['memonek'],
      movementMode: { mode: 'flying', roundsRemaining: 3 },
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
        payload: { participantId: 'pc-memo', reason: 'voluntary' },
      }),
    );

    expect(result.errors).toBeUndefined();
    const fallLightlyLog = result.log.find((l) => l.text.includes('Fall Lightly'));
    expect(fallLightlyLog).toBeUndefined();
  });

  it('does NOT append for a non-Memonek on fall', () => {
    const hero = makeHeroParticipant('pc-devil', {
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
        actor: ownerActor,
        payload: { participantId: 'pc-devil', reason: 'fall' },
      }),
    );

    expect(result.errors).toBeUndefined();
    const fallLightlyLog = result.log.find((l) => l.text.includes('Fall Lightly'));
    expect(fallLightlyLog).toBeUndefined();
  });
});
