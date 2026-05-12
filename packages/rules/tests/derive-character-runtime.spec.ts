import { describe, expect, it } from 'vitest';
import { deriveCharacterRuntime } from '../src/derive-character-runtime';
import type { StaticDataBundle } from '../src/static-data';
import {
  buildAncestry,
  buildBundleWith,
  buildBundleWithFury,
  buildCharacter,
  buildEmptyBundle,
  buildFuryL1Fixture,
} from './fixtures/character-runtime';

// Adaptation note: the plan assumed ClassSchema fields that don't match the
// actual schema (e.g. `recoveriesPerLevel`, `heroicResource: { name, floor, max }`,
// `staminaCharacteristic`). These tests use the actual schema shape:
//   - maxStamina = startingStamina + (level - 1) * staminaPerLevel  (no char multiplier)
//   - recoveriesMax = class.recoveries  (not `recoveriesPerLevel`)
//   - heroicResource.name read from class.heroicResource string

describe('deriveCharacterRuntime', () => {
  const bundle: StaticDataBundle = buildBundleWithFury();

  it('produces the characteristics map from characteristicArray (canonical order)', () => {
    const char = buildFuryL1Fixture({ characteristicArray: [2, 1, -1, 0, 0] });
    const r = deriveCharacterRuntime(char, bundle);
    // canonical order: might, agility, reason, intuition, presence
    expect(r.characteristics.might).toBe(2);
    expect(r.characteristics.agility).toBe(1);
    expect(r.characteristics.reason).toBe(-1);
    expect(r.characteristics.intuition).toBe(0);
    expect(r.characteristics.presence).toBe(0);
  });

  it('computes maxStamina = startingStamina + (level - 1) * staminaPerLevel + kit staminaBonus', () => {
    // Fixture matches canon Fury values: startingStamina=21, staminaPerLevel=9,
    // level=1, kitStaminaBonus=0. Expected: 21 + 0 * 9 + 0 = 21.
    const char = buildFuryL1Fixture({ characteristicArray: [2, 1, -1, 0, 0] });
    const r = deriveCharacterRuntime(char, bundle);
    expect(r.maxStamina).toBe(21);
  });

  it('recoveries max = class.recoveries (10 for Fury per canon §9.3)', () => {
    const char = buildFuryL1Fixture({ characteristicArray: [2, 1, -1, 0, 0] });
    const r = deriveCharacterRuntime(char, bundle);
    expect(r.recoveriesMax).toBe(10);
  });

  it('recoveryValue = floor(maxStamina / 3)', () => {
    const char = buildFuryL1Fixture({ characteristicArray: [2, 1, -1, 0, 0] });
    const r = deriveCharacterRuntime(char, bundle);
    expect(r.recoveryValue).toBe(Math.floor(r.maxStamina / 3));
  });

  it('flattens skills from culture + career + per-level picks', () => {
    const char = buildFuryL1Fixture({
      culture: {
        customName: '',
        environment: 'urban',
        organization: 'communal',
        upbringing: 'academic',
        environmentSkill: 'streetwise',
        organizationSkill: 'culture',
        upbringingSkill: 'lore',
        language: 'caelian',
      },
      careerChoices: {
        skills: ['intimidation'],
        languages: ['khoursirian'],
        incitingIncidentId: 'soldier-1',
        perkId: 'martial',
      },
      levelChoices: {
        '1': {
          abilityIds: ['fury-rage'],
          subclassAbilityIds: [],
          perkId: null,
          skillId: 'athletics',
        },
      },
    });
    const r = deriveCharacterRuntime(char, bundle);
    expect(r.skills).toEqual(
      expect.arrayContaining(['streetwise', 'culture', 'lore', 'intimidation', 'athletics']),
    );
  });

  it('flattens languages from culture + career', () => {
    const char = buildFuryL1Fixture({
      culture: {
        customName: '',
        environment: 'urban',
        organization: 'communal',
        upbringing: 'academic',
        environmentSkill: 'streetwise',
        organizationSkill: 'culture',
        upbringingSkill: 'lore',
        language: 'caelian',
      },
      careerChoices: {
        skills: ['intimidation'],
        languages: ['khoursirian', 'illyrian'],
        incitingIncidentId: 'soldier-1',
        perkId: 'martial',
      },
    });
    const r = deriveCharacterRuntime(char, bundle);
    expect(r.languages).toEqual(expect.arrayContaining(['caelian', 'khoursirian', 'illyrian']));
  });

  it('returns the heroic resource name from the class', () => {
    const char = buildFuryL1Fixture({});
    const r = deriveCharacterRuntime(char, bundle);
    // ClassSchema.heroicResource is a plain string — fixture uses 'ferocity'
    expect(r.heroicResource.name).toBe('ferocity');
    expect(r.heroicResource.floor).toBe(0);
  });

  it('returns safe zero defaults when classId is null and the bundle is empty', () => {
    const empty = buildEmptyBundle();
    const charNoClass = buildFuryL1Fixture();
    // Force the character into an unset-class state
    charNoClass.classId = null;
    charNoClass.kitId = null;
    charNoClass.ancestryId = null;
    // Characteristics come from the stored array, not the class; clear the
    // array to represent a character that hasn't assigned characteristics yet.
    charNoClass.characteristicArray = [0, 0, 0, 0, 0];

    const r = deriveCharacterRuntime(charNoClass, empty);
    expect(r.maxStamina).toBe(0);
    expect(r.recoveriesMax).toBe(0);
    expect(r.recoveryValue).toBe(0);
    expect(r.characteristics.might).toBe(0);
    expect(r.characteristics.agility).toBe(0);
    // Function should not throw
  });
});

