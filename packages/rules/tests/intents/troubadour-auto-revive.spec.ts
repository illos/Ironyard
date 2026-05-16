import { defaultPerEncounterFlags } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { applyTroubadourAutoRevive } from '../../src/intents/troubadour-auto-revive';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
  stamped,
} from './test-utils';

// Pass 3 Slice 2a Task 20 — direct unit tests for the TroubadourAutoRevive
// reducer. Server-only intent triggered when a posthumous-eligible Troubadour
// crosses 30 Drama: restored to 1 stamina, drama reset to 0, posthumous flag
// cleared, per-encounter latch cleared, staminaState recomputed to 'winded'.

const PC_ID = 'pc:troub-1';

function stateWith(participants: ReturnType<typeof makeHeroParticipant>[], currentRound = 1) {
  return baseState({
    currentSessionId: 'sess-1',
    participants,
    encounter: makeRunningEncounterPhase('enc-1', { currentRound }),
  });
}

describe('applyTroubadourAutoRevive', () => {
  it('sets stamina to 1, resets drama, clears flags, recomputes to winded', () => {
    const troub = makeHeroParticipant(PC_ID, {
      className: 'Troubadour',
      currentStamina: -15, // dead (maxStamina 30 → windedValue 15)
      staminaState: 'dead',
      posthumousDramaEligible: true,
      heroicResources: [{ name: 'drama', value: 30, floor: 0 }],
      perEncounterFlags: {
        ...defaultPerEncounterFlags(),
        perEncounter: {
          ...defaultPerEncounterFlags().perEncounter,
          troubadourReviveOARaised: true,
        },
      },
    });
    const state = stateWith([troub], 2);
    const startSeq = state.seq;
    const result = applyTroubadourAutoRevive(
      state,
      stamped({
        type: 'TroubadourAutoRevive',
        actor: ownerActor,
        payload: { participantId: PC_ID },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.derived).toEqual([]);
    expect(result.state.seq).toBe(startSeq + 1);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.currentStamina).toBe(1);
    expect(updated.posthumousDramaEligible).toBe(false);
    expect(updated.perEncounterFlags.perEncounter.troubadourReviveOARaised).toBe(false);
    const dramaResource = updated.heroicResources.find((r) => r.name === 'drama');
    expect(dramaResource?.value).toBe(0);
    // currentStamina=1 with maxStamina=30 → windedValue=15 → 1 ≤ 15 → 'winded'.
    expect(updated.staminaState).toBe('winded');
    expect(result.log[0]?.kind).toBe('info');
  });

  it('no-changes drama resource when participant has no drama in heroicResources', () => {
    const troub = makeHeroParticipant(PC_ID, {
      className: 'Troubadour',
      currentStamina: -15,
      staminaState: 'dead',
      posthumousDramaEligible: true,
      heroicResources: [], // no drama row
    });
    const state = stateWith([troub], 1);
    const result = applyTroubadourAutoRevive(
      state,
      stamped({
        type: 'TroubadourAutoRevive',
        actor: ownerActor,
        payload: { participantId: PC_ID },
      }),
    );
    expect(result.errors ?? []).toEqual([]);
    const updated = result.state.participants.find((p) => p.id === PC_ID)!;
    expect(updated.heroicResources).toEqual([]);
    expect(updated.currentStamina).toBe(1);
    expect(updated.staminaState).toBe('winded');
  });

  it('rejects when participant is not found', () => {
    const state = stateWith([], 1);
    const result = applyTroubadourAutoRevive(
      state,
      stamped({
        type: 'TroubadourAutoRevive',
        actor: ownerActor,
        payload: { participantId: 'pc:missing' },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('participant_not_found');
    expect(result.state.seq).toBe(state.seq);
  });

  it('rejects when participant is not a PC', () => {
    const monster = makeMonsterParticipant('mon:1');
    const state = stateWith([monster as ReturnType<typeof makeHeroParticipant>], 1);
    const result = applyTroubadourAutoRevive(
      state,
      stamped({
        type: 'TroubadourAutoRevive',
        actor: ownerActor,
        payload: { participantId: 'mon:1' },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('participant_not_found');
    expect(result.state.seq).toBe(state.seq);
  });

  it('rejects on invalid payload', () => {
    const state = stateWith([], 1);
    const result = applyTroubadourAutoRevive(
      state,
      stamped({
        type: 'TroubadourAutoRevive',
        actor: ownerActor,
        payload: { participantId: '' },
      }),
    );
    expect(result.errors?.[0]?.code).toBe('invalid_payload');
    expect(result.state.seq).toBe(state.seq);
  });
});
