import { describe, expect, it } from 'vitest';
import {
  EncounterTemplateDataSchema,
  EncounterTemplateEntrySchema,
  EncounterTemplateSchema,
} from '../../src/schemas/encounter-template';

describe('EncounterTemplateEntrySchema', () => {
  it('accepts a valid entry', () => {
    const result = EncounterTemplateEntrySchema.safeParse({
      monsterId: 'goblin-warrior-1',
      quantity: 3,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid entry with nameOverride', () => {
    const result = EncounterTemplateEntrySchema.safeParse({
      monsterId: 'goblin-sniper-1',
      quantity: 1,
      nameOverride: 'Goblin Sniper Alpha',
    });
    expect(result.success).toBe(true);
  });

  it('rejects quantity = 0', () => {
    const result = EncounterTemplateEntrySchema.safeParse({
      monsterId: 'goblin-warrior-1',
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects quantity above cap (51)', () => {
    const result = EncounterTemplateEntrySchema.safeParse({
      monsterId: 'goblin-warrior-1',
      quantity: 51,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty monsterId', () => {
    const result = EncounterTemplateEntrySchema.safeParse({
      monsterId: '',
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('EncounterTemplateDataSchema', () => {
  it('accepts valid data with monsters and notes', () => {
    const result = EncounterTemplateDataSchema.safeParse({
      monsters: [{ monsterId: 'goblin-warrior-1', quantity: 4 }],
      notes: 'They are hiding behind barrels.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty monster array', () => {
    const result = EncounterTemplateDataSchema.safeParse({ monsters: [] });
    expect(result.success).toBe(true);
  });

  it('accepts data without optional notes', () => {
    const result = EncounterTemplateDataSchema.safeParse({
      monsters: [{ monsterId: 'goblin-warrior-1', quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });
});

describe('EncounterTemplateSchema', () => {
  const validTemplate = {
    id: '01HWZXXXXXXXXXXXXXXXXXX',
    campaignId: '01HWZXXXXXXXXXXXXXXXXXY',
    name: 'Goblin Patrol',
    data: {
      monsters: [
        { monsterId: 'goblin-warrior-1', quantity: 6 },
        { monsterId: 'goblin-sniper-1', quantity: 1, nameOverride: 'Goblin Sniper Alpha' },
      ],
      notes: 'Patrolling the entrance.',
    },
    createdAt: 1715000000000,
    updatedAt: 1715000000000,
  };

  it('accepts a valid template', () => {
    const result = EncounterTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  it('rejects when an entry has quantity = 0', () => {
    const result = EncounterTemplateSchema.safeParse({
      ...validTemplate,
      data: {
        monsters: [{ monsterId: 'goblin-warrior-1', quantity: 0 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects when an entry has quantity above cap', () => {
    const result = EncounterTemplateSchema.safeParse({
      ...validTemplate,
      data: {
        monsters: [{ monsterId: 'goblin-warrior-1', quantity: 51 }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const { name: _name, ...rest } = validTemplate;
    const result = EncounterTemplateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects negative createdAt', () => {
    const result = EncounterTemplateSchema.safeParse({
      ...validTemplate,
      createdAt: -1,
    });
    expect(result.success).toBe(false);
  });
});
