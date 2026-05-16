import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateFury } from '../../../src/class-triggers/per-class/fury';
import type { CampaignState } from '../../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
} from '../../intents/test-utils';

// Pass 3 Slice 2a — Fury Ferocity (per-event) action triggers.
//
// Purity contract: ctx.rolls.ferocityD3 must be supplied at the impure call
// site (Task 21 wires apply-damage.ts). Tests pin it to 2 for deterministic
// amount assertions.

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

describe('class-triggers/per-class/fury.evaluate', () => {
  it('emits GainResource(ferocity=ferocityD3) + per-round latch when Fury takes damage (first time per round)', () => {
    const fury = makeHeroParticipant('fury-1', {
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
    });
    const state = stateWith([fury]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: null,
      targetId: 'fury-1',
      amount: 7,
      type: 'fire',
    };
    const result = evaluateFury(state, event, testCtx);
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({
      participantId: 'fury-1',
      name: 'ferocity',
      // Deterministic: ctx.rolls.ferocityD3 === 2.
      amount: 2,
    });
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(gain!.source).toBe('server');
    const latch = result.find((r) => r.type === 'SetParticipantPerRoundFlag');
    expect(latch).toBeDefined();
    expect(latch!.payload).toEqual({
      participantId: 'fury-1',
      key: 'tookDamage',
      value: true,
    });
  });

  it('does NOT emit when Fury per-round tookDamage latch is already flipped', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    fury.perEncounterFlags.perRound.tookDamage = true;
    const state = stateWith([fury]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: null,
      targetId: 'fury-1',
      amount: 4,
      type: 'fire',
    };
    expect(evaluateFury(state, event, testCtx)).toEqual([]);
  });

  it('throws a developer error if Fury fires without a pre-rolled ferocityD3', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const state = stateWith([fury]);
    const event: ActionEvent = {
      kind: 'damage-applied',
      dealerId: null,
      targetId: 'fury-1',
      amount: 4,
      type: 'fire',
    };
    const badCtx: ActionTriggerContext = {
      actor: { userId: 'test-user', role: 'director' },
      rolls: {},
    };
    expect(() => evaluateFury(state, event, badCtx)).toThrow(/ferocityD3 was not supplied/);
  });
});
