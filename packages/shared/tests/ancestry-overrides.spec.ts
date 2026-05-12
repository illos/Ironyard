import { describe, expect, it } from 'vitest';
import { AncestrySchema } from '../src/data/ancestry';

// Minimal valid ancestry payload — all fields that have no schema default.
const BASE_ANCESTRY = {
  id: 'test-ancestry',
  name: 'Test Ancestry',
  description: 'A test ancestry.',
  signatureTrait: {
    name: 'Test Trait',
    description: 'Does something.',
  },
  purchasedTraits: [],
};

describe('AncestrySchema — new fields from Slice 5', () => {
  it('defaults defaultSize to 1M and defaultSpeed to 5', () => {
    const parsed = AncestrySchema.parse(BASE_ANCESTRY);
    expect(parsed.defaultSize).toBe('1M');
    expect(parsed.defaultSpeed).toBe(5);
    expect(parsed.grantedImmunities).toEqual([]);
    expect(parsed.signatureTraitAbilityId).toBeNull();
  });

  it('accepts a Polder override (defaultSize 1S)', () => {
    const parsed = AncestrySchema.parse({ ...BASE_ANCESTRY, defaultSize: '1S' });
    expect(parsed.defaultSize).toBe('1S');
  });

  it('accepts a Hakaan override (defaultSize 1L)', () => {
    const parsed = AncestrySchema.parse({ ...BASE_ANCESTRY, defaultSize: '1L' });
    expect(parsed.defaultSize).toBe('1L');
  });

  it('accepts a custom defaultSpeed', () => {
    const parsed = AncestrySchema.parse({ ...BASE_ANCESTRY, defaultSpeed: 7 });
    expect(parsed.defaultSpeed).toBe(7);
  });

  it('accepts a Time Raider granted immunity with value "level"', () => {
    const parsed = AncestrySchema.parse({
      ...BASE_ANCESTRY,
      grantedImmunities: [{ kind: 'psychic', value: 'level' }],
    });
    expect(parsed.grantedImmunities).toHaveLength(1);
    expect(parsed.grantedImmunities[0]?.kind).toBe('psychic');
    expect(parsed.grantedImmunities[0]?.value).toBe('level');
  });

  it('accepts a granted immunity with a fixed numeric value', () => {
    const parsed = AncestrySchema.parse({
      ...BASE_ANCESTRY,
      grantedImmunities: [{ kind: 'fire', value: 3 }],
    });
    expect(parsed.grantedImmunities[0]?.value).toBe(3);
  });

  it('rejects a granted immunity with an invalid value', () => {
    const result = AncestrySchema.safeParse({
      ...BASE_ANCESTRY,
      grantedImmunities: [{ kind: 'fire', value: 'all' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a signatureTraitAbilityId', () => {
    const parsed = AncestrySchema.parse({
      ...BASE_ANCESTRY,
      signatureTraitAbilityId: 'detect-supernatural',
    });
    expect(parsed.signatureTraitAbilityId).toBe('detect-supernatural');
  });

  it('preserves existing ancestryPoints default of 3', () => {
    const parsed = AncestrySchema.parse(BASE_ANCESTRY);
    expect(parsed.ancestryPoints).toBe(3);
  });
});