// ── Ancestry-driven derivation tests ─────────────────────────────────────────

describe('deriveCharacterRuntime — ancestry size derivation', () => {
  it('uses defaultSize from the ancestry', () => {
    const polder = buildAncestry({ id: 'polder', defaultSize: '1S' });
    const char = buildCharacter({ ancestryId: 'polder' });
    const r = deriveCharacterRuntime(char, buildBundleWith([polder]));
    expect(r.size).toBe('1S');
  });

  it('falls back to 1M when ancestry has no override (default is 1M)', () => {
    const human = buildAncestry({ id: 'human' }); // defaultSize: '1M' via default
    const char = buildCharacter({ ancestryId: 'human' });
    const r = deriveCharacterRuntime(char, buildBundleWith([human]));
    expect(r.size).toBe('1M');
  });

  it('revenant uses former ancestry size', () => {
    const polder = buildAncestry({ id: 'polder', defaultSize: '1S' });
    const revenant = buildAncestry({ id: 'revenant' }); // defaultSize: '1M'
    const char = buildCharacter({
      ancestryId: 'revenant',
      ancestryChoices: {
        traitIds: [],
        formerAncestryId: 'polder',
        previousLifeTraitIds: [],
        freeSkillId: null,
        wyrmplateType: null,
        prismaticScalesType: null,
      },
    });
    const r = deriveCharacterRuntime(char, buildBundleWith([revenant, polder]));
    expect(r.size).toBe('1S');
  });

  it('revenant size 1M when former life not chosen', () => {
    const revenant = buildAncestry({ id: 'revenant' });
    const char = buildCharacter({ ancestryId: 'revenant' });
    const r = deriveCharacterRuntime(char, buildBundleWith([revenant]));
    expect(r.size).toBe('1M');
  });

  it('falls back to 1M when ancestry is not in the bundle', () => {
    const char = buildCharacter({ ancestryId: 'unknown-ancestry' });
    const r = deriveCharacterRuntime(char, buildBundleWith([]));
    expect(r.size).toBe('1M');
  });

  it('size is 1M when ancestryId is null', () => {
    const char = buildCharacter({ ancestryId: null });
    const r = deriveCharacterRuntime(char, buildBundleWith([]));
    expect(r.size).toBe('1M');
  });
});

describe('deriveCharacterRuntime — ancestry speed derivation', () => {
  it('uses ancestry defaultSpeed', () => {
    const tortoise = buildAncestry({ id: 'tortoise', defaultSpeed: 3 });
    const char = buildCharacter({ ancestryId: 'tortoise' });
    expect(deriveCharacterRuntime(char, buildBundleWith([tortoise])).speed).toBe(3);
  });

  it('revenant speed is always 5 regardless of former ancestry', () => {
    const slow = buildAncestry({ id: 'slow', defaultSpeed: 3 });
    const revenant = buildAncestry({ id: 'revenant', defaultSpeed: 5 });
    const char = buildCharacter({
      ancestryId: 'revenant',
      ancestryChoices: {
        traitIds: [],
        formerAncestryId: 'slow',
        previousLifeTraitIds: [],
        freeSkillId: null,
        wyrmplateType: null,
        prismaticScalesType: null,
      },
    });
    expect(deriveCharacterRuntime(char, buildBundleWith([revenant, slow])).speed).toBe(5);
  });

  it('falls back to speed 5 when ancestryId is null', () => {
    const char = buildCharacter({ ancestryId: null });
    expect(deriveCharacterRuntime(char, buildBundleWith([])).speed).toBe(5);
  });

  it('falls back to speed 5 when ancestry is not in the bundle', () => {
    const char = buildCharacter({ ancestryId: 'ghost' });
    expect(deriveCharacterRuntime(char, buildBundleWith([])).speed).toBe(5);
  });
});

