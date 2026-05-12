import { describe, expect, it } from 'vitest';
import { AbilitySchema, AbilityFileSchema } from '../src/data/ability';

describe('AbilitySchema — PC extensions', () => {
  it('still parses a monster ability (no PC fields)', () => {
    const a = AbilitySchema.parse({
      name: 'Goblin Stab',
      type: 'action',
      keywords: ['Strike'],
      distance: 'Melee 1',
      target: 'One creature',
      raw: 'Goblin Stab\n\nPower Roll +0\n- ≤11: 2 damage',
    });
    expect(a.name).toBe('Goblin Stab');
    // PC fields default to null/false:
    expect(a.cost).toBeNull();
    expect(a.tier).toBeNull();
    expect(a.isSubclass).toBe(false);
    expect(a.sourceClassId).toBeNull();
  });

  it('parses a PC ability with cost, tier, isSubclass, sourceClassId', () => {
    const a = AbilitySchema.parse({
      name: 'Whirlwind',
      type: 'action',
      keywords: ['Strike', 'Magic'],
      distance: 'Melee 1',
      target: 'Each enemy adjacent',
      raw: '...',
      cost: 5,
      tier: 1,
      isSubclass: false,
      sourceClassId: 'fury',
    });
    expect(a.cost).toBe(5);
    expect(a.sourceClassId).toBe('fury');
  });
});

describe('AbilityFileSchema', () => {
  it('parses an envelope with abilities array', () => {
    const f = AbilityFileSchema.parse({
      version: '1.0',
      generatedAt: 0,
      count: 1,
      abilities: [{ name: 'Stab', type: 'action', distance: '', target: '', raw: '' }],
    });
    expect(f.count).toBe(1);
  });
});
