import { describe, expect, it } from 'vitest';
import {
  CharacterSchema,
  CompleteCharacterSchema,
  CreateCharacterRequestSchema,
} from '../src/character';

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
