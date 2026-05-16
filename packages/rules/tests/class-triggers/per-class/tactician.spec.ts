import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateTactician } from '../../../src/class-triggers/per-class/tactician';
import type { CampaignState } from '../../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
} from '../../intents/test-utils';

// Pass 3 Slice 2a — Tactician Focus action triggers.
//
// `isMarkedBy` is a permissive stub for Slice 2a (Mark-tracking state lands
// later) — every non-self creature is treated as a Mark target. These tests
// pin both triggers (marked-target damage gain, spatial OA on ally heroic
// ability), the per-round latches, and a couple of smoke negatives.

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

describe('class-triggers/per-class/tactician.evaluate', () => {
  it('returns empty when no Tactician exists in state', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([fury, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'fury-1',
      targetId: 'mon-1',
      amount: 4,
      type: 'fire',
    };
    expect(evaluateTactician(state, event, testCtx)).toEqual([]);
  });

  it('emits +1 focus + latch when a marked target takes damage (first time per round)', () => {
    const tactician = makeHeroParticipant('tac-1', {
      className: 'Tactician',
      heroicResources: [{ name: 'focus', value: 0, floor: 0 }],
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([tactician, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'fury-1',
      targetId: 'mon-1',
      amount: 5,
      type: 'fire',
    };
    const result = evaluateTactician(state, event, testCtx);
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({
      participantId: 'tac-1',
      name: 'focus',
      amount: 1,
    });
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(gain!.source).toBe('server');
    const latch = result.find((r) => r.type === 'SetParticipantPerRoundFlag');
    expect(latch).toBeDefined();
    expect(latch!.payload).toEqual({
      participantId: 'tac-1',
      key: 'markedTargetDamagedByAnyone',
      value: true,
    });
  });

  it('does NOT emit focus when markedTargetDamagedByAnyone latch already flipped', () => {
    const tactician = makeHeroParticipant('tac-1', {
      className: 'Tactician',
      heroicResources: [{ name: 'focus', value: 0, floor: 0 }],
    });
    tactician.perEncounterFlags.perRound.markedTargetDamagedByAnyone = true;
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([tactician, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'fury-1',
      targetId: 'mon-1',
      amount: 5,
      type: 'fire',
    };
    expect(evaluateTactician(state, event, testCtx)).toEqual([]);
  });

  it('raises spatial-trigger-tactician-ally-heroic OA on ally heroic-ability use', () => {
    const tactician = makeHeroParticipant('tac-1', {
      className: 'Tactician',
      heroicResources: [{ name: 'focus', value: 0, floor: 0 }],
    });
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const state = stateWith([tactician, fury]);
    const event: ActionEvent = {
      kind: 'ability-used',
      actorId: 'fury-1',
      abilityId: 'devastating-charge',
      abilityCategory: 'heroic',
      abilityKind: 'action',
      sideOfActor: 'heroes',
    };
    const result = evaluateTactician(state, event, testCtx);
    expect(result).toHaveLength(1);
    const oa = result[0]!;
    expect(oa.type).toBe('RaiseOpenAction');
    expect(oa.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(oa.source).toBe('server');
    expect(oa.payload).toEqual({
      kind: 'spatial-trigger-tactician-ally-heroic',
      participantId: 'tac-1',
      expiresAtRound: null,
      payload: { allyId: 'fury-1', abilityId: 'devastating-charge' },
    });
  });

  it('does NOT raise OA when allyHeroicWithin10Triggered latch is true', () => {
    const tactician = makeHeroParticipant('tac-1', {
      className: 'Tactician',
      heroicResources: [{ name: 'focus', value: 0, floor: 0 }],
    });
    tactician.perEncounterFlags.perRound.allyHeroicWithin10Triggered = true;
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const state = stateWith([tactician, fury]);
    const event: ActionEvent = {
      kind: 'ability-used',
      actorId: 'fury-1',
      abilityId: 'devastating-charge',
      abilityCategory: 'heroic',
      abilityKind: 'action',
      sideOfActor: 'heroes',
    };
    expect(evaluateTactician(state, event, testCtx)).toEqual([]);
  });

  it('does NOT raise OA when the heroic-ability user is the Tactician themself', () => {
    const tactician = makeHeroParticipant('tac-1', {
      className: 'Tactician',
      heroicResources: [{ name: 'focus', value: 0, floor: 0 }],
    });
    const state = stateWith([tactician]);
    const event: ActionEvent = {
      kind: 'ability-used',
      actorId: 'tac-1',
      abilityId: 'rally-the-troops',
      abilityCategory: 'heroic',
      abilityKind: 'action',
      sideOfActor: 'heroes',
    };
    expect(evaluateTactician(state, event, testCtx)).toEqual([]);
  });

  it('does NOT raise OA when the heroic-ability user is on the foes side', () => {
    const tactician = makeHeroParticipant('tac-1', {
      className: 'Tactician',
      heroicResources: [{ name: 'focus', value: 0, floor: 0 }],
    });
    const villain = makeMonsterParticipant('mon-1');
    const state = stateWith([tactician, villain]);
    const event: ActionEvent = {
      kind: 'ability-used',
      actorId: 'mon-1',
      abilityId: 'villain-heroic',
      abilityCategory: 'heroic',
      abilityKind: 'action',
      sideOfActor: 'foes',
    };
    expect(evaluateTactician(state, event, testCtx)).toEqual([]);
  });

  it('does NOT raise OA on signature-ability use (only heroic triggers)', () => {
    const tactician = makeHeroParticipant('tac-1', {
      className: 'Tactician',
      heroicResources: [{ name: 'focus', value: 0, floor: 0 }],
    });
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const state = stateWith([tactician, fury]);
    const event: ActionEvent = {
      kind: 'ability-used',
      actorId: 'fury-1',
      abilityId: 'cleave',
      abilityCategory: 'signature',
      abilityKind: 'action',
      sideOfActor: 'heroes',
    };
    expect(evaluateTactician(state, event, testCtx)).toEqual([]);
  });
});
