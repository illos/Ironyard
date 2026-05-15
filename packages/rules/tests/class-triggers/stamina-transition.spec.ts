import type { StaminaTransitionedPayload } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { evaluateStaminaTransitionTriggers } from '../../src/class-triggers/stamina-transition';
import type { CampaignState } from '../../src/types';
import { baseState, makeHeroParticipant, makeRunningEncounterPhase } from '../intents/test-utils';

// Class is resolved off Participant.className, which StartEncounter stamps from
// the static class record (case-insensitive on the resolver side — see
// resolveParticipantClass). We pass capitalized class names exactly as they
// flow through production (`class.name`).
function stateWith(participants: ReturnType<typeof makeHeroParticipant>[]): CampaignState {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1'),
  });
}

function transition(
  participantId: string,
  to: StaminaTransitionedPayload['to'],
  from: StaminaTransitionedPayload['from'] = 'healthy',
  cause: StaminaTransitionedPayload['cause'] = 'damage',
): StaminaTransitionedPayload {
  return { participantId, from, to, cause };
}

describe('evaluateStaminaTransitionTriggers', () => {
  it('returns empty when no Fury / Troubadour exists in state', () => {
    const state = stateWith([
      makeHeroParticipant('pc-1', { className: 'Censor' }),
      makeHeroParticipant('pc-2', { className: null }),
    ]);
    const result = evaluateStaminaTransitionTriggers(transition('pc-1', 'winded'), state);
    expect(result).toEqual([]);
  });

  it('emits GainResource(ferocity) + SetParticipantPerEncounterLatch when Fury first goes winded', () => {
    const fury = makeHeroParticipant('fury-1', {
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
    });
    const state = stateWith([fury]);
    const result = evaluateStaminaTransitionTriggers(transition('fury-1', 'winded'), state);
    // GainResource + SetParticipantPerEncounterLatch
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    const gainPayload = gain!.payload as { participantId: string; name: string; amount: number };
    expect(gainPayload.participantId).toBe('fury-1');
    expect(gainPayload.name).toBe('ferocity');
    expect(gainPayload.amount).toBeGreaterThanOrEqual(1);
    expect(gainPayload.amount).toBeLessThanOrEqual(3);
    const latch = result.find((r) => r.type === 'SetParticipantPerEncounterLatch');
    expect(latch).toBeDefined();
    const latchPayload = latch!.payload as {
      participantId: string;
      key: string;
      value: boolean;
    };
    expect(latchPayload).toEqual({
      participantId: 'fury-1',
      key: 'firstTimeWindedTriggered',
      value: true,
    });
  });

  it('does NOT emit when Fury winded latch is already flipped', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    fury.perEncounterFlags.perEncounter.firstTimeWindedTriggered = true;
    const state = stateWith([fury]);
    const result = evaluateStaminaTransitionTriggers(transition('fury-1', 'winded'), state);
    expect(result).toEqual([]);
  });

  it('emits +10 drama to every Troubadour when any hero dies', () => {
    const trou = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 5, floor: 0 }],
    });
    const victim = makeHeroParticipant('pc-victim', { className: 'Fury' });
    const state = stateWith([trou, victim]);
    const result = evaluateStaminaTransitionTriggers(
      transition('pc-victim', 'dead', 'dying'),
      state,
    );
    const gain = result.find(
      (r) =>
        r.type === 'GainResource' &&
        (r.payload as { participantId: string }).participantId === 'trou-1',
    );
    expect(gain).toBeDefined();
    const payload = gain!.payload as { name: string; amount: number };
    expect(payload.name).toBe('drama');
    expect(payload.amount).toBe(10);
  });

  it('sets posthumousDramaEligible when a Troubadour dies', () => {
    const trou = makeHeroParticipant('trou-1', { className: 'Troubadour' });
    const state = stateWith([trou]);
    const result = evaluateStaminaTransitionTriggers(transition('trou-1', 'dead', 'dying'), state);
    const flagSet = result.find((r) => r.type === 'SetParticipantPosthumousDramaEligible');
    expect(flagSet).toBeDefined();
    expect(flagSet!.payload).toEqual({ participantId: 'trou-1', value: true });
  });
});
