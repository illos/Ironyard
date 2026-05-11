import { describe, expect, it } from 'vitest';
import { deriveCharacterRuntime } from '../src/derive-character-runtime';
import type { StaticDataBundle } from '../src/static-data';
import { buildBundleWithFury, buildFuryL1Fixture } from './fixtures/character-runtime';

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
    // Fixture: startingStamina=18, staminaPerLevel=12, level=1, kitStaminaBonus=0
    // Expected: 18 + 0 * 12 + 0 = 18
    const char = buildFuryL1Fixture({ characteristicArray: [2, 1, -1, 0, 0] });
    const r = deriveCharacterRuntime(char, bundle);
    expect(r.maxStamina).toBe(18);
  });

  it('recoveries max = class.recoveries (8 for the test fixture)', () => {
    const char = buildFuryL1Fixture({ characteristicArray: [2, 1, -1, 0, 0] });
    const r = deriveCharacterRuntime(char, bundle);
    expect(r.recoveriesMax).toBe(8);
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
});
