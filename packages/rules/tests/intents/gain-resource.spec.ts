import { describe, expect, it } from 'vitest';
import { defaultPerEncounterFlags } from '@ironyard/shared';
import { applyGainResource } from '../../src/intents/gain-resource';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Pass 3 Slice 2a Task 28 — drama cross-30 → raise troubadour-auto-revive OA.
//
// When a posthumous-eligible Troubadour gains drama and the new value crosses
// 30 (oldValue < 30 ≤ newValue), GainResource emits two derived intents:
//   1. RaiseOpenAction(kind='troubadour-auto-revive', participantId)
//   2. SetParticipantPerEncounterLatch(key='troubadourReviveOARaised', value=true)
// The latch prevents the OA from being raised more than once per encounter.
//
// All other gating predicates (dead, bodyIntact, posthumousDramaEligible) must
// hold or the OA is not raised — see the "does not raise" cases below.

const PC_ID = 'pc:troub-1';

function makeDeadTroubadour(
  overrides: Partial<ReturnType<typeof makeHeroParticipant>> = {},
) {
  return makeHeroParticipant(PC_ID, {
    className: 'Troubadour',
    currentStamina: -15,
    staminaState: 'dead',
    bodyIntact: true,
    posthumousDramaEligible: true,
    heroicResources: [{ name: 'drama', value: 25, floor: 0 }],
    ...overrides,
  });
}

function stateWith(participants: ReturnType<typeof makeHeroParticipant>[]) {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

describe('applyGainResource — troubadour drama cross-30 auto-revive', () => {
  it('drama crosses 30 + dead + bodyIntact + posthumous + latch unflipped → raises OA + flips latch', () => {
    const troub = makeDeadTroubadour();
    const state = stateWith([troub]);
    const intent = stamped({
      actor: ownerActor,
      type: 'GainResource',
      payload: { participantId: PC_ID, name: 'drama', amount: 5 },
    });

    const result = applyGainResource(state, intent);
    expect(result.errors ?? []).toEqual([]);

    const raise = result.derived.find((d) => d.type === 'RaiseOpenAction');
    expect(raise).toBeDefined();
    const raisePayload = raise!.payload as {
      kind: string;
      participantId: string;
      payload: Record<string, unknown>;
      expiresAtRound: number | null;
    };
    expect(raisePayload.kind).toBe('troubadour-auto-revive');
    expect(raisePayload.participantId).toBe(PC_ID);
    expect(raisePayload.payload).toEqual({});
    expect(raisePayload.expiresAtRound).toBeNull();
    expect(raise!.causedBy).toBe(intent.id);
    expect(raise!.source).toBe('server');
    expect(raise!.actor).toEqual(intent.actor);

    const latch = result.derived.find(
      (d) => d.type === 'SetParticipantPerEncounterLatch',
    );
    expect(latch).toBeDefined();
    const latchPayload = latch!.payload as {
      participantId: string;
      key: string;
      value: boolean;
    };
    expect(latchPayload.participantId).toBe(PC_ID);
    expect(latchPayload.key).toBe('troubadourReviveOARaised');
    expect(latchPayload.value).toBe(true);
    expect(latch!.causedBy).toBe(intent.id);
    expect(latch!.source).toBe('server');
    expect(latch!.actor).toEqual(intent.actor);
  });

  it('latch already flipped → does NOT raise', () => {
    const troub = makeDeadTroubadour({
      perEncounterFlags: {
        ...defaultPerEncounterFlags(),
        perEncounter: {
          ...defaultPerEncounterFlags().perEncounter,
          troubadourReviveOARaised: true,
        },
      },
    });
    const state = stateWith([troub]);
    const intent = stamped({
      actor: ownerActor,
      type: 'GainResource',
      payload: { participantId: PC_ID, name: 'drama', amount: 5 },
    });

    const result = applyGainResource(state, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived.find((d) => d.type === 'RaiseOpenAction')).toBeUndefined();
    expect(
      result.derived.find((d) => d.type === 'SetParticipantPerEncounterLatch'),
    ).toBeUndefined();
  });

  it('alive Troubadour with high drama gain → does NOT raise (need dead + posthumous)', () => {
    const troub = makeHeroParticipant(PC_ID, {
      className: 'Troubadour',
      currentStamina: 30,
      staminaState: 'healthy',
      bodyIntact: true,
      posthumousDramaEligible: false,
      heroicResources: [{ name: 'drama', value: 25, floor: 0 }],
    });
    const state = stateWith([troub]);
    const intent = stamped({
      actor: ownerActor,
      type: 'GainResource',
      payload: { participantId: PC_ID, name: 'drama', amount: 10 },
    });

    const result = applyGainResource(state, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
  });

  it('posthumous but bodyIntact=false → does NOT raise', () => {
    const troub = makeDeadTroubadour({ bodyIntact: false });
    const state = stateWith([troub]);
    const intent = stamped({
      actor: ownerActor,
      type: 'GainResource',
      payload: { participantId: PC_ID, name: 'drama', amount: 5 },
    });

    const result = applyGainResource(state, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
  });

  it('just-under-30 (25 → 28) → does NOT raise', () => {
    const troub = makeDeadTroubadour({
      heroicResources: [{ name: 'drama', value: 25, floor: 0 }],
    });
    const state = stateWith([troub]);
    const intent = stamped({
      actor: ownerActor,
      type: 'GainResource',
      payload: { participantId: PC_ID, name: 'drama', amount: 3 },
    });

    const result = applyGainResource(state, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
  });

  it('already over 30 (35 → 38) → does NOT raise (oldValue must be < 30)', () => {
    const troub = makeDeadTroubadour({
      heroicResources: [{ name: 'drama', value: 35, floor: 0 }],
    });
    const state = stateWith([troub]);
    const intent = stamped({
      actor: ownerActor,
      type: 'GainResource',
      payload: { participantId: PC_ID, name: 'drama', amount: 3 },
    });

    const result = applyGainResource(state, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
  });

  it('non-drama resource crossing 30 → does NOT raise', () => {
    const troub = makeDeadTroubadour({
      heroicResources: [
        { name: 'drama', value: 10, floor: 0 },
        { name: 'piety', value: 25, floor: 0 },
      ],
    });
    const state = stateWith([troub]);
    const intent = stamped({
      actor: ownerActor,
      type: 'GainResource',
      payload: { participantId: PC_ID, name: 'piety', amount: 10 },
    });

    const result = applyGainResource(state, intent);
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
  });
});
