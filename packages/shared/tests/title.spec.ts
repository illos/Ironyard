import { describe, expect, it } from 'vitest';
import { TitleSchema, TitleFileSchema } from '../src/data/title';

describe('TitleSchema', () => {
  it('parses a title with echelon', () => {
    const t = TitleSchema.parse({ id: 'knight', name: 'Knight', echelon: 2 });
    expect(t.id).toBe('knight');
    expect(t.echelon).toBe(2);
    expect(t.grantsAbilityId).toBeNull();
  });
  it('accepts grantsAbilityId', () => {
    const t = TitleSchema.parse({
      id: 'knight', name: 'Knight', echelon: 2, grantsAbilityId: 'knightly-challenge',
    });
    expect(t.grantsAbilityId).toBe('knightly-challenge');
  });
  it('rejects echelon outside 1-4', () => {
    expect(() => TitleSchema.parse({ id: 'x', name: 'X', echelon: 5 })).toThrow();
  });
});

describe('TitleFileSchema', () => {
  it('parses an envelope', () => {
    const f = TitleFileSchema.parse({
      version: '1.0', generatedAt: 0, count: 1,
      titles: [{ id: 'knight', name: 'Knight', echelon: 2 }],
    });
    expect(f.count).toBe(1);
  });
});
