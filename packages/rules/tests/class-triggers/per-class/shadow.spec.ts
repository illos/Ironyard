import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateShadow } from '../../../src/class-triggers/per-class/shadow';
import type { CampaignState } from '../../../src/types';
import {
  baseState,
  makeHeroParticipant,
  makeRunningEncounterPhase,
} from '../../intents/test-utils';

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

describe('class-triggers/per-class/shadow.evaluate', () => {
  it('emits +1 insight + per-round latch when Shadow spends surge to deal damage (first time per round)', () => {
    const shadow = makeHeroParticipant('shadow-1', {
      className: 'Shadow',
      heroicResources: [{ name: 'insight', value: 0, floor: 0 }],
    });
    const state = stateWith([shadow]);
    const event: ActionEvent = {
      kind: 'surge-spent-with-damage',
      actorId: 'shadow-1',
      surgesSpent: 2,
      damageType: 'fire',
    };
    const result = evaluateShadow(state, event, testCtx);
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({
      participantId: 'shadow-1',
      name: 'insight',
      amount: 1,
    });
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(gain!.source).toBe('server');
    const latch = result.find((r) => r.type === 'SetParticipantPerRoundFlag');
    expect(latch).toBeDefined();
    expect(latch!.payload).toEqual({
      participantId: 'shadow-1',
      key: 'dealtSurgeDamage',
      value: true,
    });
  });

  it('does NOT emit when Shadow per-round dealtSurgeDamage latch is already flipped', () => {
    const shadow = makeHeroParticipant('shadow-1', { className: 'Shadow' });
    shadow.perEncounterFlags.perRound.dealtSurgeDamage = true;
    const state = stateWith([shadow]);
    const event: ActionEvent = {
      kind: 'surge-spent-with-damage',
      actorId: 'shadow-1',
      surgesSpent: 1,
      damageType: 'fire',
    };
    expect(evaluateShadow(state, event, testCtx)).toEqual([]);
  });

  it('does NOT emit when the actor is not a Shadow', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const state = stateWith([fury]);
    const event: ActionEvent = {
      kind: 'surge-spent-with-damage',
      actorId: 'fury-1',
      surgesSpent: 1,
      damageType: 'fire',
    };
    expect(evaluateShadow(state, event, testCtx)).toEqual([]);
  });
});
