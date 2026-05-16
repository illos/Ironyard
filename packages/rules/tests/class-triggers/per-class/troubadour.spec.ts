import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateTroubadour } from '../../../src/class-triggers/per-class/troubadour';
import type { CampaignState, EncounterPhase } from '../../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
} from '../../intents/test-utils';

// Pass 3 Slice 2a — Troubadour Drama action triggers (canon § 5.4.8).
//
// Two action-driven triggers:
//   1) three heroes acted this turn → +2 drama (per-encounter latch)
//   2) LoE nat 19/20 roll-power-outcome → raise spatial OA (no latch)
// Plus the posthumous-eligibility predicate that gates whether a dead-but-
// body-intact Troubadour can still bank drama.

const testCtx: ActionTriggerContext = {
  actor: { userId: 'test-user', role: 'director' },
  rolls: {},
};

function stateWith(
  participants: ReturnType<typeof makeHeroParticipant>[],
  encounterOverrides: Partial<EncounterPhase> = {},
): CampaignState {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1', encounterOverrides),
  });
}

describe('class-triggers/per-class/troubadour.evaluate', () => {
  it('emits +2 drama + latch when heroesActedThisTurn has length 3 (first time per encounter)', () => {
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const state = stateWith([trou]);
    state.encounter!.perEncounterFlags.perTurn.heroesActedThisTurn = ['pc-1', 'pc-2', 'pc-3'];
    const event: ActionEvent = {
      kind: 'ability-used',
      actorId: 'pc-3',
      abilityId: 'a',
      abilityCategory: 'signature',
      abilityKind: 'main-action',
      sideOfActor: 'heroes',
    };

    const result = evaluateTroubadour(state, event, testCtx);
    expect(result).toHaveLength(2);

    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({
      participantId: 'trou-1',
      name: 'drama',
      amount: 2,
    });
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(gain!.source).toBe('server');

    const latch = result.find((r) => r.type === 'SetParticipantPerEncounterLatch');
    expect(latch).toBeDefined();
    expect(latch!.payload).toEqual({
      participantId: 'trou-1',
      key: 'troubadourThreeHeroesTriggered',
      value: true,
    });
    expect(latch!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(latch!.source).toBe('server');
  });

  it('does NOT fire drama when the three-heroes latch is already set', () => {
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    trou.perEncounterFlags.perEncounter.troubadourThreeHeroesTriggered = true;
    const state = stateWith([trou]);
    state.encounter!.perEncounterFlags.perTurn.heroesActedThisTurn = ['pc-1', 'pc-2', 'pc-3'];
    const event: ActionEvent = {
      kind: 'ability-used',
      actorId: 'pc-3',
      abilityId: 'a',
      abilityCategory: 'signature',
      abilityKind: 'main-action',
      sideOfActor: 'heroes',
    };

    expect(evaluateTroubadour(state, event, testCtx)).toEqual([]);
  });

  it('raises spatial-trigger-troubadour-line-of-effect OA on nat 20 roll-power-outcome', () => {
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant('goblin-1');
    const state = stateWith([trou, goblin]);
    const event: ActionEvent = {
      kind: 'roll-power-outcome',
      actorId: 'goblin-1',
      abilityId: 'bite',
      naturalValues: [12, 20],
    };

    const result = evaluateTroubadour(state, event, testCtx);
    expect(result).toHaveLength(1);
    const oa = result[0]!;
    expect(oa.type).toBe('RaiseOpenAction');
    expect(oa.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(oa.source).toBe('server');
    expect(oa.payload).toEqual({
      kind: 'spatial-trigger-troubadour-line-of-effect',
      participantId: 'trou-1',
      expiresAtRound: null,
      payload: {
        actorId: 'goblin-1',
        actorName: 'Monster goblin-1',
        naturalValue: 20,
      },
    });
  });

  it('raises an OA every time on nat 19/20 (no latch — fires twice across two events)', () => {
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const goblin1 = makeMonsterParticipant('goblin-1');
    const goblin2 = makeMonsterParticipant('goblin-2');
    const state = stateWith([trou, goblin1, goblin2]);

    const event1: ActionEvent = {
      kind: 'roll-power-outcome',
      actorId: 'goblin-1',
      abilityId: 'bite',
      naturalValues: [19],
    };
    const event2: ActionEvent = {
      kind: 'roll-power-outcome',
      actorId: 'goblin-2',
      abilityId: 'claw',
      naturalValues: [20],
    };

    expect(
      evaluateTroubadour(state, event1, testCtx).filter((r) => r.type === 'RaiseOpenAction'),
    ).toHaveLength(1);
    expect(
      evaluateTroubadour(state, event2, testCtx).filter((r) => r.type === 'RaiseOpenAction'),
    ).toHaveLength(1);
  });

  it('posthumous Troubadour with bodyIntact still fires drama gains', () => {
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
      currentStamina: -50,
      staminaState: 'dead',
      bodyIntact: true,
      posthumousDramaEligible: true,
    });
    const goblin = makeMonsterParticipant('goblin-1');
    const state = stateWith([trou, goblin]);
    const event: ActionEvent = {
      kind: 'roll-power-outcome',
      actorId: 'goblin-1',
      abilityId: 'bite',
      naturalValues: [20],
    };

    const result = evaluateTroubadour(state, event, testCtx);
    const oa = result.find((r) => r.type === 'RaiseOpenAction');
    expect(oa).toBeDefined();
    expect((oa!.payload as { kind: string }).kind).toBe(
      'spatial-trigger-troubadour-line-of-effect',
    );
  });

  it('posthumous Troubadour with bodyIntact=false does NOT fire drama gains', () => {
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
      currentStamina: -50,
      staminaState: 'dead',
      bodyIntact: false,
      posthumousDramaEligible: true,
    });
    const goblin = makeMonsterParticipant('goblin-1');
    const state = stateWith([trou, goblin]);
    const event: ActionEvent = {
      kind: 'roll-power-outcome',
      actorId: 'goblin-1',
      abilityId: 'bite',
      naturalValues: [20],
    };

    expect(evaluateTroubadour(state, event, testCtx)).toEqual([]);
  });
});
