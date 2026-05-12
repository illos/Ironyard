import { describe, expect, it } from 'vitest';
import { ItemSchema, ItemFileSchema } from '../src/data/item';

describe('ItemSchema', () => {
  it('parses an artifact', () => {
    const i = ItemSchema.parse({
      category: 'artifact',
      id: 'crown-of-tor',
      name: 'Crown of Tor',
    });
    expect(i.category).toBe('artifact');
    expect(i.id).toBe('crown-of-tor');
  });

  it('parses a consumable with echelon and effectKind', () => {
    const i = ItemSchema.parse({
      category: 'consumable',
      id: 'healing-potion',
      name: 'Healing Potion',
      echelon: 1,
      effectKind: 'instant',
    });
    if (i.category !== 'consumable') throw new Error('narrowing failed');
    expect(i.echelon).toBe(1);
    expect(i.effectKind).toBe('instant');
  });

  it('parses a leveled treasure with kitKeyword', () => {
    const i = ItemSchema.parse({
      category: 'leveled-treasure',
      id: 'flaming-sword',
      name: 'Flaming Sword',
      echelon: 2,
      kitKeyword: 'medium-weapon',
    });
    if (i.category !== 'leveled-treasure') throw new Error('narrowing failed');
    expect(i.echelon).toBe(2);
    expect(i.kitKeyword).toBe('medium-weapon');
  });

  it('parses a trinket with bodySlot', () => {
    const i = ItemSchema.parse({
      category: 'trinket',
      id: 'mask-of-oversight',
      name: 'Mask of Oversight',
      bodySlot: 'head',
    });
    if (i.category !== 'trinket') throw new Error('narrowing failed');
    expect(i.bodySlot).toBe('head');
  });

  it('rejects an unknown category', () => {
    expect(() =>
      ItemSchema.parse({ category: 'mystery', id: 'x', name: 'y' }),
    ).toThrow();
  });
});

describe('ItemFileSchema', () => {
  it('parses an envelope with items array', () => {
    const f = ItemFileSchema.parse({
      version: '1.0',
      generatedAt: 0,
      count: 1,
      items: [{ category: 'artifact', id: 'x', name: 'X' }],
    });
    expect(f.count).toBe(1);
  });
});
