import { describe, expect, it } from 'vitest';
import type {
  ActionEvent,
  ActionTriggerContext,
} from '../../../src/class-triggers/action-triggers';
import { evaluate as evaluateTalent } from '../../../src/class-triggers/per-class/talent';
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

describe('class-triggers/per-class/talent.evaluate', () => {
  it('emits +1 clarity + per-round latch when a creature is force-moved (first time per round)', () => {
    const talent = makeHeroParticipant('talent-1', {
      className: 'Talent',
      heroicResources: [{ name: 'clarity', value: 0, floor: 0 }],
    });
    const state = stateWith([talent]);
    const event: ActionEvent = {
      kind: 'creature-force-moved',
      sourceId: 'mon-1',
      targetId: 'pc-2',
      subkind: 'push',
      distance: 2,
    };
    const result = evaluateTalent(state, event, testCtx);
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    expect(gain!.payload).toEqual({
      participantId: 'talent-1',
      name: 'clarity',
      amount: 1,
    });
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
    expect(gain!.source).toBe('server');
    const latch = result.find((r) => r.type === 'SetParticipantPerRoundFlag');
    expect(latch).toBeDefined();
    expect(latch!.payload).toEqual({
      participantId: 'talent-1',
      key: 'creatureForceMoved',
      value: true,
    });
  });

  it('credits each Talent independently with their own latch (two-Talent party)', () => {
    // Regression guard: ensures the per-Talent latch in the iteration is read
    // per participant, not a shared/global flag.
    const trout = makeHeroParticipant('talent-1', {
      className: 'Talent',
      heroicResources: [{ name: 'clarity', value: 0, floor: 0 }],
    });
    const otto = makeHeroParticipant('talent-2', {
      className: 'Talent',
      heroicResources: [{ name: 'clarity', value: 0, floor: 0 }],
    });
    // Talent-2 has already triggered this round; Talent-1 has not.
    otto.perEncounterFlags.perRound.creatureForceMoved = true;
    const state = stateWith([trout, otto]);
    const event: ActionEvent = {
      kind: 'creature-force-moved',
      sourceId: 'mon-1',
      targetId: 'pc-3',
      subkind: 'pull',
      distance: 1,
    };
    const result = evaluateTalent(state, event, testCtx);
    // Only talent-1 should emit (latch unflipped); talent-2 is gated.
    const gain1 = result.find(
      (r) =>
        r.type === 'GainResource' &&
        (r.payload as { participantId: string }).participantId === 'talent-1',
    );
    const gain2 = result.find(
      (r) =>
        r.type === 'GainResource' &&
        (r.payload as { participantId: string }).participantId === 'talent-2',
    );
    expect(gain1).toBeDefined();
    expect(gain2).toBeUndefined();
    const latch1 = result.find(
      (r) =>
        r.type === 'SetParticipantPerRoundFlag' &&
        (r.payload as { participantId: string }).participantId === 'talent-1',
    );
    expect(latch1).toBeDefined();
    expect((latch1!.payload as { key: string }).key).toBe('creatureForceMoved');
  });
});
