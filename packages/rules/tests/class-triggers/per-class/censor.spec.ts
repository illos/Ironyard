import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateCensor } from '../../../src/class-triggers/per-class/censor';
import type { CampaignState } from '../../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
} from '../../intents/test-utils';

// Pass 3 Slice 2a — Censor Wrath action triggers.
//
// Slice 2b: `isJudgedBy` now reads from `censor.targetingRelations.judged`.
// All slice-2a fixtures that exercise the trigger path have been updated to
// include an explicit `judged: [<damager-id>]` entry so they still pass.

const testCtx: ActionTriggerContext = {
  actor: { userId: 'test-user', role: 'director' },
  rolls: { ferocityD3: 2 },
};

function stateWith(participants: ReturnType<typeof makeHeroParticipant>[]): CampaignState {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

describe('class-triggers/per-class/censor.evaluate', () => {
  it('returns empty when no Censor exists in state', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([fury, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'mon-1',
      targetId: 'fury-1',
      amount: 4,
      type: 'fire',
    };
    expect(evaluateCensor(state, event, testCtx)).toEqual([]);
  });

  it('emits +1 wrath + latch when a judged-target damages this Censor (first time per round)', () => {
    const censor = makeHeroParticipant('censor-1', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
      targetingRelations: { judged: ['mon-1'], marked: [], nullField: [] },
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([censor, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'mon-1',
      targetId: 'censor-1',
      amount: 5,
      type: 'fire',
    };
    const result = evaluateCensor(state, event, testCtx);
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({
      participantId: 'censor-1',
      name: 'wrath',
      amount: 1,
    });
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(gain!.source).toBe('server');
    const latch = result.find((r) => r.type === 'SetParticipantPerRoundFlag');
    expect(latch).toBeDefined();
    expect(latch!.payload).toEqual({
      participantId: 'censor-1',
      key: 'judgedTargetDamagedMe',
      value: true,
    });
  });

  it('emits +1 wrath + latch when this Censor damages a judged-target (first time per round)', () => {
    const censor = makeHeroParticipant('censor-1', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
      targetingRelations: { judged: ['mon-1'], marked: [], nullField: [] },
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([censor, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'censor-1',
      targetId: 'mon-1',
      amount: 6,
      type: 'fire',
    };
    const result = evaluateCensor(state, event, testCtx);
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain!.payload).toEqual({
      participantId: 'censor-1',
      name: 'wrath',
      amount: 1,
    });
    const latch = result.find((r) => r.type === 'SetParticipantPerRoundFlag');
    expect(latch!.payload).toEqual({
      participantId: 'censor-1',
      key: 'damagedJudgedTarget',
      value: true,
    });
  });

  it('does NOT emit when the per-round latch is already flipped', () => {
    const censor = makeHeroParticipant('censor-1', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
      targetingRelations: { judged: ['mon-1'], marked: [], nullField: [] },
    });
    censor.perEncounterFlags.perRound.damagedJudgedTarget = true;
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([censor, goblin]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'censor-1',
      targetId: 'mon-1',
      amount: 6,
      type: 'fire',
    };
    const result = evaluateCensor(state, event, testCtx);
    expect(result).toEqual([]);
  });
});

describe('Censor isJudgedBy (slice 2b)', () => {
  it('fires Wrath +1 when damager is in censor.targetingRelations.judged', () => {
    const censor = makeHeroParticipant('censor-1', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
      targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
    });
    const goblinA = makeMonsterParticipant('goblin-a');
    const goblinB = makeMonsterParticipant('goblin-b');
    const state = stateWith([censor, goblinA, goblinB]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'goblin-a',
      targetId: 'censor-1',
      amount: 5,
      type: 'fire',
    };
    const derived = evaluateCensor(state, event, testCtx);
    const gain = derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toMatchObject({
      participantId: 'censor-1',
      name: 'wrath',
      amount: 1,
    });
  });

  it('does NOT fire when damager is NOT in censor.targetingRelations.judged (slice 2a over-fire regression)', () => {
    const censor = makeHeroParticipant('censor-1', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
      targetingRelations: { judged: [], marked: [], nullField: [] },
    });
    const goblinB = makeMonsterParticipant('goblin-b');
    const state = stateWith([censor, goblinB]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'goblin-b',
      targetId: 'censor-1',
      amount: 5,
      type: 'fire',
    };
    const derived = evaluateCensor(state, event, testCtx);
    expect(derived.filter((d) => d.type === 'GainResource')).toHaveLength(0);
  });

  it('fires Wrath +1 when censor damages a judged-target', () => {
    const censor = makeHeroParticipant('censor-1', {
      className: 'Censor',
      heroicResources: [{ name: 'wrath', value: 0, floor: 0 }],
      targetingRelations: { judged: ['goblin-a'], marked: [], nullField: [] },
    });
    const goblinA = makeMonsterParticipant('goblin-a');
    const state = stateWith([censor, goblinA]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: 'censor-1',
      targetId: 'goblin-a',
      amount: 5,
      type: 'fire',
    };
    const derived = evaluateCensor(state, event, testCtx);
    const gain = derived.find((d) => d.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toMatchObject({
      participantId: 'censor-1',
      name: 'wrath',
      amount: 1,
    });
  });
});
