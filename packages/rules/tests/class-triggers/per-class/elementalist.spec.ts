import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateElementalist } from '../../../src/class-triggers/per-class/elementalist';
import type { CampaignState } from '../../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
} from '../../intents/test-utils';

// Pass 3 Slice 2a — Elementalist Essence action triggers.
//
// Only trigger in slice 2a is the within-10 spatial OA: when any creature
// takes typed (non-untyped, non-holy) damage, every Elementalist whose
// `elementalistDamageWithin10Triggered` latch is still false gets a
// `spatial-trigger-elementalist-essence` OpenAction raised. Latch is NOT
// flipped here — that lives in the claim/decline handler (Task 27), mirroring
// Tactician and Null's spatial-OA pattern.

const testCtx: ActionTriggerContext = {
  actor: { userId: 'test-user', role: 'director' },
  rolls: {},
};

function stateWith(participants: ReturnType<typeof makeHeroParticipant>[]): CampaignState {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

describe('class-triggers/per-class/elementalist.evaluate', () => {
  it('returns empty when no Elementalist exists in state', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([fury, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'fury-1',
      targetId: 'mon-1',
      amount: 7,
      type: 'fire',
    };
    expect(evaluateElementalist(state, event, testCtx)).toEqual([]);
  });

  it('raises spatial-trigger-elementalist-essence OA on non-untyped/non-holy damage', () => {
    const ele = makeHeroParticipant('ele-1', {
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([ele, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'ele-1',
      targetId: 'mon-1',
      amount: 8,
      type: 'fire',
    };
    const result = evaluateElementalist(state, event, testCtx);
    expect(result).toHaveLength(1);
    const oa = result[0]!;
    expect(oa.type).toBe('RaiseOpenAction');
    expect(oa.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(oa.source).toBe('server');
    expect(oa.payload).toEqual({
      kind: 'spatial-trigger-elementalist-essence',
      participantId: 'ele-1',
      expiresAtRound: null,
      payload: {
        targetId: 'mon-1',
        targetName: goblin.name,
        amount: 8,
        type: 'fire',
      },
    });
  });

  it('does NOT raise OA for untyped damage', () => {
    const ele = makeHeroParticipant('ele-1', {
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([ele, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'ele-1',
      targetId: 'mon-1',
      amount: 5,
      type: 'untyped',
    };
    expect(evaluateElementalist(state, event, testCtx)).toEqual([]);
  });

  it('does NOT raise OA for holy damage', () => {
    const ele = makeHeroParticipant('ele-1', {
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([ele, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'ele-1',
      targetId: 'mon-1',
      amount: 6,
      type: 'holy',
    };
    expect(evaluateElementalist(state, event, testCtx)).toEqual([]);
  });

  it('does NOT raise OA when elementalistDamageWithin10Triggered latch is true', () => {
    const ele = makeHeroParticipant('ele-1', {
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 0, floor: 0 }],
    });
    ele.perEncounterFlags.perRound.elementalistDamageWithin10Triggered = true;
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([ele, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'ele-1',
      targetId: 'mon-1',
      amount: 8,
      type: 'fire',
    };
    expect(evaluateElementalist(state, event, testCtx)).toEqual([]);
  });

  it('ignores non-damage events (e.g. ability-used)', () => {
    const ele = makeHeroParticipant('ele-1', {
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 0, floor: 0 }],
    });
    const state = stateWith([ele]);
    const event: ActionEvent = {
      kind: 'ability-used',
      actorId: 'ele-1',
      abilityId: 'firebolt',
      abilityCategory: 'signature',
      abilityKind: 'action',
      sideOfActor: 'heroes',
    };
    expect(evaluateElementalist(state, event, testCtx)).toEqual([]);
  });

  it('does NOT raise OA latch flip — engine only reads the latch (Task 27 flips on claim/decline)', () => {
    const ele = makeHeroParticipant('ele-1', {
      className: 'Elementalist',
      heroicResources: [{ name: 'essence', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([ele, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'ele-1',
      targetId: 'mon-1',
      amount: 4,
      type: 'cold',
    };
    const result = evaluateElementalist(state, event, testCtx);
    expect(result).toHaveLength(1);
    expect(result.find((r) => r.type === 'SetParticipantPerRoundFlag')).toBeUndefined();
  });
});
