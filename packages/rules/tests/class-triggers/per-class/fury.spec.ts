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
// Canon (SC `Classes/Fury.md:90`, Heroes PDF p. ~10169): the per-round
// took-damage trigger grants **+1 ferocity flat** (the 1d3 belongs only to
// the per-encounter winded/dying triggers in stamina-transition.ts).

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

describe('class-triggers/per-class/fury.evaluate', () => {
  it('emits GainResource(ferocity=+1) + per-round latch when Fury takes damage (first time per round)', () => {
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
      // Canon: +1 flat per damage event (not 1d3).
      amount: 1,
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
});
