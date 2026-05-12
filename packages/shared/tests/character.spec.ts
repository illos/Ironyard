import { describe, expect, it } from 'vitest';
import {
  CharacterSchema,
  CompleteCharacterSchema,
  CreateCharacterRequestSchema,
} from '../src/character';
import { InventoryEntrySchema } from '../src';

describe('CharacterSchema (draft)', () => {
  it('accepts an empty default character', () => {
    const parsed = CharacterSchema.parse({});
    expect(parsed.level).toBe(1);
    expect(parsed.ancestryId).toBeNull();
    expect(parsed.xp).toBe(0);
  });
});

describe('CompleteCharacterSchema (submission gate)', () => {
  const validCharacter = {
    level: 1,
    ancestryId: 'human',
    ancestryChoices: { traitIds: [] },
    culture: {
      customName: '',
      environment: 'urban',
      organization: 'communal',
      upbringing: 'academic',
      environmentSkill: 'streetwise',
      organizationSkill: 'culture',
      upbringingSkill: 'lore',
      language: 'caelian-court',
    },
    careerId: 'soldier',
    careerChoices: {
      skills: ['intimidation'],
      languages: ['khoursirian'],
      incitingIncidentId: 'soldier-1',
      perkId: 'martial',
    },
    classId: 'fury',
    characteristicArray: [2, 2, 0, -1, 0],
    characteristicSlots: { reason: 0, intuition: -1, presence: 0 },
    subclassId: 'berserker',
    levelChoices: {
      '1': { abilityIds: ['fury-rage'], subclassAbilityIds: [], perkId: null, skillId: null },
    },
    kitId: 'wrecker',
    complicationId: null,
    campaignId: null,
    xp: 0,
    details: {},
  };

  it('accepts a complete character', () => {
    expect(CompleteCharacterSchema.safeParse(validCharacter).success).toBe(true);
  });

  it('rejects a character missing ancestryId', () => {
    const r = CompleteCharacterSchema.safeParse({ ...validCharacter, ancestryId: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('ancestryId'))).toBe(true);
  });

  it('rejects a character missing classId', () => {
    const r = CompleteCharacterSchema.safeParse({ ...validCharacter, classId: null });
    expect(r.success).toBe(false);
  });

  it('rejects a character missing characteristicArray', () => {
    const r = CompleteCharacterSchema.safeParse({ ...validCharacter, characteristicArray: null });
    expect(r.success).toBe(false);
  });

  it('rejects a character whose levelChoices does not cover level N', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...validCharacter,
      level: 3,
      levelChoices: { '1': validCharacter.levelChoices['1'] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects a character missing culture aspects', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...validCharacter,
      culture: { ...validCharacter.culture, environment: null },
    });
    expect(r.success).toBe(false);
  });
});

