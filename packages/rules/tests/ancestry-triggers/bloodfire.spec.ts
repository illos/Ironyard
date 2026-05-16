import type { Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { evaluateOnDamageApplied, evaluateOnEndRound } from '../../src/ancestry-triggers';
import { hasBloodfireRush } from '../../src/ancestry-triggers/bloodfire';
import { getEffectiveSpeed } from '../../src/effective';
import {
  baseState,
  makeHeroParticipant,
  makeMonsterParticipant,
  makeRunningEncounterPhase,
  ownerActor,
} from '../intents/test-utils';

// Phase 2b Group A+B (slice 8) — Orc Bloodfire Rush.
// Canon: "The first time in any combat round that you take damage, you gain
// a +2 bonus to speed until the end of the round."

function orcHero(overrides: Partial<Participant> = {}) {
  return makeHeroParticipant('pc-orc', {
    ownerId: 'u-orc',
    ancestry: ['orc'],
    purchasedTraits: ['bloodfire-rush'],
    speed: 5,
    ...overrides,
  });
}

describe('ancestry-triggers/bloodfire — hasBloodfireRush guard', () => {
  it('returns true for Orc with bloodfire-rush trait', () => {
    expect(hasBloodfireRush(orcHero())).toBe(true);
  });

  it('returns false for Orc without the trait', () => {
    expect(hasBloodfireRush(orcHero({ purchasedTraits: [] }))).toBe(false);
  });

  it('returns false for non-Orc with the trait slug (slug-collision defense)', () => {
    const human = makeHeroParticipant('pc-human', {
      ancestry: ['human'],
      purchasedTraits: ['bloodfire-rush'],
    });
    expect(hasBloodfireRush(human)).toBe(false);
  });
});

describe('ancestry-triggers/bloodfire — onDamageApplied (first-damage latch)', () => {
  it('emits SetBloodfireActive { active: true } on first delivered damage of round', () => {
    const hero = orcHero({ bloodfireActive: false });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnDamageApplied(
      state,
      { targetId: 'pc-orc', dealerId: null, delivered: 5 },
      { actor: ownerActor },
    );
    expect(derived).toHaveLength(1);
    expect(derived[0]!.type).toBe('SetBloodfireActive');
    expect(derived[0]!.payload).toEqual({ participantId: 'pc-orc', active: true });
  });

  it('does NOT re-emit when bloodfireActive already true (latch held)', () => {
    const hero = orcHero({ bloodfireActive: true });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnDamageApplied(
      state,
      { targetId: 'pc-orc', dealerId: null, delivered: 5 },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT emit when delivered === 0 (no damage actually landed)', () => {
    const hero = orcHero({ bloodfireActive: false });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnDamageApplied(
      state,
      { targetId: 'pc-orc', dealerId: null, delivered: 0 },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT fire for an Orc WITHOUT the trait', () => {
    const hero = orcHero({ purchasedTraits: [] });
    const state = baseState({
      participants: [hero],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnDamageApplied(
      state,
      { targetId: 'pc-orc', dealerId: null, delivered: 5 },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT fire for a non-Orc with the slug (slug collision)', () => {
    const human = makeHeroParticipant('pc-human', {
      ancestry: ['human'],
      purchasedTraits: ['bloodfire-rush'],
    });
    const state = baseState({
      participants: [human],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnDamageApplied(
      state,
      { targetId: 'pc-human', dealerId: null, delivered: 5 },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });

  it('does NOT fire for a monster (kind !== pc)', () => {
    const monster = makeMonsterParticipant('mon-1');
    const state = baseState({
      participants: [monster],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnDamageApplied(
      state,
      { targetId: 'mon-1', dealerId: null, delivered: 5 },
      { actor: ownerActor },
    );
    expect(derived).toEqual([]);
  });
});

describe('ancestry-triggers/bloodfire — onEndRound (sweep + clear)', () => {
  it('emits SetBloodfireActive { active: false } for every bloodfireActive participant', () => {
    const orc = orcHero({ bloodfireActive: true });
    const other = makeHeroParticipant('pc-other', {
      ancestry: ['orc'],
      purchasedTraits: ['bloodfire-rush'],
      bloodfireActive: true,
    });
    const state = baseState({
      participants: [orc, other],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnEndRound(state, { actor: ownerActor });
    const clears = derived.filter((d) => d.type === 'SetBloodfireActive');
    expect(clears).toHaveLength(2);
    expect(clears.every((c) => c.payload && (c.payload as { active: boolean }).active === false))
      .toBe(true);
  });

  it('does NOT emit for a participant whose bloodfireActive is already false', () => {
    const orc = orcHero({ bloodfireActive: false });
    const state = baseState({
      participants: [orc],
      encounter: makeRunningEncounterPhase('enc-1'),
    });
    const derived = evaluateOnEndRound(state, { actor: ownerActor });
    const clears = derived.filter((d) => d.type === 'SetBloodfireActive');
    expect(clears).toEqual([]);
  });
});

describe('effective.getEffectiveSpeed — Bloodfire +2', () => {
  it('returns base speed when bloodfireActive is false', () => {
    const p = orcHero({ speed: 5, bloodfireActive: false });
    expect(getEffectiveSpeed(p)).toBe(5);
  });

  it('returns base + 2 when bloodfireActive is true', () => {
    const p = orcHero({ speed: 5, bloodfireActive: true });
    expect(getEffectiveSpeed(p)).toBe(7);
  });

  it('handles null base speed defensively (treats null as 0)', () => {
    const p = orcHero({ speed: null, bloodfireActive: true });
    expect(getEffectiveSpeed(p)).toBe(2);
  });
});
