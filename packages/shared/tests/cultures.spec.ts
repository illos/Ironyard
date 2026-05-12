import { describe, expect, it } from 'vitest';
import {
  ARCHETYPICAL_CULTURES,
  TYPICAL_ANCESTRY_CULTURES,
  getTypicalAncestryCulture,
} from '../src/data/cultures';

describe('TYPICAL_ANCESTRY_CULTURES', () => {
  it('covers all 11 non-revenant ancestries', () => {
    const ids = Object.keys(TYPICAL_ANCESTRY_CULTURES).sort();
    expect(ids).toEqual([
      'devil', 'dragon-knight', 'dwarf', 'hakaan', 'high-elf',
      'human', 'memonek', 'orc', 'polder', 'time-raider', 'wode-elf',
    ]);
  });

  it('does not include revenant', () => {
    expect(TYPICAL_ANCESTRY_CULTURES['revenant']).toBeUndefined();
  });

  it('Dwarf is Zaliac / secluded / bureaucratic / creative', () => {
    expect(TYPICAL_ANCESTRY_CULTURES['dwarf']).toEqual({
      ancestryId: 'dwarf',
      language: 'Zaliac',
      environment: 'secluded',
      organization: 'bureaucratic',
      upbringing: 'creative',
    });
  });
});

describe('ARCHETYPICAL_CULTURES', () => {
  it('has 16 entries', () => {
    expect(ARCHETYPICAL_CULTURES.length).toBe(16);
  });

  it('all entries have valid environment / organization / upbringing values', () => {
    const validEnv = new Set(['nomadic', 'rural', 'secluded', 'urban', 'wilderness']);
    const validOrg = new Set(['bureaucratic', 'communal']);
    const validUpb = new Set(['academic', 'creative', 'labor', 'lawless', 'martial', 'noble']);
    for (const c of ARCHETYPICAL_CULTURES) {
      expect(validEnv.has(c.environment)).toBe(true);
      expect(validOrg.has(c.organization)).toBe(true);
      expect(validUpb.has(c.upbringing)).toBe(true);
    }
  });

  it('Knightly Order is secluded / bureaucratic / martial', () => {
    const ko = ARCHETYPICAL_CULTURES.find((c) => c.id === 'knightly-order');
    expect(ko).toEqual({
      id: 'knightly-order',
      name: 'Knightly Order',
      environment: 'secluded',
      organization: 'bureaucratic',
      upbringing: 'martial',
    });
  });
});

describe('getTypicalAncestryCulture', () => {
  it('returns the entry for a known ancestry', () => {
    expect(getTypicalAncestryCulture('dwarf')?.language).toBe('Zaliac');
  });

  it('returns null for revenant', () => {
    expect(getTypicalAncestryCulture('revenant')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(getTypicalAncestryCulture(null)).toBeNull();
  });

  it('returns null for unknown ancestry', () => {
    expect(getTypicalAncestryCulture('not-a-real-ancestry')).toBeNull();
  });
});