describe('deriveCharacterRuntime — ancestry immunities', () => {
  it('time raider gets psychic immunity equal to level', () => {
    const tr = buildAncestry({
      id: 'time-raider',
      grantedImmunities: [{ kind: 'psychic', value: 'level' }],
    });
    const char = buildCharacter({ ancestryId: 'time-raider', level: 3 });
    const r = deriveCharacterRuntime(char, buildBundleWith([tr]));
    expect(r.immunities).toContainEqual({ kind: 'psychic', value: 3 });
  });

  it('resolves a numeric immunity value without scaling', () => {
    const rocky = buildAncestry({
      id: 'rocky',
      grantedImmunities: [{ kind: 'fire', value: 2 }],
    });
    const char = buildCharacter({ ancestryId: 'rocky', level: 5 });
    const r = deriveCharacterRuntime(char, buildBundleWith([rocky]));
    expect(r.immunities).toContainEqual({ kind: 'fire', value: 2 });
  });

  it('revenant does NOT inherit immunities from its former ancestry', () => {
    const immuneAncestry = buildAncestry({
      id: 'fire-born',
      grantedImmunities: [{ kind: 'fire', value: 'level' }],
    });
    const revenant = buildAncestry({ id: 'revenant', grantedImmunities: [] });
    const char = buildCharacter({
      ancestryId: 'revenant',
      level: 3,
      ancestryChoices: {
        traitIds: [],
        formerAncestryId: 'fire-born',
        previousLifeTraitIds: [],
        freeSkillId: null,
        wyrmplateType: null,
        prismaticScalesType: null,
      },
    });
    const r = deriveCharacterRuntime(char, buildBundleWith([revenant, immuneAncestry]));
    expect(r.immunities).toHaveLength(0);
  });

  it('dragon-knight Wyrmplate adds the chosen damage type at level value', () => {
    const dk = buildAncestry({ id: 'dragon-knight' });
    const char = buildCharacter({
      ancestryId: 'dragon-knight',
      level: 4,
      ancestryChoices: {
        traitIds: [],
        formerAncestryId: null,
        previousLifeTraitIds: [],
        freeSkillId: null,
        wyrmplateType: 'fire',
        prismaticScalesType: null,
      },
    });
    const r = deriveCharacterRuntime(char, buildBundleWith([dk]));
    expect(r.immunities).toContainEqual({ kind: 'fire', value: 4 });
  });

  it('dragon-knight Prismatic Scales adds a second immunity', () => {
    const dk = buildAncestry({ id: 'dragon-knight' });
    const char = buildCharacter({
      ancestryId: 'dragon-knight',
      level: 4,
      ancestryChoices: {
        traitIds: ['prismatic-scales'],
        formerAncestryId: null,
        previousLifeTraitIds: [],
        freeSkillId: null,
        wyrmplateType: 'fire',
        prismaticScalesType: 'cold',
      },
    });
    const r = deriveCharacterRuntime(char, buildBundleWith([dk]));
    expect(r.immunities).toContainEqual({ kind: 'fire', value: 4 });
    expect(r.immunities).toContainEqual({ kind: 'cold', value: 4 });
  });

  it('dragon-knight with no wyrmplateType has no ancestry immunities', () => {
    const dk = buildAncestry({ id: 'dragon-knight' });
    const char = buildCharacter({
      ancestryId: 'dragon-knight',
      level: 2,
      ancestryChoices: {
        traitIds: [],
        formerAncestryId: null,
        previousLifeTraitIds: [],
        freeSkillId: null,
        wyrmplateType: null,
        prismaticScalesType: null,
      },
    });
    const r = deriveCharacterRuntime(char, buildBundleWith([dk]));
    expect(r.immunities).toHaveLength(0);
  });

  it('ancestry with no grantedImmunities produces an empty immunities list', () => {
    const human = buildAncestry({ id: 'human' });
    const char = buildCharacter({ ancestryId: 'human' });
    const r = deriveCharacterRuntime(char, buildBundleWith([human]));
    expect(r.immunities).toHaveLength(0);
  });
});
