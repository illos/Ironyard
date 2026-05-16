import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyIntent } from '../../src/reducer';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Phase 2b Group A+B (slice 6) — StartFlying reducer.
//
// Spec § "Sub-slice plan: Slice 6": elective intent that sets
// `participant.movementMode = { mode: 'flying', roundsRemaining: max(1, might) }`.
// Player dispatch gated on staminaState ∈ {'healthy', 'winded', 'doomed'};
// the director bypasses via `source: 'server'`.

describe('applyStartFlying', () => {
  it('sets movementMode to flying with roundsRemaining = max(1, might) on a healthy PC', () => {
    const hero = makeHeroParticipant('pc-devil', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      characteristics: { might: 3, agility: 0, reason: 0, intuition: 0, presence: 0 },
      staminaState: 'healthy',
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartFlying,
        actor: { userId: 'u-dev', role: 'player' },
        payload: { participantId: 'pc-devil' },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-devil');
    expect(p?.movementMode).toEqual({ mode: 'flying', roundsRemaining: 3 });
  });

  it('clamps roundsRemaining to a minimum of 1 when might <= 0', () => {
    const hero = makeHeroParticipant('pc-weak', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      characteristics: { might: -1, agility: 0, reason: 0, intuition: 0, presence: 0 },
      staminaState: 'winded',
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartFlying,
        actor: { userId: 'u-dev', role: 'player' },
        payload: { participantId: 'pc-weak' },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-weak');
    expect(p?.movementMode).toEqual({ mode: 'flying', roundsRemaining: 1 });
  });

  it('rejects when participant is not found', () => {
    const state = baseState({
      participants: [],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartFlying,
        actor: ownerActor,
        payload: { participantId: 'no-such-id' },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('participant_not_found');
  });

  it('rejects when participant is a monster (PCs only)', () => {
    const mon = makeMonsterParticipant('mon-1');
    const state = baseState({
      participants: [mon],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartFlying,
        actor: ownerActor,
        payload: { participantId: 'mon-1' },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('not_pc');
  });

  it('rejects when player-dispatched and staminaState is dying', () => {
    const hero = makeHeroParticipant('pc-dying', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      currentStamina: -1,
      staminaState: 'dying',
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartFlying,
        actor: { userId: 'u-dev', role: 'player' },
        payload: { participantId: 'pc-dying' },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('stamina_state_blocks_flight');
  });

  it('rejects when player-dispatched and staminaState is unconscious', () => {
    const hero = makeHeroParticipant('pc-unc', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      staminaState: 'unconscious',
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartFlying,
        actor: { userId: 'u-dev', role: 'player' },
        payload: { participantId: 'pc-unc' },
      }),
    );
    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.code).toBe('stamina_state_blocks_flight');
  });

  it('allows player-dispatched when staminaState is doomed (canon-active Title Doomed)', () => {
    const hero = makeHeroParticipant('pc-doomed', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      characteristics: { might: 2, agility: 0, reason: 0, intuition: 0, presence: 0 },
      staminaState: 'doomed',
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartFlying,
        actor: { userId: 'u-dev', role: 'player' },
        payload: { participantId: 'pc-doomed' },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-doomed');
    expect(p?.movementMode).toEqual({ mode: 'flying', roundsRemaining: 2 });
  });

  it('director override (source: server) bypasses the staminaState gate', () => {
    const hero = makeHeroParticipant('pc-dying', {
      ownerId: 'u-dev',
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      currentStamina: -1,
      staminaState: 'dying',
      characteristics: { might: 4, agility: 0, reason: 0, intuition: 0, presence: 0 },
    });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const result = applyIntent(
      state,
      stamped({
        type: IntentTypes.StartFlying,
        actor: ownerActor,
        source: 'server',
        payload: { participantId: 'pc-dying' },
      }),
    );
    expect(result.errors).toBeUndefined();
    const p = result.state.participants.find((x) => x.id === 'pc-dying');
    expect(p?.movementMode).toEqual({ mode: 'flying', roundsRemaining: 4 });
  });
});
