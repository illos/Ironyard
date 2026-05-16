import type { StaminaTransitionedPayload } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import {
  type StaminaTransitionTriggerContext,
  evaluateStaminaTransitionTriggers,
} from '../../src/class-triggers/stamina-transition';
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

// Deterministic ctx for trigger evaluation. Real callers (Task 16's stamina.ts)
// generate ferocityD3 at the impure boundary; tests pin it so amount assertions
// don't have to bounds-check.
const testCtx: StaminaTransitionTriggerContext = {
  actor: { userId: 'test-user', role: 'director' },
  rolls: { ferocityD3: 2 },
};

describe('evaluateStaminaTransitionTriggers', () => {
  it('returns empty when no Fury / Troubadour exists in state', () => {
    const state = stateWith([
      makeHeroParticipant('pc-1', { className: 'Censor' }),
      makeHeroParticipant('pc-2', { className: null }),
    ]);
    const result = evaluateStaminaTransitionTriggers(transition('pc-1', 'winded'), state, testCtx);
    expect(result).toEqual([]);
  });

  it('emits GainResource(ferocity) + SetParticipantPerEncounterLatch when Fury first goes winded', () => {
    const fury = makeHeroParticipant('fury-1', {
      className: 'Fury',
      heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
    });
    const state = stateWith([fury]);
    const result = evaluateStaminaTransitionTriggers(
      transition('fury-1', 'winded'),
      state,
      testCtx,
    );
    // GainResource + SetParticipantPerEncounterLatch
    expect(result).toHaveLength(2);
    const gain = result.find((r) => r.type === 'GainResource');
    expect(gain).toBeDefined();
    const gainPayload = gain!.payload as { participantId: string; name: string; amount: number };
    expect(gainPayload.participantId).toBe('fury-1');
    expect(gainPayload.name).toBe('ferocity');
    // Deterministic: ctx.rolls.ferocityD3 === 2.
    expect(gainPayload.amount).toBe(2);
    // Attribution: derived intents carry the caller's actor, not a synthesized server identity.
    expect(gain!.actor).toEqual({ userId: 'test-user', role: 'director' });
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
    expect(latch!.actor).toEqual({ userId: 'test-user', role: 'director' });
  });

  it('does NOT emit when Fury winded latch is already flipped', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    fury.perEncounterFlags.perEncounter.firstTimeWindedTriggered = true;
    const state = stateWith([fury]);
    const result = evaluateStaminaTransitionTriggers(
      transition('fury-1', 'winded'),
      state,
      testCtx,
    );
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
      testCtx,
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
    const result = evaluateStaminaTransitionTriggers(
      transition('trou-1', 'dead', 'dying'),
      state,
      testCtx,
    );
    const flagSet = result.find((r) => r.type === 'SetParticipantPosthumousDramaEligible');
    expect(flagSet).toBeDefined();
    expect(flagSet!.payload).toEqual({ participantId: 'trou-1', value: true });
  });

  it('emits +10 drama to BOTH Troubadours when a third hero dies (multi-Troubadour iteration)', () => {
    // Regression guard: ensures the `for…of` loop in fire() is not silently swapped
    // for `.find()` (which would only credit the first Troubadour found).
    const trou1 = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const trou2 = makeHeroParticipant('trou-2', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const victim = makeHeroParticipant('pc-victim', { className: 'Fury' });
    const state = stateWith([trou1, trou2, victim]);
    const result = evaluateStaminaTransitionTriggers(
      transition('pc-victim', 'dead', 'dying'),
      state,
      testCtx,
    );

    const gain1 = result.find(
      (r) =>
        r.type === 'GainResource' &&
        (r.payload as { participantId: string }).participantId === 'trou-1',
    );
    const gain2 = result.find(
      (r) =>
        r.type === 'GainResource' &&
        (r.payload as { participantId: string }).participantId === 'trou-2',
    );
    expect(gain1).toBeDefined();
    expect(gain2).toBeDefined();
    expect(gain1!.payload as { name: string; amount: number }).toEqual({
      participantId: 'trou-1',
      name: 'drama',
      amount: 10,
    });
    expect(gain2!.payload as { name: string; amount: number }).toEqual({
      participantId: 'trou-2',
      name: 'drama',
      amount: 10,
    });
  });

  it('emits +2 drama to BOTH Troubadours when any hero becomes winded (multi-Troubadour iteration)', () => {
    // Same regression guard for the any-hero-winded entry, which also iterates
    // over all matching Troubadours.
    const trou1 = makeHeroParticipant('trou-1', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const trou2 = makeHeroParticipant('trou-2', {
      className: 'Troubadour',
      heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
    });
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const state = stateWith([trou1, trou2, fury]);
    const result = evaluateStaminaTransitionTriggers(
      transition('fury-1', 'winded'),
      state,
      testCtx,
    );

    const gain1 = result.find(
      (r) =>
        r.type === 'GainResource' &&
        (r.payload as { participantId: string }).participantId === 'trou-1',
    );
    const gain2 = result.find(
      (r) =>
        r.type === 'GainResource' &&
        (r.payload as { participantId: string }).participantId === 'trou-2',
    );
    expect(gain1).toBeDefined();
    expect(gain2).toBeDefined();
    expect((gain1!.payload as { name: string; amount: number }).amount).toBe(2);
    expect((gain2!.payload as { name: string; amount: number }).amount).toBe(2);

    // Troubadour latches flipped for both Troubadours. (The Fury also emits its
    // own firstTimeWindedTriggered latch for fury-1 — we don't assert on that
    // here; it's covered by the Fury winded test above.)
    const trouLatchTargets = result
      .filter(
        (r) =>
          r.type === 'SetParticipantPerEncounterLatch' &&
          (r.payload as { key: string }).key === 'troubadourAnyHeroWindedTriggered',
      )
      .map((r) => (r.payload as { participantId: string }).participantId)
      .sort();
    expect(trouLatchTargets).toEqual(['trou-1', 'trou-2']);
  });

  it('throws a developer error if a Fury entry fires without a pre-rolled ferocityD3', () => {
    const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
    const state = stateWith([fury]);
    const badCtx: StaminaTransitionTriggerContext = {
      actor: { userId: 'test-user', role: 'director' },
      rolls: {},
    };
    expect(() =>
      evaluateStaminaTransitionTriggers(transition('fury-1', 'winded'), state, badCtx),
    ).toThrow(/ferocityD3 was not supplied/);
  });

  // Cause-filter follow-up (Task 16 review). Damage-caused transitions are the
  // only ones that grant Fury Ferocity or Troubadour any-hero-winded drama.
  // Healing a downed Fury back into winded must NOT fire Ferocity (and must
  // NOT throw on missing ferocityD3 — see apply-heal.spec.ts regression test).
  describe('cause filter', () => {
    const noRollsCtx: StaminaTransitionTriggerContext = {
      actor: { userId: 'test-user', role: 'director' },
      rolls: {}, // intentionally empty — would throw if a Fury entry matched
    };

    it('Fury winded does NOT fire when cause is heal (and does not throw)', () => {
      const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
      const state = stateWith([fury]);
      expect(() =>
        evaluateStaminaTransitionTriggers(
          transition('fury-1', 'winded', 'dying', 'heal'),
          state,
          noRollsCtx,
        ),
      ).not.toThrow();
      const result = evaluateStaminaTransitionTriggers(
        transition('fury-1', 'winded', 'dying', 'heal'),
        state,
        noRollsCtx,
      );
      expect(result).toEqual([]);
    });

    it('Fury dying does NOT fire when cause is override-applied (and does not throw)', () => {
      const fury = makeHeroParticipant('fury-1', { className: 'Fury' });
      const state = stateWith([fury]);
      const result = evaluateStaminaTransitionTriggers(
        transition('fury-1', 'dying', 'winded', 'override-applied'),
        state,
        noRollsCtx,
      );
      expect(result).toEqual([]);
    });

    it('Fury winded DOES fire when cause is damage (sanity)', () => {
      const fury = makeHeroParticipant('fury-1', {
        className: 'Fury',
        heroicResources: [{ name: 'ferocity', value: 0, floor: 0 }],
      });
      const state = stateWith([fury]);
      const result = evaluateStaminaTransitionTriggers(
        transition('fury-1', 'winded', 'healthy', 'damage'),
        state,
        testCtx,
      );
      expect(result.some((r) => r.type === 'GainResource')).toBe(true);
    });

    it('Troubadour any-hero-winded does NOT fire when cause is heal', () => {
      const trou = makeHeroParticipant('trou-1', {
        className: 'Troubadour',
        heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
      });
      const victim = makeHeroParticipant('pc-victim', { className: 'Censor' });
      const state = stateWith([trou, victim]);
      const result = evaluateStaminaTransitionTriggers(
        transition('pc-victim', 'winded', 'dying', 'heal'),
        state,
        testCtx,
      );
      expect(result.filter((r) => r.type === 'GainResource')).toEqual([]);
      expect(result.filter((r) => r.type === 'SetParticipantPerEncounterLatch')).toEqual([]);
    });

    it('Troubadour any-hero-winded DOES fire when cause is damage (sanity)', () => {
      const trou = makeHeroParticipant('trou-1', {
        className: 'Troubadour',
        heroicResources: [{ name: 'drama', value: 0, floor: 0 }],
      });
      const victim = makeHeroParticipant('pc-victim', { className: 'Censor' });
      const state = stateWith([trou, victim]);
      const result = evaluateStaminaTransitionTriggers(
        transition('pc-victim', 'winded', 'healthy', 'damage'),
        state,
        testCtx,
      );
      const gain = result.find(
        (r) =>
          r.type === 'GainResource' &&
          (r.payload as { participantId: string }).participantId === 'trou-1',
      );
      expect(gain).toBeDefined();
    });

    it('Troubadour hero-dies remains unfiltered by cause (encounter-end doomed death still grants drama)', () => {
      // Per spec point 4/5: death should grant drama regardless of cause —
      // dieAtEncounterEnd on a doomed PC uses `cause: 'encounter-end'` and
      // must still credit the Troubadour and set posthumousDramaEligible.
      const trou = makeHeroParticipant('trou-1', {
        className: 'Troubadour',
        heroicResources: [{ name: 'drama', value: 5, floor: 0 }],
      });
      const victim = makeHeroParticipant('pc-victim', { className: 'Fury' });
      const state = stateWith([trou, victim]);
      const result = evaluateStaminaTransitionTriggers(
        transition('pc-victim', 'dead', 'doomed', 'encounter-end'),
        state,
        testCtx,
      );
      const gain = result.find(
        (r) =>
          r.type === 'GainResource' &&
          (r.payload as { participantId: string }).participantId === 'trou-1',
      );
      expect(gain).toBeDefined();
      expect((gain!.payload as { amount: number }).amount).toBe(10);
    });
  });
});
