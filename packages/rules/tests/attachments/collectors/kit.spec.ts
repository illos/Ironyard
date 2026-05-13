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
