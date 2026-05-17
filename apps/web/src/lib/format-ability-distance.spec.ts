import type { Ability, Participant } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { formatAbilityDistance } from './format-ability-distance';

// Slice 10 / Phase 2b Group A+B (2b.3) — display-time fold of kit distance
// bonuses into the AbilityCard distance header. Canon (Kits.md:135 + 142-146).

function makeAbility(overrides: Partial<Ability> = {}): Ability {
  return {
    id: 'test-ability',
    name: 'Test Ability',
    type: 'action',
    keywords: [],
    raw: '',
    cost: 3,
    tier: null,
    isSubclass: false,
    sourceClassId: null,
    targetCharacteristic: null,
    ...overrides,
  } as Ability;
}

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'p1',
    name: 'P',
    meleeDistanceBonus: 0,
    rangedDistanceBonus: 0,
    ...overrides,
  } as unknown as Participant;
}

describe('formatAbilityDistance', () => {
  it('returns empty string when ability has no distance', () => {
    expect(formatAbilityDistance(makeAbility(), null)).toBe('');
  });

  it('passes through raw distance when participant is null', () => {
    expect(formatAbilityDistance(makeAbility({ distance: 'Melee 1' }), null)).toBe('Melee 1');
  });

  it('folds meleeDistanceBonus into "Melee N"', () => {
    const ab = makeAbility({ distance: 'Melee 1' });
    const p = makeParticipant({ meleeDistanceBonus: 1 });
    expect(formatAbilityDistance(ab, p)).toBe('Melee 2');
  });

  it('folds rangedDistanceBonus into "Ranged N"', () => {
    const ab = makeAbility({ distance: 'Ranged 10' });
    const p = makeParticipant({ rangedDistanceBonus: 10 });
    expect(formatAbilityDistance(ab, p)).toBe('Ranged 20');
  });

  it('does NOT fold the melee bonus into a "Ranged" distance', () => {
    const ab = makeAbility({ distance: 'Ranged 10' });
    const p = makeParticipant({ meleeDistanceBonus: 5, rangedDistanceBonus: 0 });
    expect(formatAbilityDistance(ab, p)).toBe('Ranged 10');
  });

  it('does NOT fold the ranged bonus into a "Melee" distance', () => {
    const ab = makeAbility({ distance: 'Melee 1' });
    const p = makeParticipant({ rangedDistanceBonus: 5, meleeDistanceBonus: 0 });
    expect(formatAbilityDistance(ab, p)).toBe('Melee 1');
  });

  it('does NOT fold the bonus for signature abilities (cost === 0)', () => {
    // Canon caveat (Kits.md:142-146) — signature abilities bake the kit
    // bonus in; folding here would double-add.
    const ab = makeAbility({ distance: 'Ranged 10', cost: 0 });
    const p = makeParticipant({ rangedDistanceBonus: 10 });
    expect(formatAbilityDistance(ab, p)).toBe('Ranged 10');
  });

  it('passes Burst N through unchanged (AoE shapes not adjusted)', () => {
    const ab = makeAbility({ distance: 'Burst 3' });
    const p = makeParticipant({ meleeDistanceBonus: 5, rangedDistanceBonus: 5 });
    expect(formatAbilityDistance(ab, p)).toBe('Burst 3');
  });

  it('passes Cube N within Y through unchanged (AoE shapes not adjusted)', () => {
    const ab = makeAbility({ distance: 'Cube 3 within 10' });
    const p = makeParticipant({ meleeDistanceBonus: 5, rangedDistanceBonus: 5 });
    expect(formatAbilityDistance(ab, p)).toBe('Cube 3 within 10');
  });

  it('passes Self / Aura / Line through unchanged', () => {
    const p = makeParticipant({ meleeDistanceBonus: 5, rangedDistanceBonus: 5 });
    expect(formatAbilityDistance(makeAbility({ distance: 'Self' }), p)).toBe('Self');
    expect(formatAbilityDistance(makeAbility({ distance: 'Aura 1' }), p)).toBe('Aura 1');
    expect(formatAbilityDistance(makeAbility({ distance: 'Line 4 x 1' }), p)).toBe('Line 4 x 1');
  });

  it('returns raw when participant bonus is 0 (no display drift)', () => {
    const ab = makeAbility({ distance: 'Melee 1' });
    const p = makeParticipant({ meleeDistanceBonus: 0 });
    expect(formatAbilityDistance(ab, p)).toBe('Melee 1');
  });
});
