import { ParticipantSchema } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { getEffectiveWeaknesses, isImmuneToCondition } from './effective';

// Phase 2b Group A+B (slice 2) — read-site helper tests.
// Uses ParticipantSchema.parse so all required defaults fill in;
// we only override the fields each test cares about.
function makeP(overrides: Record<string, unknown> = {}) {
  return ParticipantSchema.parse({
    id: 'p1',
    name: 'Test',
    kind: 'pc',
    ownerId: 'u1',
    characterId: null,
    level: 1,
    currentStamina: 10,
    maxStamina: 10,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    ...overrides,
  });
}

describe('isImmuneToCondition', () => {
  it('returns false when conditionImmunities is empty', () => {
    expect(isImmuneToCondition(makeP(), 'Bleeding')).toBe(false);
  });
  it('returns true when condition is in conditionImmunities', () => {
    expect(isImmuneToCondition(makeP({ conditionImmunities: ['Bleeding'] }), 'Bleeding')).toBe(
      true,
    );
  });
  it('returns false when a DIFFERENT condition is immune', () => {
    expect(isImmuneToCondition(makeP({ conditionImmunities: ['Bleeding'] }), 'Dazed')).toBe(false);
  });
});

// Phase 2b Group A+B (slice 6) — getEffectiveWeaknesses tests.
//
// Echelon-1 (L1-3) Devil/Dragon Knight Wings-while-flying = +fire 5 over
// base weaknesses. Everything else passes the base list through.
describe('getEffectiveWeaknesses', () => {
  it('returns base when participant is not flying (movementMode null)', () => {
    const p = makeP({
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: null,
      weaknesses: [{ type: 'cold', value: 3 }],
    });
    expect(getEffectiveWeaknesses(p, p.level)).toEqual([{ type: 'cold', value: 3 }]);
  });

  it('adds fire 5 for a flying L1 Devil with Wings', () => {
    const p = makeP({
      level: 1,
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 2 },
    });
    expect(getEffectiveWeaknesses(p, p.level)).toEqual([{ type: 'fire', value: 5 }]);
  });

  it('adds fire 5 for a flying L3 Dragon Knight with Wings', () => {
    const p = makeP({
      level: 3,
      ancestry: ['dragon-knight'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 1 },
      weaknesses: [{ type: 'lightning', value: 5 }],
    });
    expect(getEffectiveWeaknesses(p, p.level)).toEqual([
      { type: 'lightning', value: 5 },
      { type: 'fire', value: 5 },
    ]);
  });

  it('does NOT add fire 5 for L4+ flying Devil (echelon-2)', () => {
    const p = makeP({
      level: 4,
      ancestry: ['devil'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 3 },
    });
    expect(getEffectiveWeaknesses(p, p.level)).toEqual([]);
  });

  it('does NOT add fire 5 when flying without the Wings trait', () => {
    const p = makeP({
      level: 1,
      ancestry: ['devil'],
      purchasedTraits: [],
      movementMode: { mode: 'flying', roundsRemaining: 1 },
    });
    expect(getEffectiveWeaknesses(p, p.level)).toEqual([]);
  });

  it('does NOT add fire 5 for a shadow-mode participant (Shadowmeld)', () => {
    const p = makeP({
      level: 1,
      ancestry: ['polder'],
      purchasedTraits: ['shadowmeld'],
      movementMode: { mode: 'shadow', roundsRemaining: 0 },
    });
    expect(getEffectiveWeaknesses(p, p.level)).toEqual([]);
  });

  it('does NOT add fire 5 when wings slug appears on a wrong-ancestry PC (slug collision guard)', () => {
    const p = makeP({
      level: 1,
      ancestry: ['polder'],
      purchasedTraits: ['wings'],
      movementMode: { mode: 'flying', roundsRemaining: 1 },
    });
    expect(getEffectiveWeaknesses(p, p.level)).toEqual([]);
  });
});
