import { ParticipantSchema } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { isImmuneToCondition } from './effective';

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