describe('CompleteCharacterSchema — per-ancestry refinements', () => {
  // Build a complete base character (human) to override per test.
  const base = {
    level: 1,
    ancestryId: 'human',
    ancestryChoices: { traitIds: [] },
    culture: {
      customName: '',
      environment: 'urban',
      organization: 'communal',
      upbringing: 'academic',
      environmentSkill: 'streetwise',
      organizationSkill: 'culture',
      upbringingSkill: 'lore',
      language: 'caelian-court',
    },
    careerId: 'soldier',
    careerChoices: {
      skills: ['intimidation'],
      languages: ['khoursirian'],
      incitingIncidentId: 'soldier-1',
      perkId: 'martial',
    },
    classId: 'fury',
    characteristicArray: [2, 2, 0, -1, 0],
    characteristicSlots: { reason: 0, intuition: -1, presence: 0 },
    subclassId: 'berserker',
    levelChoices: {
      '1': { abilityIds: ['fury-rage'], subclassAbilityIds: [], perkId: null, skillId: null },
    },
    kitId: 'wrecker',
    complicationId: null,
    campaignId: null,
    xp: 0,
    details: {},
  };

  // ── Devil ──────────────────────────────────────────────────────────────────

  it('rejects devil without freeSkillId', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'devil',
      ancestryChoices: { traitIds: [], freeSkillId: null },
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(
        r.error.issues.some((i) => i.path.includes('freeSkillId')),
      ).toBe(true);
  });

  it('accepts devil with freeSkillId', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'devil',
      ancestryChoices: { traitIds: [], freeSkillId: 'persuade' },
    });
    expect(r.success).toBe(true);
  });

  // ── Dragon Knight ──────────────────────────────────────────────────────────

  it('rejects dragon-knight without wyrmplateType', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'dragon-knight',
      ancestryChoices: { traitIds: [], wyrmplateType: null },
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(
        r.error.issues.some((i) => i.path.includes('wyrmplateType')),
      ).toBe(true);
  });

  it('accepts dragon-knight with wyrmplateType', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'dragon-knight',
      ancestryChoices: { traitIds: [], wyrmplateType: 'fire' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects dragon-knight + prismatic-scales without prismaticScalesType', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'dragon-knight',
      ancestryChoices: {
        traitIds: ['prismatic-scales'],
        wyrmplateType: 'fire',
        prismaticScalesType: null,
      },
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(
        r.error.issues.some((i) => i.path.includes('prismaticScalesType')),
      ).toBe(true);
  });

  it('accepts dragon-knight + prismatic-scales with both types chosen', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'dragon-knight',
      ancestryChoices: {
        traitIds: ['prismatic-scales'],
        wyrmplateType: 'fire',
        prismaticScalesType: 'cold',
      },
    });
    expect(r.success).toBe(true);
  });

  // ── Revenant ───────────────────────────────────────────────────────────────

  it('rejects revenant without formerAncestryId', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'revenant',
      ancestryChoices: { traitIds: [], formerAncestryId: null, previousLifeTraitIds: [] },
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(
        r.error.issues.some((i) => i.path.includes('formerAncestryId')),
      ).toBe(true);
  });

  it('accepts revenant with formerAncestryId and no previous-life slots', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'revenant',
      ancestryChoices: {
        traitIds: [],
        formerAncestryId: 'orc',
        previousLifeTraitIds: [],
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects revenant with 2 previous-life slots but only 1 resolved trait', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'revenant',
      ancestryChoices: {
        traitIds: ['previous-life-1-point', 'previous-life-2-points'],
        formerAncestryId: 'orc',
        previousLifeTraitIds: ['bloodfire-rush'], // only 1 entry for 2 slots
      },
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(
        r.error.issues.some((i) => i.path.includes('previousLifeTraitIds')),
      ).toBe(true);
  });

  it('accepts revenant with matching slots and resolved trait ids', () => {
    const r = CompleteCharacterSchema.safeParse({
      ...base,
      ancestryId: 'revenant',
      ancestryChoices: {
        traitIds: ['previous-life-1-point', 'previous-life-2-points'],
        formerAncestryId: 'orc',
        previousLifeTraitIds: ['bloodfire-rush', 'glowing-recovery'],
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('InventoryEntrySchema', () => {
  it('parses an entry with defaults', () => {
    const e = InventoryEntrySchema.parse({ itemId: 'healing-potion' });
    expect(e.quantity).toBe(1);
    expect(e.equipped).toBe(false);
  });

  it('parses an entry with quantity > 1 for consumables', () => {
    const e = InventoryEntrySchema.parse({ itemId: 'healing-potion', quantity: 3 });
    expect(e.quantity).toBe(3);
  });

  it('parses an equipped entry', () => {
    const e = InventoryEntrySchema.parse({ itemId: 'flaming-sword', equipped: true });
    expect(e.equipped).toBe(true);
  });
});

describe('CharacterSchema.inventory', () => {
  it('defaults to empty array', () => {
    const c = CharacterSchema.parse({});
    expect(c.inventory).toEqual([]);
  });

  it('accepts inventory entries', () => {
    const c = CharacterSchema.parse({
      inventory: [{ itemId: 'healing-potion', quantity: 2 }],
    });
    expect(c.inventory.length).toBe(1);
    expect(c.inventory[0]?.quantity).toBe(2);
  });
});

describe('CreateCharacterRequestSchema', () => {
  it('accepts name only', () => {
    expect(CreateCharacterRequestSchema.parse({ name: 'Ash' })).toBeDefined();
  });
  it('accepts name + campaignCode', () => {
    const r = CreateCharacterRequestSchema.parse({
      name: 'Ash',
      campaignCode: 'A1B2C3',
    });
    expect(r.campaignCode).toBe('A1B2C3');
  });
  it('accepts name + campaignCode + data', () => {
    const r = CreateCharacterRequestSchema.parse({
      name: 'Ash',
      campaignCode: 'A1B2C3',
      data: { level: 1 },
    });
    expect(r.data?.level).toBe(1);
  });
  it('rejects a campaignCode of the wrong length', () => {
    const r = CreateCharacterRequestSchema.safeParse({
      name: 'Ash',
      campaignCode: 'short',
    });
    expect(r.success).toBe(false);
  });
});
