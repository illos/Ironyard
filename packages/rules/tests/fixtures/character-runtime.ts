import type { Ancestry, Character, HeroClass } from '@ironyard/shared';
import type { ResolvedKit, StaticDataBundle } from '../../src/static-data';

// ── Character fixture ─────────────────────────────────────────────────────────
//
// Minimal "Fury level 1" character for derivation tests. Uses predictable
// values so tests can assert exact numbers.
//
// Adaptation vs. plan: the plan assumed ClassSchema had fields
// `staminaCharacteristicMultiplier`, `staminaCharacteristic`,
// `recoveriesPerLevel`, `heroicResource: { name, floor, max }`, and
// `characteristicSlots`. The actual ClassSchema (packages/shared/src/data/class.ts)
// uses `recoveries` (not `recoveriesPerLevel`), `heroicResource: string` (just the
// name), and derives characteristic slots from the canonical order with
// `lockedCharacteristics`. The fixture and derivation logic are adapted accordingly.

export function buildFuryL1Fixture(overrides: Partial<Character> = {}): Character {
  return {
    level: 1,
    details: {
      pronouns: '',
      age: '',
      height: '',
      build: '',
      eyes: '',
      hair: '',
      skinTone: '',
      physicalFeatures: '',
      physicalFeaturesTexture: '',
    },
    ancestryId: 'human',
    ancestryChoices: {
      traitIds: [],
      freeSkillId: null,
      wyrmplateType: null,
      prismaticScalesType: null,
      formerAncestryId: null,
      previousLifeTraitIds: [],
    },
    culture: {
      customName: '',
      environment: 'urban',
      organization: 'communal',
      upbringing: 'academic',
      environmentSkill: 'streetwise',
      organizationSkill: 'culture',
      upbringingSkill: 'lore',
      language: 'caelian',
      ...overrides.culture,
    },
    careerId: 'soldier',
    careerChoices: {
      skills: ['intimidation'],
      languages: ['khoursirian'],
      incitingIncidentId: 'soldier-1',
      perkId: 'martial',
      ...overrides.careerChoices,
    },
    classId: 'fury',
    // 5 values in canonical order: [might, agility, reason, intuition, presence]
    // For the test class: might=2, agility=1 are "locked" (always 2 in real data,
    // but in the fixture class we treat the array positions directly)
    characteristicArray: overrides.characteristicArray ?? [2, 1, -1, 0, 0],
    characteristicSlots: overrides.characteristicSlots ?? null,
    subclassId: 'berserker',
    levelChoices: overrides.levelChoices ?? {
      '1': { abilityIds: ['fury-rage'], subclassAbilityIds: [], perkId: null, skillId: null },
    },
    kitId: 'wrecker',
    complicationId: null,
    titleId: null,
    inventory: [],
    campaignId: null,
    xp: 0,
    currentStamina: overrides.currentStamina !== undefined ? (overrides.currentStamina as number | null) : null,
    recoveriesUsed: overrides.recoveriesUsed ?? 0,
    victories: overrides.victories ?? 0,
  };
}

// ── Static data bundle fixtures ────────────────────────────────────────────────

export function buildEmptyBundle(): StaticDataBundle {
  return {
    ancestries: new Map(),
    careers: new Map(),
    classes: new Map(),
    kits: new Map(),
    abilities: new Map(),
    items: new Map(),
    titles: new Map(),
  };
}

export function buildBundleWithFury(): StaticDataBundle {
  const bundle = buildEmptyBundle();

  // Minimal class fixture using the ACTUAL ClassSchema field names.
  // Key divergences from plan:
  //   - `recoveries` (not `recoveriesPerLevel`)
  //   - `heroicResource: string` (not `{ name, floor, max }`)
  //   - `lockedCharacteristics: Characteristic[]` (not `characteristicSlots`)
  //   - No `staminaCharacteristic` or `staminaCharacteristicMultiplier`
  //
  // The derivation formula therefore uses:
  //   maxStamina = startingStamina + (level - 1) * staminaPerLevel
  // with no characteristic-based multiplier.
  bundle.classes.set('fury', {
    id: 'fury',
    name: 'Fury',
    description: 'Test fury class',
    lockedCharacteristics: ['might', 'agility'],
    characteristicArrays: [[2, -1, -1]],
    potencyCharacteristic: 'might',
    heroicResource: 'ferocity',
    startingStamina: 21,
    staminaPerLevel: 9,
    recoveries: 10,
    startingSkillsNote: '',
    startingSkillCount: 0,
    startingSkillGroups: [],
    subclassLabel: 'Aspect',
    subclasses: [{ id: 'berserker', name: 'Berserker', description: '', skillGrant: null }],
    levels: Array.from({ length: 10 }, (_, i) => ({
      level: i + 1,
      featureNames: [],
      abilitySlots: [],
      grantsPerk: false,
      grantsSkill: false,
      grantsCharacteristicIncrease: false,
    })),
  } satisfies HeroClass);

  bundle.kits.set('wrecker', {
    id: 'wrecker',
    name: 'Wrecker',
    staminaBonus: 0,
    speedBonus: 0,
    stabilityBonus: 0,
    meleeDamageBonusPerTier: [1, 1, 1],
    rangedDamageBonusPerTier: [0, 0, 0],
    keywords: [],
  } satisfies ResolvedKit);

  return bundle;
}

// ── Ancestry fixture helpers ──────────────────────────────────────────────────

/**
 * Build a minimal Ancestry object with sane defaults.
 * Pass only the fields you care about; the rest are filled in.
 */
export function buildAncestry(overrides: Partial<Ancestry> & { id: string }): Ancestry {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    description: overrides.description ?? '',
    signatureTrait: overrides.signatureTrait ?? { name: 'Test Trait', description: '' },
    purchasedTraits: overrides.purchasedTraits ?? [],
    ancestryPoints: overrides.ancestryPoints ?? 3,
    defaultSize: overrides.defaultSize ?? '1M',
    defaultSpeed: overrides.defaultSpeed ?? 5,
    grantedImmunities: overrides.grantedImmunities ?? [],
    signatureTraitAbilityId: overrides.signatureTraitAbilityId ?? null,
  };
}

/**
 * Build a StaticDataBundle pre-populated with the given ancestry list.
 * No class or kit is added — the derivation falls back safely.
 */
export function buildBundleWith(ancestries: Ancestry[]): StaticDataBundle {
  const bundle = buildEmptyBundle();
  for (const a of ancestries) {
    bundle.ancestries.set(a.id, a);
  }
  return bundle;
}

/**
 * Build a character with the fury fixture as the base, accepting partial
 * overrides. Useful for ancestry-focused tests that don't care about class.
 */
export function buildCharacter(overrides: Partial<Character> = {}): Character {
  const base = buildFuryL1Fixture(overrides);
  return { ...base, ...overrides };
}
