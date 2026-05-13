import { describe, expect, it } from 'vitest';
import { KitFileSchema, KitSchema } from '../src/data/kit';

describe('KitSchema', () => {
  it('parses a kit with all required fields', () => {
    const k = KitSchema.parse({
      id: 'mountain',
      name: 'Mountain',
      staminaBonus: 9,
      stabilityBonus: 2,
      meleeDamageBonusPerTier: [0, 0, 4],
    });
    expect(k.id).toBe('mountain');
    expect(k.staminaBonus).toBe(9);
    expect(k.speedBonus).toBe(0); // default
    expect(k.signatureAbilityId).toBeNull(); // default
    expect(k.keywords).toEqual([]); // default
    expect(k.meleeDamageBonusPerTier).toEqual([0, 0, 4]);
    expect(k.rangedDamageBonusPerTier).toEqual([0, 0, 0]); // default
  });

  it('accepts keywords and signatureAbilityId', () => {
    const k = KitSchema.parse({
      id: 'mountain',
      name: 'Mountain',
      keywords: ['heavy-weapon', 'heavy-armor'],
      signatureAbilityId: 'mountain-pain-for-pain',
    });
    expect(k.keywords).toEqual(['heavy-weapon', 'heavy-armor']);
    expect(k.signatureAbilityId).toBe('mountain-pain-for-pain');
  });
});

describe('KitFileSchema', () => {
  it('parses an envelope with kits array', () => {
    const f = KitFileSchema.parse({
      version: '1.0',
      generatedAt: 0,
      count: 1,
      kits: [{ id: 'mountain', name: 'Mountain' }],
    });
    expect(f.count).toBe(1);
    expect(f.kits[0]?.id).toBe('mountain');
  });
});
