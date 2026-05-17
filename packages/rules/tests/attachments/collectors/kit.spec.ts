import { CharacterSchema } from '@ironyard/shared';
import { describe, expect, it } from 'vitest';
import { collectFromKit } from '../../../src/attachments/collectors/kit';
import type { StaticDataBundle } from '../../../src/static-data';

// Minimal kit shape the collector needs; the rest of the StaticDataBundle is unused.
function bundleWith(kit: {
  id: string;
  staminaBonus?: number;
  speedBonus?: number;
  stabilityBonus?: number;
  meleeDamageBonusPerTier?: [number, number, number];
  rangedDamageBonusPerTier?: [number, number, number];
  meleeDistanceBonus?: number;
  rangedDistanceBonus?: number;
  disengageBonus?: number;
  signatureAbilityId?: string | null;
}): StaticDataBundle {
  return {
    ancestries: new Map(),
    careers: new Map(),
    classes: new Map(),
    kits: new Map([
      [
        kit.id,
        {
          id: kit.id,
          name: kit.id,
          description: '',
          raw: '',
          staminaBonus: kit.staminaBonus ?? 0,
          speedBonus: kit.speedBonus ?? 0,
          stabilityBonus: kit.stabilityBonus ?? 0,
          meleeDamageBonusPerTier: kit.meleeDamageBonusPerTier ?? [0, 0, 0],
          rangedDamageBonusPerTier: kit.rangedDamageBonusPerTier ?? [0, 0, 0],
          meleeDistanceBonus: kit.meleeDistanceBonus ?? 0,
          rangedDistanceBonus: kit.rangedDistanceBonus ?? 0,
          disengageBonus: kit.disengageBonus ?? 0,
          signatureAbilityId: kit.signatureAbilityId ?? null,
          keywords: [],
        },
      ],
    ]),
    abilities: new Map(),
    items: new Map(),
    titles: new Map(),
  } as unknown as StaticDataBundle;
}

describe('collectFromKit — signature ability', () => {
  it('emits a grant-ability attachment for the kit signature ability', () => {
    const bundle = bundleWith({
      id: 'mountain',
      signatureAbilityId: 'mountain-pain-for-pain',
    });
    const char = CharacterSchema.parse({ kitId: 'mountain' });
    const out = collectFromKit(char, bundle);
    expect(out).toContainEqual({
      source: { kind: 'kit', id: 'mountain.signature' },
      effect: { kind: 'grant-ability', abilityId: 'mountain-pain-for-pain' },
    });
  });

  it('emits nothing when the kit has no signature ability', () => {
    const bundle = bundleWith({ id: 'plain', signatureAbilityId: null });
    const char = CharacterSchema.parse({ kitId: 'plain' });
    const out = collectFromKit(char, bundle);
    expect(out.filter((a) => a.effect.kind === 'grant-ability')).toHaveLength(0);
  });

  it('emits nothing when the character has no kit', () => {
    const bundle = bundleWith({ id: 'mountain', signatureAbilityId: 'x' });
    const char = CharacterSchema.parse({ kitId: null });
    const out = collectFromKit(char, bundle);
    expect(out).toEqual([]);
  });
});

// Slice 10 / Phase 2b Group A+B (2b.3): kit distance + disengage bonuses
// flow into CharacterRuntime via attachment effects. Applier folds the
// per-slot deltas; StartEncounter snapshots them onto the participant.
describe('collectFromKit — distance + disengage bonuses', () => {
  it('emits weapon-distance-bonus melee when meleeDistanceBonus > 0', () => {
    const bundle = bundleWith({ id: 'guisarmier', meleeDistanceBonus: 1 });
    const char = CharacterSchema.parse({ kitId: 'guisarmier' });
    const out = collectFromKit(char, bundle);
    expect(out).toContainEqual({
      source: { kind: 'kit', id: 'guisarmier.melee-distance-bonus' },
      effect: { kind: 'weapon-distance-bonus', appliesTo: 'melee', delta: 1 },
    });
  });

  it('emits weapon-distance-bonus ranged when rangedDistanceBonus > 0', () => {
    const bundle = bundleWith({ id: 'arcane-archer', rangedDistanceBonus: 10 });
    const char = CharacterSchema.parse({ kitId: 'arcane-archer' });
    const out = collectFromKit(char, bundle);
    expect(out).toContainEqual({
      source: { kind: 'kit', id: 'arcane-archer.ranged-distance-bonus' },
      effect: { kind: 'weapon-distance-bonus', appliesTo: 'ranged', delta: 10 },
    });
  });

  it('emits disengage-bonus when disengageBonus > 0', () => {
    const bundle = bundleWith({ id: 'whirlwind', disengageBonus: 1 });
    const char = CharacterSchema.parse({ kitId: 'whirlwind' });
    const out = collectFromKit(char, bundle);
    expect(out).toContainEqual({
      source: { kind: 'kit', id: 'whirlwind.disengage-bonus' },
      effect: { kind: 'disengage-bonus', delta: 1 },
    });
  });

  it('emits all three when all three bonuses are non-zero', () => {
    const bundle = bundleWith({
      id: 'arcane-archer',
      rangedDistanceBonus: 10,
      disengageBonus: 1,
    });
    const char = CharacterSchema.parse({ kitId: 'arcane-archer' });
    const out = collectFromKit(char, bundle);
    const distanceEffects = out.filter((a) => a.effect.kind === 'weapon-distance-bonus');
    const disengageEffects = out.filter((a) => a.effect.kind === 'disengage-bonus');
    expect(distanceEffects).toHaveLength(1);
    expect(disengageEffects).toHaveLength(1);
  });

  it('emits no distance or disengage effects when all are zero (Mountain)', () => {
    const bundle = bundleWith({ id: 'mountain' });
    const char = CharacterSchema.parse({ kitId: 'mountain' });
    const out = collectFromKit(char, bundle);
    expect(out.filter((a) => a.effect.kind === 'weapon-distance-bonus')).toHaveLength(0);
    expect(out.filter((a) => a.effect.kind === 'disengage-bonus')).toHaveLength(0);
  });
});
