import { IntentTypes } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateNull } from '../../../src/class-triggers/per-class/null';
import type { CampaignState } from '../../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
} from '../../intents/test-utils';

// Pass 3 Slice 2a — Null Discipline action triggers.
//
// `hasActiveNullField` is a permissive stub for Slice 2a (Null-Field-tracking
// state lands later). These tests pin both triggers (malice-spent discipline
// gain, spatial OA on enemy main-action-used), the per-round latches, and a
// couple of smoke negatives.

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

describe('class-triggers/per-class/null.evaluate', () => {
  it('returns empty when no Null exists in state', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([fury, goblin]);
    const event: ActionEvent = { kind: 'malice-spent', amount: 3 };
    expect(evaluateNull(state, event, testCtx)).toEqual([]);
  });

  it('emits +1 discipline + latch on malice-spent (first time per round)', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
    });
    const state = stateWith([nullPc]);
    const event: ActionEvent = { kind: 'malice-spent', amount: 5 };
    const result = evaluateNull(state, event, testCtx);
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({
      participantId: 'null-1',
      name: 'discipline',
      amount: 1,
    });
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(gain!.source).toBe('server');
    const latch = result.find((r) => r.type === 'SetParticipantPerRoundFlag');
    expect(latch).toBeDefined();
    expect(latch!.payload).toEqual({
      participantId: 'null-1',
      key: 'directorSpentMalice',
      value: true,
    });
  });

  it('does NOT emit discipline when directorSpentMalice latch already flipped', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
    });
    nullPc.perEncounterFlags.perRound.directorSpentMalice = true;
    const state = stateWith([nullPc]);
    const event: ActionEvent = { kind: 'malice-spent', amount: 5 };
    expect(evaluateNull(state, event, testCtx)).toEqual([]);
  });

  // Slice 2b: main-action-used path now auto-applies (no OA detour).
  // Enemy must be in nullPc.targetingRelations.nullField[] to fire.

  it('auto-applies Discipline +1 + latch when enemy is in nullField (no OA)', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
      targetingRelations: { judged: [], marked: [], nullField: ['mon-1'] },
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([nullPc, goblin]);
    const event: ActionEvent = { kind: 'main-action-used', actorId: 'mon-1' };
    const result = evaluateNull(state, event, testCtx);
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({
      participantId: 'null-1',
      name: 'discipline',
      amount: 1,
    });
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(gain!.source).toBe('server');
    const latch = result.find((r) => r.type === 'SetParticipantPerRoundFlag');
    expect(latch).toBeDefined();
    expect(latch!.payload).toEqual({
      participantId: 'null-1',
      key: 'nullFieldEnemyMainTriggered',
      value: true,
    });
    // No OA detour
    expect(result.find((r) => r.type === IntentTypes.RaiseOpenAction)).toBeUndefined();
  });

  it('does NOT fire when enemy is NOT in nullField (regression)', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
      targetingRelations: { judged: [], marked: [], nullField: [] },
    });
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([nullPc, goblin]);
    const event: ActionEvent = { kind: 'main-action-used', actorId: 'mon-1' };
    const result = evaluateNull(state, event, testCtx);
    expect(result.filter((r) => r.type === 'GainResource')).toHaveLength(0);
    expect(result.find((r) => r.type === IntentTypes.RaiseOpenAction)).toBeUndefined();
  });

  it('does NOT fire when nullFieldEnemyMainTriggered latch is true', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
      targetingRelations: { judged: [], marked: [], nullField: ['mon-1'] },
    });
    nullPc.perEncounterFlags.perRound.nullFieldEnemyMainTriggered = true;
    const goblin = makeMonsterParticipant('mon-1');
    const state = stateWith([nullPc, goblin]);
    const event: ActionEvent = { kind: 'main-action-used', actorId: 'mon-1' };
    expect(evaluateNull(state, event, testCtx)).toEqual([]);
  });

  it('does NOT fire when the main-action actor is a PC (ally), not a monster', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
      targetingRelations: { judged: [], marked: [], nullField: ['ally-pc'] },
    });
    const ally = makeHeroParticipant('ally-pc', { className: 'Fury' });
    const state = stateWith([nullPc, ally]);
    const event: ActionEvent = { kind: 'main-action-used', actorId: 'ally-pc' };
    expect(evaluateNull(state, event, testCtx)).toEqual([]);
  });

  it('returns empty when main-action actor id matches no participant', () => {
    const nullPc = makeHeroParticipant('null-1', {
      className: 'Null',
      heroicResources: [{ name: 'discipline', value: 0, floor: 0 }],
    });
    const state = stateWith([nullPc]);
    const event: ActionEvent = { kind: 'main-action-used', actorId: 'ghost-1' };
    expect(evaluateNull(state, event, testCtx)).toEqual([]);
  });
});
